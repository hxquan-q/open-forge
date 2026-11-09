// Modified by The Open Forge contributors.
import { HOST_PROTOCOL_ERROR_CODES, type PortLike } from "@vetta/host-protocol/client";
import type { IpcRenderer } from "electron";
import { describe, expect, it, vi } from "vitest";
import { HOST_PORT_CHANNEL, HOST_PORT_REQUEST_CHANNEL, HOST_REQUEST_CHANNEL } from "../../shared/host-ipc.js";
import { MAX_CONSECUTIVE_DECODE_FAILURES } from "./helper.js";
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
		const invoke = vi.fn(async () => ({ ok: true, result: [] }));
		const ipc = { invoke, send: vi.fn(), on: vi.fn() } as unknown as IpcRenderer;
		const session = createSessionApi(ipc).session;

		await session.listMcpTasks("session-1");
		await session.cancelMcpTask("task-record-1");
		await session.clearFinishedMcpTasks("session-1");

		expect(invoke).toHaveBeenNthCalledWith(1, "vetta:host:request", {
			method: "session.mcpTasksList",
			params: { sessionId: "session-1" },
		});
		expect(invoke).toHaveBeenNthCalledWith(2, "vetta:host:request", {
			method: "session.mcpTasksCancel",
			params: { id: "task-record-1" },
		});
		expect(invoke).toHaveBeenNthCalledWith(3, "vetta:host:request", {
			method: "session.mcpTasksClearFinished",
			params: { sessionId: "session-1" },
		});
	});

	it("exposes queued context compaction over the host channel", async () => {
		const invoke = vi.fn(async () => ({ ok: true, result: { status: "queued", id: "compact-1", pendingCount: 1 } }));
		const ipc = { invoke, send: vi.fn(), on: vi.fn() } as unknown as IpcRenderer;
		const session = createSessionApi(ipc).session;

		await expect(session.queueContextCompaction("session-1")).resolves.toEqual({
			status: "queued",
			id: "compact-1",
			pendingCount: 1,
		});
		expect(invoke).toHaveBeenCalledWith("vetta:host:request", {
			method: "session.queueContextCompaction",
			params: { sessionId: "session-1" },
		});
	});

	it("exposes goal lifecycle channels", async () => {
		const invoke = vi.fn(async () => ({ ok: true, result: null }));
		const ipc = { invoke, send: vi.fn(), on: vi.fn() } as unknown as IpcRenderer;
		const session = createSessionApi(ipc).session;

		await session.getGoalState("session-1");
		await session.startGoal("session-1", "Ship");
		await session.pauseGoal("session-1", "goal-1");
		await session.resumeGoal("session-1", "goal-1");
		await session.clearGoal("session-1", "goal-1");

		expect(invoke.mock.calls).toEqual([
			["vetta:host:request", { method: "session.getGoalState", params: { sessionId: "session-1" } }],
			["vetta:host:request", { method: "session.startGoal", params: { sessionId: "session-1", objective: "Ship" } }],
			["vetta:host:request", { method: "session.pauseGoal", params: { sessionId: "session-1", goalId: "goal-1" } }],
			["vetta:host:request", { method: "session.resumeGoal", params: { sessionId: "session-1", goalId: "goal-1" } }],
			["vetta:host:request", { method: "session.clearGoal", params: { sessionId: "session-1", goalId: "goal-1" } }],
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
		const invoke = vi.fn(async () => ({ ok: true, result: null }));
		const listeners = new Map<string, (event: unknown, data: unknown) => void>();
		const on = vi.fn((channel: string, listener: (event: unknown, data: unknown) => void) => {
			listeners.set(channel, listener);
		});
		const ipc = { invoke, on, send: vi.fn(), removeListener: vi.fn() } as unknown as IpcRenderer;
		const session = createSessionApi(ipc).session;

		// 「继续」条经 Host 合同触发内核 retry（迁移后入口换 session.retry，语义不变）。
		await session.retry("session-1");
		expect(invoke).toHaveBeenCalledWith("vetta:host:request", {
			method: "session.retry",
			params: { sessionId: "session-1" },
		});

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

describe("createSessionApi event subscription", () => {
	function runtimeEvent(eventId: string): Record<string, unknown> {
		return {
			schemaVersion: 1,
			channel: "runtime",
			sessionId: "session-1",
			eventId,
			timestamp: 1,
			source: "test",
			type: "active_tools_update",
			activeToolNames: [],
		};
	}

	interface FakeIpc {
		readonly ipc: IpcRenderer;
		readonly invoke: ReturnType<typeof vi.fn>;
		readonly send: ReturnType<typeof vi.fn>;
		emit(channel: string, ...args: unknown[]): void;
		deliverPort(port: PortLike): void;
	}

	function fakeIpc(hostResponse: (request: unknown) => unknown = () => ({ ok: true, result: null })): FakeIpc {
		const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
		const invoke = vi.fn(async (channel: string, ...args: unknown[]) => {
			if (channel === HOST_REQUEST_CHANNEL) return hostResponse(args[0]);
			return undefined;
		});
		const send = vi.fn();
		const on = (channel: string, listener: (...args: unknown[]) => void): void => {
			listeners.set(channel, [...(listeners.get(channel) ?? []), listener]);
		};
		const removeListener = (channel: string, listener: (...args: unknown[]) => void): void => {
			listeners.set(
				channel,
				(listeners.get(channel) ?? []).filter((entry) => entry !== listener),
			);
		};
		const ipc = { invoke, send, on, removeListener } as unknown as IpcRenderer;
		const emit = (channel: string, ...args: unknown[]): void => {
			for (const listener of [...(listeners.get(channel) ?? [])]) listener({}, ...args);
		};
		return {
			ipc,
			invoke,
			send,
			emit,
			// Electron 把端口挂在事件对象上，host-transport 读 event.ports[0]。
			deliverPort: (port) => {
				for (const listener of [...(listeners.get(HOST_PORT_CHANNEL) ?? [])]) listener({ ports: [port] });
			},
		};
	}

	interface Frame {
		readonly id: number;
		readonly request?: { readonly method: string; readonly params: unknown };
		readonly response?: unknown;
		readonly event?: { readonly subscriptionId: string; readonly payload: unknown };
	}

	interface FakePort extends PortLike {
		readonly frames: Frame[];
		emitFrame(frame: Frame): void;
		emitClose(): void;
	}

	/** renderer 侧内存端口：与 host-transport.test.ts 同形，额外记录客户端发出的帧。 */
	function fakePort(): FakePort {
		const listeners = new Map<string, Array<(event: { data: unknown }) => void>>();
		const listenersFor = (event: string): Array<(event: { data: unknown }) => void> => listeners.get(event) ?? [];
		const port = {
			on: (event: "message" | "close", listener: (event: { data: unknown }) => void) => {
				listeners.set(event, [...listenersFor(event), listener]);
			},
			once: (event: "message", listener: (event: { data: unknown }) => void) => {
				const wrapped = (message: { data: unknown }): void => {
					listeners.set(
						event,
						listenersFor(event).filter((entry) => entry !== wrapped),
					);
					listener(message);
				};
				port.on(event, wrapped);
			},
			start: () => {},
			close: () => {},
			postMessage: (message: unknown) => {
				port.frames.push(message as Frame);
			},
			frames: [] as Frame[],
			emitFrame: (frame: Frame) => {
				for (const listener of [...listenersFor("message")]) listener({ data: frame });
			},
			emitClose: () => {
				for (const listener of [...listenersFor("close")]) listener({ data: null });
			},
		} as unknown as FakePort;
		return port;
	}

	async function flush(): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, 0));
	}

	it("subscribes over the port, drains buffered replay events and unsubscribes over the port", async () => {
		const fake = fakeIpc();
		const port = fakePort();
		const session = createSessionApi(fake.ipc).session;
		const handler = vi.fn();

		const subscription = session.subscribe("session-1", handler);
		fake.deliverPort(port);
		await flush();

		expect(fake.send).toHaveBeenCalledWith(HOST_PORT_REQUEST_CHANNEL);
		expect(port.frames).toHaveLength(1);
		const request = port.frames[0];
		expect(request?.request).toEqual({ method: "session.subscribe", params: { sessionId: "session-1" } });

		// 回放事件先于响应帧到达：portHostEvents 有界缓冲后，在注册处理器时按序补发。
		port.emitFrame({ id: 99, event: { subscriptionId: "session-1:sub", payload: runtimeEvent("replay-1") } });
		port.emitFrame({ id: request?.id ?? -1, response: { ok: true, result: { subscriptionId: "session-1:sub" } } });

		const unsubscribe = await subscription;
		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler).toHaveBeenCalledWith(expect.objectContaining({ eventId: "replay-1" }));
		expect(fake.invoke).not.toHaveBeenCalledWith(HOST_REQUEST_CHANNEL, expect.anything());

		port.emitFrame({ id: 100, event: { subscriptionId: "session-1:sub", payload: runtimeEvent("live-1") } });
		expect(handler).toHaveBeenCalledTimes(2);

		unsubscribe();
		unsubscribe();
		expect(port.frames[1]?.request).toEqual({
			method: "session.unsubscribe",
			params: { subscriptionId: "session-1:sub" },
		});

		port.emitFrame({ id: 101, event: { subscriptionId: "session-1:sub", payload: runtimeEvent("late-1") } });
		expect(handler).toHaveBeenCalledTimes(2);
	});

	it("rejects with CAPABILITY_UNAVAILABLE when the host port never arrives", async () => {
		vi.useFakeTimers();
		try {
			const fake = fakeIpc();
			const session = createSessionApi(fake.ipc).session;

			const subscription = session.subscribe("session-1", vi.fn());
			// 先挂断言再推进计时器，避免拒绝在处理器挂载前落地成为 unhandled rejection。
			const assertion = expect(subscription).rejects.toMatchObject({
				code: HOST_PROTOCOL_ERROR_CODES.CAPABILITY_UNAVAILABLE,
			});
			await vi.advanceTimersByTimeAsync(1500);
			await assertion;
			expect(fake.invoke).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	it("propagates a host rejection instead of subscribing twice", async () => {
		const fake = fakeIpc();
		const port = fakePort();
		const session = createSessionApi(fake.ipc).session;

		const subscription = session.subscribe("session-1", vi.fn());
		fake.deliverPort(port);
		await flush();
		port.emitFrame({
			id: port.frames[0]?.id ?? -1,
			response: {
				ok: false,
				error: { code: HOST_PROTOCOL_ERROR_CODES.CAPABILITY_UNAVAILABLE, message: "no event channel" },
			},
		});

		await expect(subscription).rejects.toMatchObject({ code: HOST_PROTOCOL_ERROR_CODES.CAPABILITY_UNAVAILABLE });
		expect(fake.invoke).not.toHaveBeenCalled();
	});

	it("rethrows implementation failures instead of subscribing twice", async () => {
		const fake = fakeIpc();
		const port = fakePort();
		const session = createSessionApi(fake.ipc).session;

		const subscription = session.subscribe("session-1", vi.fn());
		fake.deliverPort(port);
		await flush();
		port.emitFrame({
			id: port.frames[0]?.id ?? -1,
			response: { ok: false, error: { code: HOST_PROTOCOL_ERROR_CODES.INTERNAL, message: "replay failed" } },
		});

		await expect(subscription).rejects.toMatchObject({ code: HOST_PROTOCOL_ERROR_CODES.INTERNAL });
		expect(fake.invoke).not.toHaveBeenCalled();
	});

	it("rejects with HOST_UNAVAILABLE when the port closes before the handler registers", async () => {
		const fake = fakeIpc();
		const port = fakePort();
		const session = createSessionApi(fake.ipc).session;

		const subscription = session.subscribe("session-1", vi.fn());
		fake.deliverPort(port);
		await flush();
		port.emitFrame({
			id: port.frames[0]?.id ?? -1,
			response: { ok: true, result: { subscriptionId: "session-1:sub" } },
		});
		port.emitClose();

		await expect(subscription).rejects.toMatchObject({ code: HOST_PROTOCOL_ERROR_CODES.HOST_UNAVAILABLE });
		expect(fake.invoke).not.toHaveBeenCalled();
	});

	it("tolerates isolated undecodable payloads and fails on a consecutive run", async () => {
		const fake = fakeIpc();
		const port = fakePort();
		const session = createSessionApi(fake.ipc).session;
		const handler = vi.fn();
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const subscription = session.subscribe("session-1", handler);
			fake.deliverPort(port);
			await flush();
			port.emitFrame({
				id: port.frames[0]?.id ?? -1,
				response: { ok: true, result: { subscriptionId: "session-1:sub" } },
			});
			const unsubscribe = await subscription;

			let frameId = 10;
			const emitBad = (): void => {
				port.emitFrame({
					id: frameId++,
					event: { subscriptionId: "session-1:sub", payload: { bad: true } },
				});
			};
			for (let index = 0; index < MAX_CONSECUTIVE_DECODE_FAILURES - 1; index += 1) emitBad();
			expect(handler).not.toHaveBeenCalled();

			// 成功解码重置计数：偶发坏包永远不会累计成协议错误。
			port.emitFrame({
				id: frameId++,
				event: { subscriptionId: "session-1:sub", payload: runtimeEvent("good-1") },
			});
			expect(handler).toHaveBeenCalledTimes(1);
			for (let index = 0; index < MAX_CONSECUTIVE_DECODE_FAILURES - 1; index += 1) emitBad();
			expect(() => emitBad()).toThrow(TypeError);
			unsubscribe();
		} finally {
			errorSpy.mockRestore();
		}
	});
});
