// Modified by The Open Forge contributors.
import { describe, expect, it, vi } from "vitest";

const processState = vi.hoisted(() => ({ instance: undefined as unknown }));

vi.mock("../../src/mcp/transports/stdio/stdio-process.js", () => {
	class MockStdioMcpProcess {
		readonly sent: unknown[] = [];
		private readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();

		constructor() {
			processState.instance = this;
		}

		on(event: string, listener: (...args: unknown[]) => void): void {
			const listeners = this.listeners.get(event) ?? [];
			listeners.push(listener);
			this.listeners.set(event, listeners);
		}

		emit(event: string, ...args: unknown[]): void {
			for (const listener of this.listeners.get(event) ?? []) listener(...args);
		}

		async start(): Promise<void> {}
		async stop(): Promise<void> {}

		getStderrTail(): string {
			return "";
		}

		send(message: unknown): void {
			this.sent.push(message);
		}

		getPid(): number {
			return 42;
		}
	}

	return { StdioMcpProcess: MockStdioMcpProcess };
});

import { StdioMcpClient } from "../../src/mcp/transports/stdio/stdio-mcp-client.js";

interface MockProcess {
	readonly sent: Array<Record<string, unknown>>;
	emit(event: string, ...args: unknown[]): void;
}

const initializeParams = {
	protocolVersion: "2025-11-25",
	clientInfo: { name: "vetta-test", version: "1" },
};

