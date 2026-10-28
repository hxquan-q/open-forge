// Copyright The Open Forge contributors.

import { describe, expect, it } from "vitest";
import {
	LazyMcpClientHandle,
	type LazyMcpClientHandleOptions,
	type McpClientHandle,
	type McpInitializeParams,
	type McpInitializeResult,
	type McpJsonObject,
	type McpResourceReadResult,
	type McpToolCallResult,
} from "../src/index.js";

describe("LazyMcpClientHandle", () => {
	it("connects on first use and reuses the connection for later calls", async () => {
		const inner = new RecordingClient("alpha");
		const handle = createHandle(() => inner);
		expect(handle.isConnected()).toBe(false);

		const first = await handle.callTool("one");
		expect(first.content).toEqual([{ type: "text", text: "one" }]);
		expect(inner.initializeCalls).toBe(1);
		expect(handle.isConnected()).toBe(true);

		await handle.listTools();
		expect(inner.initializeCalls).toBe(1);
	});

	it("dedupes concurrent connection attempts", async () => {
		const gate = new Deferred<void>();
		const inner = new RecordingClient("alpha", gate);
		const handle = createHandle(() => inner);

		const first = handle.callTool("one");
		const second = handle.listResources();
		gate.resolve();
		await Promise.all([first, second]);
		expect(inner.initializeCalls).toBe(1);
	});

	it("reconnects after disconnect and reports in-flight work", async () => {
		const clients: RecordingClient[] = [];
		const inFlightLog: number[] = [];
		const handle = createHandle(
			() => {
				const client = new RecordingClient(`alpha-${clients.length}`);
				clients.push(client);
				return client;
			},
			{ onInFlightChange: (count) => inFlightLog.push(count) },
		);

		await handle.callTool("one");
		expect(inFlightLog).toEqual([1, 0]);

		await handle.disconnect();
		expect(handle.isConnected()).toBe(false);
		expect(clients[0]?.closed).toBe(true);

		await handle.callTool("two");
		expect(clients).toHaveLength(2);
		expect(clients[1]?.initializeCalls).toBe(1);
		expect(clients[0]?.callToolNames).toEqual(["one"]);
		expect(clients[1]?.callToolNames).toEqual(["two"]);
	});

	it("closes the failed attempt and retries on the next call", async () => {
		const gate = new Deferred<void>();
		const first = new RecordingClient("alpha-0", gate, new Error("spawn failed"));
		const second = new RecordingClient("alpha-1");
		const clients = [first, second];
		let index = 0;
		const handle = createHandle(() => clients[index++] ?? second);
		gate.resolve();

		await expect(handle.callTool("one")).rejects.toThrow("spawn failed");
		expect(first.closed).toBe(true);
		expect(handle.isConnected()).toBe(false);

		await expect(handle.callTool("two")).resolves.toEqual({ content: [{ type: "text", text: "two" }] });
		expect(second.initializeCalls).toBe(1);
	});

	it("closes a superseded connection attempt and lets a fresh connect win", async () => {
		const gate = new Deferred<void>();
		const stale = new RecordingClient("stale", gate);
		const fresh = new RecordingClient("fresh");
		let created = 0;
		const handle = createHandle(() => (++created === 1 ? stale : fresh));

		const pending = handle.callTool("one");
		pending.catch(() => undefined);
		await handle.disconnect();
		expect(stale.closed).toBe(true);
		await expect(handle.callTool("two")).resolves.toEqual({ content: [{ type: "text", text: "two" }] });
		gate.resolve();
		await expect(pending).rejects.toThrow("superseded");
		expect(stale.closed).toBe(true);

		await expect(handle.callTool("two")).resolves.toEqual({ content: [{ type: "text", text: "two" }] });
		expect(fresh.initializeCalls).toBe(1);
	});

	it("closes an initializing transport before its handshake settles", async () => {
		const gate = new Deferred<void>();
		const inner = new RecordingClient("pending", gate);
		const handle = createHandle(() => inner);
		const pending = handle.callTool("one");
		pending.catch(() => undefined);
		await handle.close();
		expect(inner.closed).toBe(true);
		await expect(handle.callTool("two")).rejects.toThrow(/closed/);
		gate.resolve();
		await expect(pending).rejects.toThrow("superseded");
		expect(inner.callToolNames).toEqual([]);
	});

	it("counts a pending connection attempt as in-flight work", async () => {
		const gate = new Deferred<void>();
		const inner = new RecordingClient("alpha", gate);
		const handle = createHandle(() => inner);

		const pending = handle.callTool("one");
		expect(handle.getInFlightCount()).toBe(1);
		expect(handle.isConnecting()).toBe(true);

		gate.resolve();
		await pending;
		expect(handle.getInFlightCount()).toBe(0);
		expect(handle.isConnecting()).toBe(false);
	});

	it("rejects all calls after close", async () => {
		const inner = new RecordingClient("alpha");
		const handle = createHandle(() => inner);
		await handle.callTool("one");
		await handle.close();

		await expect(handle.callTool("two")).rejects.toThrow(/closed/);
		expect(inner.closed).toBe(true);
	});

	it("notifies onConnected and onConnectFailed", async () => {
		const connected: string[] = [];
		const failed: string[] = [];
		const bad = new RecordingClient("bad", undefined, new Error("nope"));
		const handle = createHandle(() => bad, {
			onConnected: (result) => connected.push(result.serverInfo.name),
			onConnectFailed: (error) => failed.push((error as Error).message),
		});

		await expect(handle.listTools()).rejects.toThrow("nope");
		expect(failed).toEqual(["nope"]);
		expect(connected).toEqual([]);
	});
});

function createHandle(
	createClient: () => McpClientHandle,
	extra?: Partial<LazyMcpClientHandleOptions>,
): LazyMcpClientHandle {
	return new LazyMcpClientHandle({
		name: "alpha",
		createClient,
		init: (client) => client.initialize({ protocolVersion: "test", clientInfo: { name: "t", version: "1" } }),
		...extra,
	});
}

class Deferred<T> {
	readonly promise: Promise<T>;
	resolve!: (value: T) => void;
	reject!: (error: unknown) => void;

	constructor() {
		this.promise = new Promise<T>((resolve, reject) => {
			this.resolve = resolve;
			this.reject = reject;
		});
	}
}

class RecordingClient implements McpClientHandle {
	closed = false;
	initializeCalls = 0;
	readonly callToolNames: string[] = [];

	constructor(
		readonly name: string,
		private readonly gate?: Deferred<void>,
		private readonly initializeError?: Error,
	) {}

	async initialize(_params: McpInitializeParams): Promise<McpInitializeResult> {
		this.initializeCalls += 1;
		await this.gate?.promise;
		if (this.initializeError) throw this.initializeError;
		return {
			protocolVersion: "test",
			serverInfo: { name: this.name, version: "1" },
			capabilities: { tools: {} },
		};
	}

	async listTools() {
		return { tools: [] };
	}

	async callTool(name: string, _args?: McpJsonObject): Promise<McpToolCallResult> {
		this.callToolNames.push(name);
		return { content: [{ type: "text", text: name }] };
	}

	async listResources() {
		return { resources: [] };
	}

	async readResource(_uri: string): Promise<McpResourceReadResult> {
		return { contents: [] };
	}

	async listPrompts() {
		return { prompts: [] };
	}

	async close(): Promise<void> {
		this.closed = true;
	}

	getName(): string {
		return this.name;
	}

	getPid(): number | undefined {
		return 42;
	}

	isClientInitialized(): boolean {
		return this.initializeCalls > 0 && !this.closed;
	}
}
