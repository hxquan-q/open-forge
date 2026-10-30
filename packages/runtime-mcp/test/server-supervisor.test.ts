// Modified by The Open Forge contributors.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
	computeMcpServerConfigSignature,
	McpAuthRequiredError,
	type McpClientHandle,
	type McpConfig,
	type McpConfigSource,
	type McpInitializeParams,
	type McpInitializeResult,
	type McpJsonObject,
	type McpResourceReadResult,
	type McpServerCatalogCache,
	type McpServerCatalogSnapshot,
	type McpServerConfig,
	McpServerSupervisor,
	type McpServerSupervisorOptions,
	type McpToolCallResult,
	type RuntimeMcpClientFactory,
} from "../src/index.js";

describe("McpServerSupervisor", () => {
	it("owns startup state while isolating server and discovery failures", async () => {
		const source = new MutableConfigSource({
			ready: stdio("ready"),
			broken: stdio("broken"),
			auth: http("auth"),
			disabled: { ...stdio("disabled"), disabled: true },
			toolsFail: stdio("tools-fail"),
		});
		const clients = new FakeClientFactory();
		clients.initializeErrors.set("broken", new Error("startup failed"));
		clients.initializeErrors.set("auth", new McpAuthRequiredError("auth", "https://auth.test/mcp"));
		clients.toolListErrors.add("toolsFail");
		const supervisor = createSupervisor(source, clients.create);

		await supervisor.initialize();

		expect(supervisor.getServerBinding("ready")?.view).toMatchObject({
			status: "ready",
			tools: [{ name: "tool-ready" }],
			resources: [{ name: "ready" }],
		});
		expect(supervisor.getServerBinding("broken")?.view).toMatchObject({
			status: "error",
			error: "startup failed",
		});
		expect(supervisor.getServerBinding("broken")?.client).toBeUndefined();
		expect(supervisor.getServerBinding("auth")?.view.status).toBe("needs_auth");
		expect(supervisor.getServerBinding("auth")?.client).toBeUndefined();
		expect(clients.clients.find((client) => client.name === "broken")?.closed).toBe(true);
		expect(clients.clients.find((client) => client.name === "auth")?.closed).toBe(true);
		expect(supervisor.getServerBinding("disabled")).toBeUndefined();
		expect(supervisor.getServerBinding("toolsFail")?.view).toMatchObject({
			status: "ready",
			tools: [],
			resources: [{ name: "toolsFail" }],
		});
		expect(supervisor.getStats()).toEqual({
			totalServers: 4,
			readyServers: 2,
			errorServers: 1,
			totalTools: 1,
			totalResources: 2,
			retiredServers: 0,
			activeLeases: 0,
		});
	});

	it("keeps a replaced connection alive until the admitted Turn releases its lease", async () => {
		const source = new MutableConfigSource({ docs: stdio("docs-v1") });
		const clients = new FakeClientFactory();
		const supervisor = createSupervisor(source, clients.create);
		await supervisor.initialize();
		const oldBinding = supervisor.getServerBinding("docs");
		if (!oldBinding?.client) throw new Error("Missing initial MCP binding");
		const oldClient = clients.clients.find((client) => client.name === "docs");
		if (!oldClient) throw new Error("Missing initial MCP client");
		const lease = oldBinding.acquireLease();

		source.servers = { docs: stdio("docs-v2") };
		source.signature = "files-v2";
		expect(await supervisor.reloadIfChanged()).toBe(true);

		expect(oldClient.closed).toBe(false);
		expect(clients.clients.filter((client) => client.name === "docs").at(-1)).not.toBe(oldClient);
		expect(supervisor.getServerBinding("docs")?.client).not.toBe(oldBinding.client);
		expect(supervisor.getStats()).toMatchObject({ retiredServers: 1, activeLeases: 1 });

		await lease.release();

		expect(oldClient.closed).toBe(true);
		expect(supervisor.getStats()).toMatchObject({ retiredServers: 0, activeLeases: 0 });
		await supervisor.shutdown();
	});

	it("keeps the complete last-known-good server set when one candidate fails", async () => {
		const source = new MutableConfigSource({
			stable: stdio("stable"),
			changed: stdio("changed-v1"),
			removed: stdio("removed"),
		});
		const clients = new FakeClientFactory();
		const supervisor = createSupervisor(source, clients.create);
		await supervisor.initialize();
		const changedClient = supervisor.getServerBinding("changed")?.client;
		const removedClient = supervisor.getServerBinding("removed")?.client;

		clients.initializeErrors.set("changed", new Error("candidate failed"));
		source.servers = {
			stable: stdio("stable"),
			changed: stdio("changed-v2"),
			added: stdio("added"),
		};
		source.signature = "files-v2";

		expect(await supervisor.reloadIfChanged()).toBe(false);
		expect(supervisor.getServerBinding("changed")?.client).toBe(changedClient);
		expect(supervisor.getServerBinding("removed")?.client).toBe(removedClient);
		expect(supervisor.getServerBinding("added")).toBeUndefined();
		expect(clients.clients.filter((client) => client.name === "added").at(-1)?.closed).toBe(true);
		await supervisor.shutdown();
	});

	it("retries a failed candidate on the next refresh after the backoff without interrupting old leases", async () => {
		vi.useFakeTimers();
		const source = new MutableConfigSource({ docs: stdio("docs-v1") });
		const clients = new FakeClientFactory();
		const supervisor = createSupervisor(source, clients.create);
		await supervisor.initialize();
		const oldClient = clients.clients[0];
		const lease = supervisor.getServerBinding("docs")?.acquireLease();
		if (!lease?.client) throw new Error("Missing old server lease");
		try {
			clients.initializeErrors.set("docs", new Error("temporarily offline"));
			source.servers = { docs: stdio("docs-v2") };
			source.signature = "files-v2";
			expect(await supervisor.reloadIfChanged()).toBe(false);
			expect(clients.clients).toHaveLength(2);
			expect(clients.clients[1]?.closed).toBe(true);
			clients.initializeErrors.delete("docs");
			await vi.advanceTimersByTimeAsync(29_999);
			await Promise.all(Array.from({ length: 20 }, () => supervisor.reloadIfChanged()));
			expect(clients.clients).toHaveLength(2);
			expect(await lease.client.callTool("tool-docs")).toEqual({ content: [] });
			await vi.advanceTimersByTimeAsync(1);
			// No timer starts a server: an ordinary refresh drives recovery.
			expect(clients.clients).toHaveLength(2);
			expect(await supervisor.reloadIfChanged()).toBe(true);
			expect(supervisor.getServerBinding("docs")?.view.config).toEqual(stdio("docs-v2"));
			expect(clients.clients).toHaveLength(3);
			expect(oldClient?.closed).toBe(false);
			await lease.release();
			expect(oldClient?.closed).toBe(true);
			expect(await supervisor.reloadIfChanged()).toBe(false);
			expect(clients.clients).toHaveLength(3);
		} finally {
			await lease.release();
			await supervisor.shutdown();
		}
	});

	it("allows changed configuration during backoff and coalesces simultaneous refreshes", async () => {
		vi.useFakeTimers();
		const source = new MutableConfigSource({ docs: stdio("docs-v1") });
		const clients = new FakeClientFactory();
		const supervisor = createSupervisor(source, clients.create);
		await supervisor.initialize();
		clients.initializeErrors.set("docs", new Error("offline"));
		source.servers = { docs: stdio("docs-v2") };
		source.signature = "files-v2";
		await supervisor.reloadIfChanged();
		clients.initializeErrors.delete("docs");
		const gate = new Deferred<void>();
		clients.initializeGates.set("docs", gate);
		source.servers = { docs: stdio("docs-v3") };
		source.signature = "files-v3";
		const refreshes = Array.from({ length: 20 }, () => supervisor.reloadIfChanged());
		expect(clients.clients).toHaveLength(3);
		gate.resolve();
		await Promise.all(refreshes);
		expect(supervisor.getServerBinding("docs")?.view.config).toEqual(stdio("docs-v3"));
		await vi.advanceTimersByTimeAsync(30_000);
		expect(await supervisor.reloadIfChanged()).toBe(false);
		expect(clients.clients).toHaveLength(3);
		await supervisor.shutdown();
	});

	it("does not retry invalid configuration or authorization failures as transient connections", async () => {
		vi.useFakeTimers();
		const source = new MutableConfigSource({ docs: stdio("docs-v1") });
		const clients = new FakeClientFactory();
		const supervisor = createSupervisor(source, clients.create);
		await supervisor.initialize();
		const load = vi.spyOn(source, "loadMerged");
		source.signature = "invalid";
		source.loadError = new Error("invalid config");
		await supervisor.reloadIfChanged();
		expect(load).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(60_000);
		await supervisor.reloadIfChanged();
		expect(load).toHaveBeenCalledTimes(1);
		source.loadError = undefined;
		source.servers = { docs: stdio("docs-v2") };
		source.signature = "needs-auth";
		clients.initializeErrors.set("docs", new McpAuthRequiredError("docs", "https://auth.test/mcp"));
		await supervisor.reloadIfChanged();
		await vi.advanceTimersByTimeAsync(60_000);
		await supervisor.reloadIfChanged();
		expect(clients.clients).toHaveLength(2);
		await supervisor.shutdown();
	});

	it("discards a pending retry when shutdown wins and never resurrects on later refreshes", async () => {
		vi.useFakeTimers();
		const source = new MutableConfigSource({ docs: stdio("docs-v1") });
		const clients = new FakeClientFactory();
		const supervisor = createSupervisor(source, clients.create);
		await supervisor.initialize();
		clients.initializeErrors.set("docs", new Error("offline"));
		source.servers = { docs: stdio("docs-v2") };
		source.signature = "files-v2";
		await supervisor.reloadIfChanged();
		clients.initializeErrors.delete("docs");
		await vi.advanceTimersByTimeAsync(30_000);
		const gate = new Deferred<void>();
		clients.initializeGates.set("docs", gate);
		const retry = supervisor.reloadIfChanged();
		expect(clients.clients).toHaveLength(3);
		await supervisor.shutdown();
		expect(clients.clients.every((client) => client.closed)).toBe(true);
		gate.resolve();
		expect(await retry).toBe(false);
		source.signature = "files-v3";
		expect(await supervisor.reloadIfChanged()).toBe(false);
		await supervisor.reload();
		await supervisor.setDynamicServers({ servers: new Map([["new", stdio("new")]]), signature: "new" });
		await supervisor.restartServer("new", stdio("new"));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(supervisor.getState().servers).toEqual([]);
		expect(clients.clients).toHaveLength(3);
		expect(clients.clients.every((client) => client.closed)).toBe(true);
	});

	it("does not publish or acknowledge a configuration that changes during candidate startup", async () => {
		const source = new MutableConfigSource({ docs: stdio("docs-v1") });
		const clients = new FakeClientFactory();
		const supervisor = createSupervisor(source, clients.create);
		await supervisor.initialize();
		const gate = new Deferred<void>();
		clients.initializeGates.set("docs", gate);
		source.servers = { docs: stdio("docs-v2") };
		source.signature = "files-v2";
		const pending = supervisor.reloadIfChanged();
		source.servers = { docs: stdio("docs-v3") };
		source.signature = "files-v3";
		gate.resolve();
		expect(await pending).toBe(false);
		expect(clients.clients[1]?.closed).toBe(true);
		expect(supervisor.hasConfigChanged()).toBe(true);
		clients.initializeGates.delete("docs");
		expect(await supervisor.reloadIfChanged()).toBe(true);
		expect(supervisor.getServerBinding("docs")?.view.config).toEqual(stdio("docs-v3"));
		await supervisor.shutdown();
	});

	it("diff-reconciles file config and retains live state when loading fails", async () => {
		const source = new MutableConfigSource({
			stable: stdio("stable"),
			changed: stdio("changed-v1"),
			removed: stdio("removed"),
		});
		const clients = new FakeClientFactory();
		const supervisor = createSupervisor(source, clients.create);
		await supervisor.initialize();
		const stableClient = supervisor.getServerBinding("stable")?.client;
		const changedClient = supervisor.getServerBinding("changed")?.client;

		source.servers = {
			stable: stdio("stable"),
			changed: stdio("changed-v2"),
			added: stdio("added"),
		};
		source.signature = "files-v2";
		expect(supervisor.hasConfigChanged()).toBe(true);
		expect(await supervisor.reloadIfChanged()).toBe(true);
		expect(supervisor.getServerBinding("stable")?.client).toBe(stableClient);
		expect(supervisor.getServerBinding("changed")?.client).not.toBe(changedClient);
		expect(supervisor.getServerBinding("removed")).toBeUndefined();
		expect(supervisor.getServerBinding("added")?.view.status).toBe("ready");
		expect(await supervisor.reloadIfChanged()).toBe(false);

		source.signature = "files-invalid";
		source.loadError = new Error("invalid config");
		expect(await supervisor.reloadIfChanged()).toBe(false);
		expect(supervisor.getServerBinding("stable")?.client).toBe(stableClient);
	});

	it("overlays and preserves a replaceable dynamic server set", async () => {
		const source = new MutableConfigSource({ stable: stdio("stable") });
		const clients = new FakeClientFactory();
		const supervisor = createSupervisor(source, clients.create);
		await supervisor.initialize();
		const dynamic = new Map<string, McpServerConfig>([["plugin-alpha", stdio("alpha")]]);

		expect(await supervisor.setDynamicServers({ servers: dynamic, signature: "plugins-v1" })).toBe(true);
		const firstClient = supervisor.getServerBinding("plugin-alpha")?.client;
		expect(await supervisor.setDynamicServers({ servers: dynamic, signature: "plugins-v1" })).toBe(false);
		expect(supervisor.getServerBinding("plugin-alpha")?.client).toBe(firstClient);

		await supervisor.reload();
		expect(supervisor.getServerBinding("stable")?.view.status).toBe("ready");
		expect(supervisor.getServerBinding("plugin-alpha")?.view.status).toBe("ready");

		expect(await supervisor.setDynamicServers({ servers: new Map(), signature: "none" })).toBe(true);
		expect(supervisor.getServerBinding("plugin-alpha")).toBeUndefined();
	});

	it("provides explicit lifecycle operations without product auth concerns", async () => {
		const source = new MutableConfigSource({ ready: stdio("ready") });
		const clients = new FakeClientFactory();
		const supervisor = createSupervisor(source, clients.create);
		await supervisor.initialize();

		await supervisor.disableServer("ready");
		expect(supervisor.getServerBinding("ready")?.view).toMatchObject({
			status: "stopped",
			config: { disabled: true },
		});
		await supervisor.enableServer("ready");
		expect(supervisor.getServerBinding("ready")?.view).toMatchObject({
			status: "ready",
			config: { disabled: false },
		});

		await supervisor.disconnectServer("ready", {
			status: "needs_auth",
			error: "credentials cleared",
		});
		expect(supervisor.getServerBinding("ready")).toMatchObject({
			view: { status: "needs_auth", tools: [], resources: [], error: "credentials cleared" },
			client: undefined,
		});
		await supervisor.restartServer("ready", stdio("ready"));
		expect(supervisor.getServerBinding("ready")?.view.status).toBe("ready");
		await supervisor.shutdown();
		expect(supervisor.getState().servers).toEqual([]);
	});
});

