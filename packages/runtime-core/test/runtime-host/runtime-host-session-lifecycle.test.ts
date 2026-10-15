// Copyright The Open Forge contributors.
import { describe, expect, it, vi } from "vitest";
import { RuntimeHostSessionLifecycle } from "../../src/runtime-host/runtime-host-session-lifecycle.js";

function createLifecycle(dispose: () => Promise<void>) {
	const handle = { lifecycle: { sessionId: "runtime-1", sessionPath: "C:/sessions/a.jsonl", dispose } };
	const directory = {
		resolveSessionKey: (sessionId: string) => `key:${sessionId}`,
		getByKey: () => handle,
		isRegisteredOwner: () => true,
		readCanonicalSessionIdByKey: () => "runtime-1",
		remove: vi.fn(),
	};
	const events = { release: vi.fn() };
	const reportDisposeFailure = vi.fn();
	const lifecycle = new RuntimeHostSessionLifecycle({
		directory,
		events,
		reportDisposeFailure,
	} as never);
	return { lifecycle, directory, events, reportDisposeFailure };
}

describe("RuntimeHostSessionLifecycle.disposeSession", () => {
	// 回归 BUG-0108：旧实现把 directory.remove() 放在 dispose 之后，dispose 一失败就跳过
	// 注销，该 key 永久留在目录里，后续每次删除都重复同一失败，会话成为删不掉的僵尸。
	// 只有删除路径（releaseOnDisposeFailure）取这个语义；普通关闭/逐出保持可重试。
	it("releases ownership on dispose failure only when the delete path asks for it", async () => {
		const failure = new Error("Failed to dispose one or more session extensions: subagent");
		const { lifecycle, directory, events, reportDisposeFailure } = createLifecycle(async () => {
			throw failure;
		});

		await expect(lifecycle.disposeSession("runtime-1", { releaseOnDisposeFailure: true })).rejects.toBe(failure);

		expect(reportDisposeFailure).toHaveBeenCalledWith(failure, "runtime-1");
		expect(events.release).toHaveBeenCalledWith("key:runtime-1", "C:/sessions/a.jsonl", "runtime-1");
		expect(directory.remove).toHaveBeenCalledWith("key:runtime-1", expect.anything());
	});

	it("keeps a failed dispose registered and retryable for ordinary callers", async () => {
		const failure = new Error("extension host hang");
		const { lifecycle, directory, events, reportDisposeFailure } = createLifecycle(async () => {
			throw failure;
		});

		await expect(lifecycle.disposeSession("runtime-1")).rejects.toBe(failure);

		expect(reportDisposeFailure).toHaveBeenCalledWith(failure, "runtime-1");
		expect(events.release).not.toHaveBeenCalled();
		expect(directory.remove).not.toHaveBeenCalled();
	});

	it("keeps the successful release path unchanged", async () => {
		const { lifecycle, directory, reportDisposeFailure } = createLifecycle(async () => {});

		await expect(lifecycle.disposeSession("runtime-1")).resolves.toBeUndefined();

		expect(directory.remove).toHaveBeenCalled();
		expect(reportDisposeFailure).not.toHaveBeenCalled();
	});
});