describe("StdioMcpClient protocol-era behavior", () => {
	it("falls back from Modern discovery in auto mode and dispatches Legacy server requests", async () => {
		const sampling = vi.fn(async () => ({
			role: "assistant" as const,
			content: { type: "text", text: "sampled" },
			model: "fixture",
		}));
		const client = new StdioMcpClient({
			name: "fixture",
			config: { command: "fixture", protocolMode: "auto" },
			interactionHandlers: { sampling },
		});
		const initializing = client.initialize(initializeParams);
		const process = currentProcess();
		const discover = await waitForRequest(process, "server/discover");
		process.emit("message", {
			jsonrpc: "2.0",
			id: discover.id,
			error: { code: -32601, message: "unknown method" },
		});
		const initialize = await waitForRequest(process, "initialize");
		process.emit("message", {
			jsonrpc: "2.0",
			id: initialize.id,
			result: {
				protocolVersion: "2025-11-25",
				serverInfo: { name: "fixture", version: "1" },
				capabilities: { sampling: {} },
			},
		});
		await expect(initializing).resolves.toMatchObject({ protocolVersion: "2025-11-25" });

		process.emit("message", {
			jsonrpc: "2.0",
			id: "server-request-1",
			method: "sampling/createMessage",
			params: { messages: [], maxTokens: 8 },
		});
		await vi.waitFor(() => {
			expect(findResponse(process, "server-request-1")).toMatchObject({
				result: { role: "assistant", model: "fixture" },
			});
		});
		expect(sampling).toHaveBeenCalledWith(
			expect.objectContaining({ maxTokens: 8 }),
			expect.objectContaining({ serverName: "fixture", method: "sampling/createMessage" }),
		);
		process.emit("message", {
			jsonrpc: "2.0",
			id: "server-request-invalid",
			method: "sampling/createMessage",
			params: { messages: [], maxTokens: 0 },
		});
		await vi.waitFor(() => {
			expect(findResponse(process, "server-request-invalid")).toMatchObject({
				error: { code: -32602 },
			});
		});
		expect(sampling).toHaveBeenCalledOnce();
		await client.close();
	});

	it("sends notifications/cancelled when a Modern stdio request is aborted", async () => {
		const { client, process } = await createModernClient();
		const controller = new AbortController();
		const calling = client.callTool("slow", {}, { signal: controller.signal });
		const request = await waitForRequest(process, "tools/call");
		controller.abort();
		await expect(calling).rejects.toMatchObject({ name: "AbortError" });
		expect(
			process.sent.find(
				(message) =>
					message.method === "notifications/cancelled" &&
					(message.params as Record<string, unknown>).requestId === request.id,
			),
		).toBeDefined();
		await client.close();
	});

	it("initialize handshake honors config.startupTimeout over the request timeout", async () => {
		// `npx -y <pkg>` 冷安装期间进程已 spawn 但服务未就绪；startupTimeout 才是
		// 「允许启动完成」的预算，请求级 timeout 套在握手上会误杀还在安装的进程树。
		const client = new StdioMcpClient({
			name: "slow-boot",
			config: { command: "fixture", startupTimeout: 2000 },
			timeout: 60,
		});
		const initializing = client.initialize(initializeParams);
		const process = currentProcess();
		const request = await waitForRequest(process, "initialize");
		setTimeout(() => {
			process.emit("message", {
				jsonrpc: "2.0",
				id: request.id,
				result: {
					protocolVersion: "2025-11-25",
					serverInfo: { name: "slow-boot", version: "1" },
					capabilities: {},
				},
			});
		}, 300);
		await expect(initializing).resolves.toMatchObject({ protocolVersion: "2025-11-25" });
		await client.close();
	});

	it("initialize handshake still fails fast when startupTimeout itself is exceeded", async () => {
		const client = new StdioMcpClient({
			name: "never-ready",
			config: { command: "fixture", startupTimeout: 80 },
			timeout: 60_000,
		});
		const initializing = client.initialize(initializeParams);
		await waitForRequest(currentProcess(), "initialize");
		await expect(initializing).rejects.toThrow(/Request timeout: initialize/);
		await client.close();
	});

	it("routes Modern subscription notifications only after acknowledgement", async () => {
		const { client, process } = await createModernClient();
		const methods: string[] = [];
		const listening = client.listenSubscriptions({ toolsListChanged: true }, (notification) => {
			methods.push(notification.method);
		});
		const request = await waitForRequest(process, "subscriptions/listen");
		const meta = { "io.modelcontextprotocol/subscriptionId": request.id as string | number };
		process.emit("message", {
			jsonrpc: "2.0",
			method: "notifications/subscriptions/acknowledged",
			params: { _meta: meta, notifications: { toolsListChanged: true } },
		});
		process.emit("message", {
			jsonrpc: "2.0",
			method: "notifications/tools/list_changed",
			params: { _meta: meta },
		});
		process.emit("message", {
			jsonrpc: "2.0",
			id: request.id,
			result: { resultType: "complete", _meta: meta },
		});
		await expect(listening).resolves.toMatchObject({ resultType: "complete" });
		await vi.waitFor(() => {
			expect(methods).toEqual(["notifications/subscriptions/acknowledged", "notifications/tools/list_changed"]);
		});
		await client.close();
	});
});

async function createModernClient(): Promise<{ client: StdioMcpClient; process: MockProcess }> {
	const client = new StdioMcpClient({
		name: "fixture",
		config: { command: "fixture", protocolMode: "modern" },
	});
	const initializing = client.initialize(initializeParams);
	const process = currentProcess();
	const discover = await waitForRequest(process, "server/discover");
	process.emit("message", {
		jsonrpc: "2.0",
		id: discover.id,
		result: {
			resultType: "complete",
			supportedVersions: ["2026-07-28"],
			capabilities: { tools: {} },
			ttlMs: 0,
			cacheScope: "private",
		},
	});
	await initializing;
	return { client, process };
}

function currentProcess(): MockProcess {
	return processState.instance as MockProcess;
}

async function waitForRequest(process: MockProcess, method: string): Promise<Record<string, unknown>> {
	let request: Record<string, unknown> | undefined;
	await vi.waitFor(() => {
		request = process.sent.find((message) => message.method === method && "id" in message);
		expect(request).toBeDefined();
	});
	return request as Record<string, unknown>;
}

function findResponse(process: MockProcess, id: string | number): Record<string, unknown> | undefined {
	return process.sent.find((message) => message.id === id && ("result" in message || "error" in message));
}