describe("McpServerSupervisor lazy startup", () => {
	it("restores an unchanged catalog from the cache and defers the connection until first use", async () => {
		const source = new MutableConfigSource({ docs: stdio("docs") });
		const clients = new FakeClientFactory();
		const cache = new FakeCatalogCache();
		cache.seed("docs", computeMcpServerConfigSignature(stdio("docs")), {
			serverInfo: { name: "docs", version: "9" },
			tools: [{ name: "cached-tool", inputSchema: { type: "object" } }],
			resources: [{ uri: "test://docs/cached", name: "cached" }],
		});
		const supervisor = createSupervisor(source, clients.create, { catalogCache: cache });

		await supervisor.initialize();

		// 启动完成但底层连接（进而 stdio 子进程）尚未建立。
		const binding = supervisor.getServerBinding("docs");
		expect(binding?.view).toMatchObject({
			status: "ready",
			serverInfo: { name: "docs", version: "9" },
			tools: [{ name: "cached-tool" }],
			resources: [{ uri: "test://docs/cached", name: "cached" }],
		});
		expect(binding?.view.pid).toBeUndefined();
		expect(clients.clients).toHaveLength(0);
		expect(supervisor.getReadyServerBindings().map((entry) => entry.view.name)).toEqual(["docs"]);

		const lease = binding?.acquireLease();
		if (!lease?.client) throw new Error("Missing lazy binding client");
		const result = await lease.client.callTool("cached-tool");

		expect(result.content).toEqual([]);
		expect(clients.clients).toHaveLength(1);
		expect(clients.clients[0]?.isClientInitialized()).toBe(true);
		expect(supervisor.getServerBinding("docs")?.view.pid).toBe(123);

		await lease.release();
		await supervisor.shutdown();
	});

	it("cold-starts and persists the catalog when no signature entry exists", async () => {
		const source = new MutableConfigSource({ docs: stdio("docs") });
		const clients = new FakeClientFactory();
		const cache = new FakeCatalogCache();
		const supervisor = createSupervisor(source, clients.create, { catalogCache: cache });

		await supervisor.initialize();

		expect(clients.clients).toHaveLength(1);
		expect(supervisor.getServerBinding("docs")?.view.tools).toEqual([
			{ name: "tool-docs", inputSchema: { type: "object" } },
		]);
		expect(cache.stored).toHaveLength(1);
		expect(cache.stored[0]?.name).toBe("docs");
		expect(cache.stored[0]?.signature).toBe(computeMcpServerConfigSignature(stdio("docs")));
		expect(cache.stored[0]?.snapshot.tools.map((tool) => tool.name)).toEqual(["tool-docs"]);

		await supervisor.shutdown();
	});

	it("reconnects through the cache on the next startup when the signature is unchanged", async () => {
		const source = new MutableConfigSource({ docs: stdio("docs") });
		const cache = new FakeCatalogCache();
		const first = new FakeClientFactory();
		const firstSupervisor = createSupervisor(source, first.create, { catalogCache: cache });
		await firstSupervisor.initialize();
		expect(first.clients).toHaveLength(1);
		await firstSupervisor.shutdown();

		const second = new FakeClientFactory();
		const secondSupervisor = createSupervisor(source, second.create, { catalogCache: cache });
		await secondSupervisor.initialize();

		expect(second.clients).toHaveLength(0);
		expect(secondSupervisor.getServerBinding("docs")?.view.tools).toEqual([
			{ name: "tool-docs", inputSchema: { type: "object" } },
		]);
		await secondSupervisor.shutdown();
	});

	it("invalidates the cached catalog when the configuration signature changes", async () => {
		const source = new MutableConfigSource({ docs: stdio("docs-v1") });
		const clients = new FakeClientFactory();
		const cache = new FakeCatalogCache();
		cache.seed("docs", computeMcpServerConfigSignature(stdio("docs-old")), {
			serverInfo: { name: "docs", version: "1" },
			tools: [{ name: "stale-tool", inputSchema: { type: "object" } }],
			resources: [],
		});
		const supervisor = createSupervisor(source, clients.create, { catalogCache: cache });

		await supervisor.initialize();

		expect(clients.clients).toHaveLength(1);
		expect(supervisor.getServerBinding("docs")?.view.tools).toEqual([
			{ name: "tool-docs", inputSchema: { type: "object" } },
		]);
		await supervisor.shutdown();
	});

	it("keeps explicit lifecycle operations eager while initialize stays lazy", async () => {
		const source = new MutableConfigSource({ docs: stdio("docs") });
		const clients = new FakeClientFactory();
		const cache = new FakeCatalogCache();
		cache.seed("docs", computeMcpServerConfigSignature(stdio("docs")), {
			serverInfo: { name: "docs", version: "9" },
			tools: [{ name: "cached-tool", inputSchema: { type: "object" } }],
			resources: [],
		});
		const supervisor = createSupervisor(source, clients.create, { catalogCache: cache });
		await supervisor.initialize();
		expect(clients.clients).toHaveLength(0);

		await supervisor.restartServer("docs", stdio("docs-v2"));

		expect(clients.clients).toHaveLength(1);
		expect(supervisor.getServerBinding("docs")?.view.tools).toEqual([
			{ name: "tool-docs", inputSchema: { type: "object" } },
		]);
		await supervisor.shutdown();
	});

	it("retries the connection on the next call after a first-use failure", async () => {
		const source = new MutableConfigSource({ docs: stdio("docs") });
		const clients = new FakeClientFactory();
		const cache = new FakeCatalogCache();
		cache.seed("docs", computeMcpServerConfigSignature(stdio("docs")), {
			serverInfo: { name: "docs", version: "9" },
			tools: [{ name: "cached-tool", inputSchema: { type: "object" } }],
			resources: [],
		});
		clients.initializeErrors.set("docs", new Error("spawn failed"));
		const supervisor = createSupervisor(source, clients.create, { catalogCache: cache });
		await supervisor.initialize();

		const client = supervisor.getServerBinding("docs")?.client;
		if (!client) throw new Error("Missing lazy binding client");
		await expect(client.callTool("cached-tool")).rejects.toThrow("spawn failed");
		expect(clients.clients).toHaveLength(1);
		expect(clients.clients[0]?.closed).toBe(true);
		expect(supervisor.getServerBinding("docs")?.view.status).toBe("ready");

		clients.initializeErrors.delete("docs");
		await expect(client.callTool("cached-tool")).resolves.toEqual({ content: [] });
		expect(clients.clients).toHaveLength(2);
		await supervisor.shutdown();
	});

	it("moves the server to needs_auth when first use requires authorization", async () => {
		const source = new MutableConfigSource({ docs: stdio("docs") });
		const clients = new FakeClientFactory();
		const cache = new FakeCatalogCache();
		cache.seed("docs", computeMcpServerConfigSignature(stdio("docs")), {
			serverInfo: { name: "docs", version: "9" },
			tools: [{ name: "cached-tool", inputSchema: { type: "object" } }],
			resources: [],
		});
		clients.initializeErrors.set("docs", new McpAuthRequiredError("docs", "https://auth.test/mcp"));
		const supervisor = createSupervisor(source, clients.create, { catalogCache: cache });
		await supervisor.initialize();

		const client = supervisor.getServerBinding("docs")?.client;
		if (!client) throw new Error("Missing lazy binding client");
		await expect(client.callTool("cached-tool")).rejects.toThrow(McpAuthRequiredError);
		expect(supervisor.getServerBinding("docs")?.view.status).toBe("needs_auth");
		expect(supervisor.getReadyServerBindings()).toHaveLength(0);
		await supervisor.shutdown();
	});

	describe("idle recycling", () => {
		it("recycles an idle stdio connection and reconnects on the next call", async () => {
			vi.useFakeTimers();
			const source = new MutableConfigSource({ docs: stdio("docs") });
			const clients = new FakeClientFactory();
			const supervisor = createSupervisor(source, clients.create, { idleTimeoutMs: 1000 });
			await supervisor.initialize();
			expect(clients.clients).toHaveLength(1);

			await vi.advanceTimersByTimeAsync(1500);

			// 目录状态（工具列表、ready 状态）保留，进程已回收。
			expect(clients.clients[0]?.closed).toBe(true);
			expect(supervisor.getServerBinding("docs")?.view).toMatchObject({ status: "ready", pid: undefined });
			expect(supervisor.getServerBinding("docs")?.view.tools).toEqual([
				{ name: "tool-docs", inputSchema: { type: "object" } },
			]);

			const client = supervisor.getServerBinding("docs")?.client;
			if (!client) throw new Error("Missing binding client");
			await expect(client.callTool("tool-docs")).resolves.toEqual({ content: [] });
			expect(clients.clients).toHaveLength(2);
			expect(clients.clients[1]?.isClientInitialized()).toBe(true);
			expect(supervisor.getServerBinding("docs")?.view.pid).toBe(123);
			await supervisor.shutdown();
		});

		it("does not recycle while a lease or an in-flight request owns the connection", async () => {
			vi.useFakeTimers();
			const source = new MutableConfigSource({ docs: stdio("docs") });
			const clients = new FakeClientFactory();
			const supervisor = createSupervisor(source, clients.create, { idleTimeoutMs: 1000 });
			await supervisor.initialize();
			const binding = supervisor.getServerBinding("docs");
			if (!binding?.client) throw new Error("Missing binding client");
			const lease = binding.acquireLease();

			// 持有 lease 期间即使超过阈值也不回收。
			await vi.advanceTimersByTimeAsync(5000);
			expect(clients.clients[0]?.closed).toBe(false);

			// lease 释放后若已无活动且超过阈值，下一次计时即回收。
			await lease.release();
			await vi.advanceTimersByTimeAsync(10);
			expect(clients.clients[0]?.closed).toBe(true);

			// 重连后 gate 住的请求让 in-flight>0，同样阻断回收。
			const gate = new Deferred<void>();
			clients.callToolGates.set("docs", gate);
			const pending = binding.client.callTool("tool-docs");
			expect(clients.clients).toHaveLength(2);
			await vi.advanceTimersByTimeAsync(5000);
			expect(clients.clients[1]?.closed).toBe(false);

			gate.resolve();
			await pending;
			await vi.advanceTimersByTimeAsync(1500);
			expect(clients.clients[1]?.closed).toBe(true);
			await supervisor.shutdown();
		});

		it("honours the per-server idleTimeout override and zero disables recycling", async () => {
			vi.useFakeTimers();
			const source = new MutableConfigSource({
				fast: { command: "fast", idleTimeout: 50 },
				sticky: { command: "sticky", idleTimeout: 0 },
			});
			const clients = new FakeClientFactory();
			const supervisor = createSupervisor(source, clients.create, { idleTimeoutMs: 60_000 });
			await supervisor.initialize();
			expect(clients.clients).toHaveLength(2);

			await vi.advanceTimersByTimeAsync(5000);
			expect(clients.clients.find((client) => client.name === "fast")?.closed).toBe(true);
			expect(clients.clients.find((client) => client.name === "sticky")?.closed).toBe(false);
			await supervisor.shutdown();
		});

		it("never idles out http servers", async () => {
			vi.useFakeTimers();
			const source = new MutableConfigSource({ web: http("web") });
			const clients = new FakeClientFactory();
			const supervisor = createSupervisor(source, clients.create, { idleTimeoutMs: 100 });
			await supervisor.initialize();

			await vi.advanceTimersByTimeAsync(10_000);
			expect(clients.clients[0]?.closed).toBe(false);
			await supervisor.shutdown();
		});
	});

	it("fails a pending first-use call when the server generation is retired mid-connect", async () => {
		const source = new MutableConfigSource({ docs: stdio("docs") });
		const clients = new FakeClientFactory();
		const cache = new FakeCatalogCache();
		cache.seed("docs", computeMcpServerConfigSignature(stdio("docs")), {
			serverInfo: { name: "docs", version: "9" },
			tools: [{ name: "cached-tool", inputSchema: { type: "object" } }],
			resources: [],
		});
		const gate = new Deferred<void>();
		clients.initializeGates.set("docs", gate);
		const supervisor = createSupervisor(source, clients.create, { catalogCache: cache });
		await supervisor.initialize();

		const client = supervisor.getServerBinding("docs")?.client;
		if (!client) throw new Error("Missing lazy binding client");
		const pending = client.callTool("cached-tool");
		pending.catch(() => undefined);
		expect(clients.clients).toHaveLength(1);

		// shutdown() 不需要等 gate：facade 会同步标记关闭，随后解除 gate 时
		// 连接尝试发现自己已被取代并以明确的终态失败。
		const shutdown = supervisor.shutdown();
		gate.resolve();
		await expect(pending).rejects.toThrow(/closed|superseded/);
		expect(clients.clients[0]?.closed).toBe(true);
		await shutdown;
	});
});

