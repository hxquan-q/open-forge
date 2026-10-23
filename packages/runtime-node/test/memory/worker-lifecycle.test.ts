// Modified by The Open Forge contributors.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FIXTURE_PROJECT_SCOPE, FIXTURE_USER_SCOPE } from "@vetta/runtime-memory/fixtures";
import { acquireMemoryStoreLease, MEMORY_STORE_ERROR_CODES } from "@vetta/runtime-node/memory";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * TASK-0371 worker 生命周期合同：同路径共享、引用计数、幂等释放、
 * 关闭后的明确错误与再获取。
 */

let workDir: string;
let databasePath: string;

beforeEach(() => {
	workDir = mkdtempSync(join(tmpdir(), "runtime-node-memory-lifecycle-"));
	databasePath = join(workDir, "memory.sqlite");
});

afterEach(async () => {
	// Windows 下 worker 终止后文件句柄释放可能滞后：重试后仍失败则留给系统临时目录回收。
	for (let attempt = 0; attempt < 3; attempt += 1) {
		try {
			rmSync(workDir, { recursive: true, force: true });
			return;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 150));
		}
	}
});

describe("memory worker 引用计数与资源生命周期", () => {
	it("同路径两个 owner 共享 worker 连接，但授权视图分离（BUG-0147/R3）", async () => {
		const leaseA = await acquireMemoryStoreLease({
			databasePath,
			allowedScopes: [FIXTURE_USER_SCOPE],
			owner: "owner-a",
		});
		const leaseB = await acquireMemoryStoreLease({
			databasePath,
			allowedScopes: [FIXTURE_PROJECT_SCOPE],
			owner: "owner-b",
		});
		// 后开的 B 不再继承 A 的授权：访问 A 的 user scope 被拒绝。
		await expect(leaseB.store.read(FIXTURE_USER_SCOPE, { asOf: "2030-01-01T00:00:00Z" })).rejects.toMatchObject({
			code: "SCOPE_NOT_ALLOWED",
		});

		await leaseA.store.write(FIXTURE_USER_SCOPE, {
			action: "remember",
			content: "A 的全局偏好",
			kind: "preference",
			scopeName: "user",
		});

		await leaseA.release();
		// B 仍持有：连接仍可用，且读不到 A 的 user 记忆。
		const effective = await leaseB.store.read(FIXTURE_PROJECT_SCOPE, { asOf: "2030-01-01T00:00:00Z" });
		expect(effective).toEqual([]);

		await leaseB.release();
		// 全释放后：操作明确失败而不是悬挂。
		await expect(leaseB.store.read(FIXTURE_PROJECT_SCOPE, { asOf: "2030-01-01T00:00:00Z" })).rejects.toMatchObject({
			code: MEMORY_STORE_ERROR_CODES.STORE_CLOSED,
		});
	});

	it("同一 owner 重复释放幂等；重复计数正确递减", async () => {
		const lease1 = await acquireMemoryStoreLease({
			databasePath,
			allowedScopes: [FIXTURE_PROJECT_SCOPE],
			owner: "owner-x",
		});
		const lease2 = await acquireMemoryStoreLease({
			databasePath,
			allowedScopes: [FIXTURE_PROJECT_SCOPE],
			owner: "owner-x",
		});
		await lease1.release();
		await lease1.release(); // 幂等
		await lease2.release();
		// 归零关闭。
		await expect(
			lease2.store.write(FIXTURE_PROJECT_SCOPE, {
				action: "remember",
				content: "x",
				kind: "fact",
				scopeName: "project",
			}),
		).rejects.toMatchObject({ code: MEMORY_STORE_ERROR_CODES.STORE_CLOSED });
	});

	it("全释放后可再次获取（新实例），数据仍在", async () => {
		{
			const lease = await acquireMemoryStoreLease({
				databasePath,
				allowedScopes: [FIXTURE_PROJECT_SCOPE],
				owner: "first",
			});
			await lease.store.write(FIXTURE_PROJECT_SCOPE, {
				action: "remember",
				content: "生命周期事实",
				kind: "fact",
				scopeName: "project",
			});
			await lease.release();
		}
		{
			const lease = await acquireMemoryStoreLease({
				databasePath,
				allowedScopes: [FIXTURE_PROJECT_SCOPE],
				owner: "second",
			});
			try {
				const effective = await lease.store.read(FIXTURE_PROJECT_SCOPE, { asOf: "2030-01-01T00:00:00Z" });
				expect(effective.map((revision) => revision.content)).toEqual(["生命周期事实"]);
			} finally {
				await lease.release();
			}
		}
	});

	it("store.close 幂等：二次 close 不再抛错", async () => {
		const lease = await acquireMemoryStoreLease({
			databasePath,
			allowedScopes: [FIXTURE_PROJECT_SCOPE],
			owner: "closer",
		});
		await lease.store.close();
		await expect(lease.store.close()).resolves.toBeUndefined();
	});
});
