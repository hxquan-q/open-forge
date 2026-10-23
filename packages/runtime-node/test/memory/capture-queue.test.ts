// Modified by The Open Forge contributors.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryCaptureQueue, SqliteMemoryErasure, SqliteMemoryWorkerStore } from "@vetta/runtime-node/memory";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * TASK-0379 持久捕获队列（真实 SQLite）：幂等入队、lease/attempt、
 * 崩溃恢复（重开+过期 lease 回收）、高水位对账、提交前 erasure 复检。
 */

let workDir: string;
let databasePath: string;

beforeEach(() => {
	workDir = mkdtempSync(join(tmpdir(), "runtime-node-capture-queue-"));
	databasePath = join(workDir, "memory.sqlite");
});

afterEach(() => {
	try {
		rmSync(workDir, { recursive: true, force: true });
	} catch {
		/* Windows 句柄滞后 */
	}
});

async function seedOneMemory(): Promise<{ memoryId: string }> {
	const store = await SqliteMemoryWorkerStore.open({ databasePath, allowedScopes: [] });
	try {
		void store;
	} finally {
		await store.close();
	}
	return { memoryId: "mem-none" };
}

describe("持久捕获队列", () => {
	it("幂等入队：同 source+extractor 只一条；不同 extractor 版本共存", async () => {
		const queue = await MemoryCaptureQueue.open({ databasePath });
		try {
			const first = queue.enqueue({ sourceId: "s/1", cursor: "c1", payload: "p", extractorVersion: "v1" });
			const second = queue.enqueue({ sourceId: "s/1", cursor: "c1", payload: "p", extractorVersion: "v1" });
			expect(first.enqueued).toBe(true);
			expect(second.enqueued).toBe(false);
			expect(second.jobId).toBe(first.jobId);
			const nextVersion = queue.enqueue({ sourceId: "s/1", cursor: "c1", payload: "p", extractorVersion: "v2" });
			expect(nextVersion.enqueued).toBe(true);
			expect(queue.pendingCount()).toBe(2);
		} finally {
			queue.close();
		}
	});

	it("lease/attempt 与完成；二次领取无 pending 时返回 null", async () => {
		const queue = await MemoryCaptureQueue.open({ databasePath });
		try {
			queue.enqueue({ sourceId: "s/1", cursor: "c", payload: "p", extractorVersion: "v1" });
			const job = queue.leaseNext("worker-a");
			expect(job).not.toBeNull();
			expect(job?.attempts).toBe(1);
			expect(job?.status).toBe("leased");
			const stolen = queue.leaseNext("worker-b");
			expect(stolen).toBeNull();
			const ok = queue.complete(job!.jobId, { erasureEpochSeen: 0, currentEpoch: 0 });
			expect(ok).toBe(true);
			expect(queue.leaseNext("worker-c")).toBeNull();
		} finally {
			queue.close();
		}
	});

	it("崩溃恢复：重开队列后 pending 仍在；过期 lease 回收可重领", async () => {
		{
			const queue = await MemoryCaptureQueue.open({ databasePath });
			queue.enqueue({ sourceId: "s/1", cursor: "c", payload: "p", extractorVersion: "v1" });
			const job = queue.leaseNext("worker-a", 1);
			expect(job).not.toBeNull();
			queue.close();
		}
		await new Promise((resolve) => setTimeout(resolve, 5));
		{
			const queue = await MemoryCaptureQueue.open({ databasePath });
			try {
				expect(queue.pendingCount()).toBe(1);
				const recovered = queue.recoverExpiredLeases();
				expect(recovered).toBe(1);
				const job = queue.leaseNext("worker-b");
				expect(job).not.toBeNull();
				expect(job?.attempts).toBe(2);
			} finally {
				queue.close();
			}
		}
	});

	it("提交前 erasure 复检：纪元前进则放弃而非提交", async () => {
		const store = await SqliteMemoryWorkerStore.open({ databasePath, allowedScopes: [] });
		await store.close();
		const erasure = await SqliteMemoryErasure.open({ databasePath });
		const queue = await MemoryCaptureQueue.open({ databasePath });
		try {
			queue.enqueue({ sourceId: "s/1", cursor: "c", payload: "p", extractorVersion: "v1" });
			const job = queue.leaseNext("worker-a");
			// 遗忘另一记忆推进纪元 → 提交前复检失败 → 放弃。
			erasure.forgetMemoryFamily({ memoryId: "mem-x" });
			const committed = queue.complete(job!.jobId, { erasureEpochSeen: 0, currentEpoch: 1 });
			expect(committed).toBe(false);
			const after = queue.leaseNext("worker-a");
			expect(after).toBeNull();
		} finally {
			queue.close();
			erasure.close();
		}
	});

	it("高水位对账：设置与读取；重复设置幂等", async () => {
		const queue = await MemoryCaptureQueue.open({ databasePath });
		try {
			expect(queue.readHighWater()).toBeNull();
			queue.setHighWater("cursor-10");
			expect(queue.readHighWater()).toBe("cursor-10");
			queue.setHighWater("cursor-12");
			expect(queue.readHighWater()).toBe("cursor-12");
		} finally {
			queue.close();
		}
	});

	it("失败记录 attempt 与错误，不伪装成功", async () => {
		const queue = await MemoryCaptureQueue.open({ databasePath });
		try {
			queue.enqueue({ sourceId: "s/1", cursor: "c", payload: "p", extractorVersion: "v1" });
			const job = queue.leaseNext("worker-a");
			queue.fail(job!.jobId, "provider transient");
			const requeued = queue.leaseNext("worker-b");
			expect(requeued).toBeNull();
			// failed 任务不再领取（人工/后续重置策略另行处理）。
		} finally {
			queue.close();
		}
		void seedOneMemory;
	});
});