afterEach(() => {
	vi.useRealTimers();
});

describe("computeMcpServerConfigSignature", () => {
	it("is stable across key order and ignores non-serializable fields", () => {
		const left: McpServerConfig = {
			command: "server",
			args: ["a", "b"],
			env: { ONE: "1", TWO: "2" },
			startupTimeout: 3000,
		};
		const right: McpServerConfig = {
			startupTimeout: 3000,
			env: { TWO: "2", ONE: "1" },
			args: ["a", "b"],
			command: "server",
		};
		expect(computeMcpServerConfigSignature(left)).toBe(computeMcpServerConfigSignature(right));
		expect(computeMcpServerConfigSignature(left)).not.toBe(
			computeMcpServerConfigSignature({ ...left, args: ["b", "a"] }),
		);

		const withResolver = {
			type: "http",
			url: "https://server.test/mcp",
			resolveUrl: () => "https://resolved.test/mcp",
		} as unknown as McpServerConfig;
		const plain = { type: "http", url: "https://server.test/mcp" } as McpServerConfig;
		expect(computeMcpServerConfigSignature(withResolver)).toBe(computeMcpServerConfigSignature(plain));
	});
});

class MutableConfigSource implements McpConfigSource {
	signature = "files-v1";
	loadError: Error | undefined;

