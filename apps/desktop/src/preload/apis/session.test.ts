// Modified by The Open Forge contributors.
import type { IpcRenderer } from "electron";
import { describe, expect, it, vi } from "vitest";
import { createSessionApi } from "./session.js";

describe("createSessionApi trace propagation", () => {
	it("forwards the same correlation envelope for create and prompt", async () => {
		const invoke = vi.fn(async () => undefined);
		const ipc = { invoke } as unknown as IpcRenderer;
		const session = createSessionApi(ipc).session;
		const traceContext = { interactionId: "00000000-0000-4000-8000-000000000001" };

		await session.create({ cwd: "C:/workspace" }, "conversation", traceContext);
		await session.prompt("session-1", { text: "hello" }, traceContext);

		expect(invoke).toHaveBeenNthCalledWith(
			1,
			"vetta:session:create",
			{ cwd: "C:/workspace" },
			"conversation",
			traceContext,
		);
		expect(invoke).toHaveBeenNthCalledWith(2, "vetta:session:prompt", "session-1", { text: "hello" }, traceContext);
	});

	it("exposes MCP Task snapshot, cancellation and cleanup channels", async () => {
		const invoke = vi.fn(async () => undefined);
		const ipc = { invoke } as unknown as IpcRenderer;
		const session = createSessionApi(ipc).session;

		await session.listMcpTasks("session-1");
		await session.cancelMcpTask("task-record-1");
		await session.clearFinishedMcpTasks("session-1");

		expect(invoke).toHaveBeenNthCalledWith(1, "vetta:session:mcp-tasks-list", "session-1");
		expect(invoke).toHaveBeenNthCalledWith(2, "vetta:session:mcp-tasks-cancel", "task-record-1");
		expect(invoke).toHaveBeenNthCalledWith(3, "vetta:session:mcp-tasks-clear-finished", "session-1");
	});

	it("exposes queued context compaction without using the interrupting prompt path", async () => {
		const invoke = vi.fn(async () => ({ status: "queued", id: "compact-1", pendingCount: 1 }));
		const ipc = { invoke } as unknown as IpcRenderer;
		const session = createSessionApi(ipc).session;

		await session.queueContextCompaction("session-1");

		expect(invoke).toHaveBeenCalledWith("vetta:session:queue-context-compaction", "session-1");
	});

	it("exposes goal lifecycle channels", async () => {
		const invoke = vi.fn(async () => undefined);
		const ipc = { invoke } as unknown as IpcRenderer;
		const session = createSessionApi(ipc).session;

		await session.getGoalState("session-1");
		await session.startGoal("session-1", "Ship");
		await session.pauseGoal("session-1", "goal-1");
		await session.resumeGoal("session-1", "goal-1");
		await session.clearGoal("session-1", "goal-1");

		expect(invoke.mock.calls).toEqual([
			["vetta:session:goal-get-state", "session-1"],
			["vetta:session:goal-start", "session-1", "Ship"],
			["vetta:session:goal-pause", "session-1", "goal-1"],
			["vetta:session:goal-resume", "session-1", "goal-1"],
			["vetta:session:goal-clear", "session-1", "goal-1"],
		]);
	});

	it("exposes the MCP Apps surface proxy channels", async () => {
		const invoke = vi.fn(async () => undefined);
		const ipc = { invoke } as unknown as IpcRenderer;
		const session = createSessionApi(ipc).session;

		await session.getMcpAppSurface("surface-1");
		await session.callMcpAppTool({ surfaceId: "surface-1", name: "refresh", arguments: { page: 1 } });
		await session.readMcpAppResource({ surfaceId: "surface-1", uri: "ui://data" });
		await session.releaseMcpAppSurface("surface-1");

		expect(invoke).toHaveBeenNthCalledWith(1, "vetta:session:mcp-app-surface-get", "surface-1");
		expect(invoke).toHaveBeenNthCalledWith(2, "vetta:session:mcp-app-call-tool", {
			surfaceId: "surface-1",
			name: "refresh",
			arguments: { page: 1 },
		});
		expect(invoke).toHaveBeenNthCalledWith(3, "vetta:session:mcp-app-read-resource", {
			surfaceId: "surface-1",
			uri: "ui://data",
		});
		expect(invoke).toHaveBeenNthCalledWith(4, "vetta:session:mcp-app-release", "surface-1");
	});

	it("forwards session search requests through the dedicated channel", async () => {
		const invoke = vi.fn(async () => "search-1");
		const ipc = { invoke, on: vi.fn(), removeListener: vi.fn() } as unknown as IpcRenderer;
		const session = createSessionApi(ipc).session;

		await session.searchSessions({ query: "release plan", limit: 20 }, vi.fn());

		expect(invoke).toHaveBeenCalledWith("vetta:session:search-sessions", expect.any(String), {
			query: "release plan",
			limit: 20,
		});
	});

	it("exposes retry and the interrupted-startup subscription on their own channels", async () => {
		const invoke = vi.fn(async () => undefined);
		const listeners = new Map<string, (event: unknown, data: unknown) => void>();
		const on = vi.fn((channel: string, listener: (event: unknown, data: unknown) => void) => {
			listeners.set(channel, listener);
		});
		const ipc = { invoke, on, removeListener: vi.fn() } as unknown as IpcRenderer;
		const session = createSessionApi(ipc).session;

		// 「继续」条经专用 channel 触发内核 retry；名字对不上时点击将永远无响应。
		await session.retry("session-1");
		expect(invoke).toHaveBeenCalledWith("vetta:session:retry", "session-1");

		// 启动扫描结果以一次性订阅下发：handler 收到原样载荷，退订即摘除监听。
		const handler = vi.fn();
		const unsubscribe = session.onInterruptedStartup(handler);
		const listener = listeners.get("vetta:session:interrupted-startup");
		expect(listener).toBeTypeOf("function");
		const payload = {
			sessions: [
				{
					sessionId: "s1",
					sessionPath: "C:/sessions/s1.jsonl",
					cwd: "C:/workspace",
					turnInterrupted: true,
					queuedCount: 1,
				},
			],
		};
		listener?.({}, payload);
		expect(handler).toHaveBeenCalledWith(payload);
		unsubscribe();
		expect(ipc.removeListener).toHaveBeenCalledWith("vetta:session:interrupted-startup", listener);
	});

	it("forwards the tail-first viewer option", async () => {
		const invoke = vi.fn(async () => ({ history: [] }));
		const ipc = { invoke } as unknown as IpcRenderer;
		const session = createSessionApi(ipc).session;

		await session.openViewer("C:/sessions/one.jsonl", { tailTurns: 2 });

		expect(invoke).toHaveBeenCalledWith("vetta:session:viewer-open", "C:/sessions/one.jsonl", {
			tailTurns: 2,
		});
	});
});
