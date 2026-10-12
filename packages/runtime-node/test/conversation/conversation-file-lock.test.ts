import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	acquireConversationFileLock,
	conversationFileLockRetryDelayMs,
} from "../../src/conversation/conversation-file-lock.js";

let dir: string;
let lockPath: string;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "of-lock-"));
	lockPath = join(dir, "s.conversation.jsonl.lock");
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("conversationFileLockRetryDelayMs", () => {
	it("指数退避到上限封顶", () => {
		expect([0, 1, 2, 3, 4, 5, 10].map((attempt) => conversationFileLockRetryDelayMs(attempt, 10, 100))).toEqual([
			10, 20, 40, 80, 100, 100, 100,
		]);
	});
});

describe("acquireConversationFileLock", () => {
	it("获取/释放在无争用时正常往返，内容为 token+pid+时间", async () => {
		const release = await acquireConversationFileLock(lockPath, "s-1", { heartbeatMs: 60_000 });
		const content = await readFile(lockPath, "utf8");
		const [token, pid, acquiredAt] = content.split("\n");
		expect(token.length).toBeGreaterThan(0);
		expect(pid).toBe(String(process.pid));
		expect(Number.isNaN(Date.parse(acquiredAt))).toBe(false);
		await release();
		await expect(stat(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("超时错误带新格式锁文件的持有者 pid 与时间", async () => {
		await writeFile(lockPath, `other-token\n4242\n2026-10-12T00:00:00.000Z`, "utf8");
		await expect(
			acquireConversationFileLock(lockPath, "s-2", { retryCount: 2, retryDelayMs: 5, maxRetryDelayMs: 5 }),
		).rejects.toThrow(/Timed out acquiring conversation file lock: s-2 \(lock held by pid 4242/);
	});

	it("旧格式纯 token 锁文件超时降级为 another process", async () => {
		await writeFile(lockPath, "legacy-token", "utf8");
		await expect(
			acquireConversationFileLock(lockPath, "s-3", { retryCount: 2, retryDelayMs: 5, maxRetryDelayMs: 5 }),
		).rejects.toThrow(/lock held by another process/);
	});

	it("持锁超 staleMs 时心跳刷新 mtime，竞争者不判 stale 抢删", async () => {
		const release = await acquireConversationFileLock(lockPath, "s-4", { heartbeatMs: 15 });
		// 让心跳至少跑两轮，把 mtime 推到 staleMs 窗口内的新鲜值。
		await delay(80);
		const contender = acquireConversationFileLock(lockPath, "s-4", {
			retryCount: 4,
			retryDelayMs: 10,
			maxRetryDelayMs: 10,
			staleMs: 50,
		});
		// 竞争者 stale 阈值 50ms：若无心跳，锁文件 mtime 早已 >50ms 会被抢删；
		// 有心跳它只能重试到超时。锁文件在竞争期间始终属于持有者。
		await expect(contender).rejects.toThrow(/Timed out acquiring conversation file lock/);
		const content = await readFile(lockPath, "utf8");
		expect(content.split("\n")[0].length).toBeGreaterThan(0);
		await release();
		await expect(stat(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("竞争者超时后持有者仍正常释放自己的锁", async () => {
		const release = await acquireConversationFileLock(lockPath, "s-5", { heartbeatMs: 15 });
		await expect(
			acquireConversationFileLock(lockPath, "s-5", {
				retryCount: 2,
				retryDelayMs: 5,
				maxRetryDelayMs: 5,
				staleMs: 60_000,
			}),
		).rejects.toThrow(/Timed out/);
		await release();
		// 持有者释放后同一 sessionId 立即可再获取。
		const release2 = await acquireConversationFileLock(lockPath, "s-5", { retryCount: 3, retryDelayMs: 5 });
		await release2();
	});
});