	constructor(public servers: Record<string, McpServerConfig>) {}

	loadGlobal(): McpConfig | null {
		return null;
	}

	loadProject(): McpConfig | null {
		return { mcpServers: this.servers };
	}

	loadMerged(): McpConfig {
		if (this.loadError) throw this.loadError;
		return { mcpServers: this.servers };
	}

	getMergedSignature(): string {
		return this.signature;
	}

	getConfigPaths(): { readonly global: string; readonly project: string } {
		return { global: "global.json", project: "project.json" };
	}
}

class FakeClientFactory {
	readonly initializeErrors = new Map<string, Error>();
	readonly initializeGates = new Map<string, Deferred<void>>();
	readonly toolListErrors = new Set<string>();
	readonly resourceListErrors = new Set<string>();
	readonly callToolErrors = new Set<string>();
	readonly callToolGates = new Map<string, Deferred<void>>();
	readonly clients: FakeClient[] = [];

	readonly create: RuntimeMcpClientFactory = (name) => {
		const client = new FakeClient(
			name,
			this.initializeErrors.get(name),
			this.toolListErrors.has(name),
			this.resourceListErrors.has(name),
			this.initializeGates.get(name),
			this.callToolErrors.has(name),
			this.callToolGates.get(name),
		);
		this.clients.push(client);
		return client;
	};
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

class FakeClient implements McpClientHandle {
	private initialized = false;
	closed = false;

	constructor(
		readonly name: string,
		private readonly initializeError?: Error,
		private readonly toolListError = false,
		private readonly resourceListError = false,
		private readonly initializeGate?: Deferred<void>,
		private readonly callToolError = false,
		private readonly callToolGate?: Deferred<void>,
	) {}

	async initialize(_params: McpInitializeParams): Promise<McpInitializeResult> {
		await this.initializeGate?.promise;
		if (this.initializeError) throw this.initializeError;
		this.initialized = true;
		return {
			protocolVersion: "test",
			serverInfo: { name: this.name, version: "1" },
			capabilities: { tools: {}, resources: {} },
		};
	}

	async listTools() {
		if (this.toolListError) throw new Error("tool discovery failed");
		return { tools: [{ name: `tool-${this.name}`, inputSchema: { type: "object" as const } }] };
	}

	async callTool(_name: string, _args?: McpJsonObject): Promise<McpToolCallResult> {
		if (this.callToolError) throw new Error("tool call failed");
		await this.callToolGate?.promise;
		return { content: [] };
	}

	async listResources() {
		if (this.resourceListError) throw new Error("resource discovery failed");
		return { resources: [{ uri: `test://${this.name}`, name: this.name }] };
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
		return 123;
	}

	isClientInitialized(): boolean {
		return this.initialized;
	}
}

class FakeCatalogCache implements McpServerCatalogCache {
	private readonly entries = new Map<string, McpServerCatalogSnapshot>();
	readonly stored: { name: string; signature: string; snapshot: McpServerCatalogSnapshot }[] = [];
	loadError: Error | undefined;
	storeError: Error | undefined;

	seed(name: string, signature: string, snapshot: McpServerCatalogSnapshot): void {
		this.entries.set(`${name}${signature}`, snapshot);
	}

	async load(name: string, signature: string): Promise<McpServerCatalogSnapshot | undefined> {
		if (this.loadError) throw this.loadError;
		return this.entries.get(`${name}${signature}`);
	}

	async store(name: string, signature: string, snapshot: McpServerCatalogSnapshot): Promise<void> {
		if (this.storeError) throw this.storeError;
		this.stored.push({ name, signature, snapshot });
		this.entries.set(`${name}${signature}`, snapshot);
	}
}

function createSupervisor(
	source: McpConfigSource,
	clientFactory: RuntimeMcpClientFactory,
	options?: Pick<McpServerSupervisorOptions, "catalogCache" | "idleTimeoutMs">,
) {
	return new McpServerSupervisor({
		configSource: source,
		clientFactory,
		protocolVersion: "test",
		clientInfo: { name: "runtime-test", version: "1" },
		catalogCache: options?.catalogCache,
		idleTimeoutMs: options?.idleTimeoutMs,
	});
}

function stdio(command: string): McpServerConfig {
	return { command };
}

function http(name: string): McpServerConfig {
	return { type: "http", url: `https://${name}.test/mcp` };
}
