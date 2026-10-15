// Modified by The Open Forge contributors.

import {
	isMcpAuthRequiredError,
	LazyMcpClientHandle,
	type McpClientHandle,
	type RuntimeMcpClientFactory,
} from "../client/index.js";
import type { McpConfigSource } from "../config/index.js";
import type {
	McpClientCapabilities,
	McpClientInfo,
	McpConfig,
	McpInitializeParams,
	McpResource,
	McpServerConfig,
	McpServerInfo,
	McpServerInteractionHandlers,
	McpServerStatus,
	McpTool,
} from "../protocol/index.js";
import { isStdioServerConfig } from "../protocol/index.js";
import {
	computeMcpServerConfigSignature,
	type McpServerCatalogCache,
	type McpServerCatalogSnapshot,
	toMcpServerCatalogSnapshot,
} from "./catalog-cache.js";
import type {
	McpDynamicServerSet,
	McpServerBinding,
	McpServerBindingLease,
	McpServerDisconnectOutcome,
	McpServerSupervisorState,
	McpServerSupervisorStats,
	McpServerView,
} from "./contracts.js";

interface ManagedMcpServer {
	name: string;
	config: McpServerConfig;
	status: McpServerStatus;
	serverInfo?: McpServerInfo;
	client?: McpClientHandle;
	tools: McpTool[];
	resources: McpResource[];
	error?: string;
	pid?: number;
	startedAt?: number;
	activeLeases: number;
	retired: boolean;
	closePromise?: Promise<void>;
	lastActivityAt?: number;
	idleTimer?: ReturnType<typeof setTimeout>;
	readonly unusedWaiters: Array<() => void>;
}

export interface McpServerSupervisorOptions {
	readonly configSource: McpConfigSource;
	readonly clientFactory: RuntimeMcpClientFactory;
	readonly protocolVersion: string;
	readonly clientInfo: McpClientInfo;
	readonly enabled?: boolean;
	readonly debug?: boolean;
	readonly onDiagnostic?: (message: string) => void;
	readonly interactionHandlers?: McpServerInteractionHandlers;
	/** Additional product capabilities such as negotiated MCP extensions. */
	readonly clientCapabilities?: McpClientCapabilities;
	readonly authRequiredErrorMatcher?: (error: unknown) => boolean;
	/** Product-owned defaults. File config may override the same name. */
	readonly builtinServers?: Readonly<Record<string, McpServerConfig>>;
	/**
	 * Optional durable tool catalog cache. When provided, `initialize()` hydrates
	 * server catalogs for unchanged configurations and defers the connection to
	 * first use instead of eagerly spawning every server.
	 */
	readonly catalogCache?: McpServerCatalogCache;
	/**
	 * Default idle timeout (ms) for stdio servers. Once a spawned server has
	 * been idle for this long — no in-flight request and no admitted lease —
	 * the supervisor disconnects it and reclaims the process while keeping the
	 * catalog published; the next call reconnects transparently. A per-server
	 * `idleTimeout` config overrides this value; `0` disables recycling.
	 */
	readonly idleTimeoutMs?: number;
}

/** Fallback idle timeout for stdio servers when nothing configures one. */
export const MCP_DEFAULT_STDIO_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Owns MCP server lifecycle and file/dynamic config reconciliation.
 * Product-specific auth UX and tool adaptation remain in host adapters.
 */
export class McpServerSupervisor {
	private readonly servers = new Map<string, ManagedMcpServer>();
	private readonly retiredServers = new Set<ManagedMcpServer>();
	private readonly configSource: McpConfigSource;
	private readonly clientFactory: RuntimeMcpClientFactory;
	private readonly protocolVersion: string;
	private readonly clientInfo: McpClientInfo;
	private readonly debug: boolean;
	private readonly onDiagnostic?: (message: string) => void;
	private readonly interactionHandlers?: McpServerInteractionHandlers;
	private readonly clientCapabilities?: McpClientCapabilities;
	private readonly authRequiredErrorMatcher: (error: unknown) => boolean;
	private readonly catalogCache?: McpServerCatalogCache;
	private readonly idleTimeoutMs?: number;
	private enabled: boolean;
	private readonly builtinServers = new Map<string, McpServerConfig>();
	private dynamicServers = new Map<string, McpServerConfig>();
	private dynamicSignature = "none";
	private lastSignature: string | undefined;
	private globalConfig: McpConfig | undefined;
	private projectConfig: McpConfig | undefined;
	private reconcileRevision = 0;

	constructor(options: McpServerSupervisorOptions) {
		this.configSource = options.configSource;
		this.clientFactory = options.clientFactory;
		this.protocolVersion = options.protocolVersion;
		this.clientInfo = options.clientInfo;
		this.enabled = options.enabled ?? true;
		this.debug = options.debug ?? false;
		this.onDiagnostic = options.onDiagnostic;
		this.interactionHandlers = options.interactionHandlers;
		this.clientCapabilities = options.clientCapabilities;
		this.authRequiredErrorMatcher = options.authRequiredErrorMatcher ?? isMcpAuthRequiredError;
		this.catalogCache = options.catalogCache;
		this.idleTimeoutMs = options.idleTimeoutMs;
		for (const [name, config] of Object.entries(options.builtinServers ?? {})) {
			if (name && !name.includes("_")) this.builtinServers.set(name, config);
		}
	}

	async initialize(): Promise<void> {
		if (!this.enabled) {
			this.log("MCP is disabled, skipping initialization");
			return;
		}

		try {
			this.globalConfig = this.configSource.loadGlobal() ?? undefined;
			this.projectConfig = this.configSource.loadProject() ?? undefined;
			const config = this.loadEffectiveConfig();
			const starts: Promise<ManagedMcpServer>[] = [];
			for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
				if (serverConfig.disabled) {
					this.log(`Skipping disabled server: ${name}`);
					continue;
				}
				// Lazy startup: servers whose catalog cache entry matches the
				// current configuration signature are hydrated without spawning a
				// process; the real connection happens on first use.
				starts.push(this.startServer(name, serverConfig, true, { lazyStart: true }));
			}
			await Promise.allSettled(starts);
			this.lastSignature = this.combinedSignature();
			this.log(`Initialized ${this.servers.size} MCP servers`);
		} catch (error) {
			this.log(`Failed to initialize MCP servers: ${getErrorMessage(error)}`);
			throw error;
		}
	}

	async setDynamicServers(next: McpDynamicServerSet): Promise<boolean> {
		if (!this.enabled) {
			this.dynamicServers.clear();
			this.dynamicSignature = "none";
			return false;
		}
		if (next.signature === this.dynamicSignature && mapsEqualConfig(this.dynamicServers, next.servers)) {
			return false;
		}
		this.dynamicServers = new Map(next.servers);
		this.dynamicSignature = next.signature;
		return this.reconcileToEffectiveConfig();
	}

	hasConfigChanged(): boolean {
		if (!this.enabled) return false;
		return this.lastSignature !== this.combinedSignature();
	}

	async reloadIfChanged(): Promise<boolean> {
		if (!this.enabled) return false;
		const signature = this.combinedSignature();
		if (this.lastSignature !== undefined && this.lastSignature === signature) return false;
		this.log("MCP config changed, diff-reloading");
		return this.reconcileToEffectiveConfig();
	}

	async reload(): Promise<void> {
		this.log("Reloading MCP configuration");
		this.lastSignature = undefined;
		await this.reconcileToEffectiveConfig();
	}

	async restartServer(name: string, config: McpServerConfig): Promise<void> {
		const current = this.servers.get(name);
		if (config.disabled) {
			if (current) {
				this.servers.delete(name);
				await this.retireServer(current);
			}
			return;
		}
		const candidate = await this.startServer(name, config, false);
		if (candidate.status !== "ready") {
			if (current) {
				await this.retireServer(candidate);
				this.log(`Server ${name} candidate failed; keeping last-known-good generation`);
			} else {
				this.servers.set(name, candidate);
			}
			return;
		}
		this.servers.set(name, candidate);
		if (current) await this.retireServer(current);
	}

	async disconnectServer(name: string, outcome: McpServerDisconnectOutcome): Promise<void> {
		const server = this.servers.get(name);
		if (!server) return;
		this.servers.delete(name);
		await this.retireServer(server);
		this.servers.set(name, createManagedServer(name, server.config, outcome.status, outcome.error));
	}

	async enableServer(name: string): Promise<void> {
		const server = this.servers.get(name);
		if (!server) throw new Error(`Server '${name}' not found`);
		if (server.status === "ready") {
			this.log(`Server ${name} is already enabled`);
			return;
		}
		const candidate = await this.startServer(name, { ...server.config, disabled: false }, false);
		if (candidate.status !== "ready") {
			await this.retireServer(candidate);
			this.log(`Server ${name} enable failed; keeping stopped generation`);
			return;
		}
		this.servers.set(name, candidate);
		await this.retireServer(server);
	}

	async disableServer(name: string): Promise<void> {
		const server = this.servers.get(name);
		if (!server) throw new Error(`Server '${name}' not found`);
		const config = { ...server.config, disabled: true };
		this.servers.delete(name);
		await this.retireServer(server);
		this.servers.set(name, createManagedServer(name, config, "stopped"));
		this.log(`Server ${name} disabled`);
	}

	async shutdown(): Promise<void> {
		this.log("Shutting down all MCP servers");
		const generations = [...this.servers.values(), ...this.retiredServers];
		this.servers.clear();
		for (const server of generations) await this.retireServer(server);
		await Promise.all(generations.map((server) => this.waitForServerDisposal(server)));
		this.log("All MCP servers shut down");
	}

	getServerBinding(name: string): McpServerBinding | undefined {
		const server = this.servers.get(name);
		return server ? toBinding(server, () => this.acquireServerLease(server)) : undefined;
	}

	getServerBindings(): McpServerBinding[] {
		return [...this.servers.values()].map((server) => toBinding(server, () => this.acquireServerLease(server)));
	}

	getReadyServerBindings(): McpServerBinding[] {
		return [...this.servers.values()]
			.filter((server) => server.status === "ready" && server.client !== undefined)
			.map((server) => toBinding(server, () => this.acquireServerLease(server)));
	}

	getState(): McpServerSupervisorState {
		return {
			enabled: this.enabled,
			servers: [...this.servers.values()].map(toView),
			globalConfig: this.globalConfig,
			projectConfig: this.projectConfig,
		};
	}

	getStats(): McpServerSupervisorStats {
		let readyServers = 0;
		let errorServers = 0;
		let totalTools = 0;
		let totalResources = 0;
		for (const server of this.servers.values()) {
			if (server.status === "ready") {
				readyServers++;
				totalTools += server.tools.length;
				totalResources += server.resources.length;
			} else if (server.status === "error") {
				errorServers++;
			}
		}
		return {
			totalServers: this.servers.size,
			readyServers,
			errorServers,
			totalTools,
			totalResources,
			retiredServers: this.retiredServers.size,
			activeLeases: [...this.servers.values(), ...this.retiredServers].reduce(
				(total, server) => total + server.activeLeases,
				0,
			),
		};
	}

	isEnabled(): boolean {
		return this.enabled;
	}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	getConfigPaths(): { readonly global: string; readonly project: string } {
		return this.configSource.getConfigPaths();
	}

	private loadEffectiveConfig(): McpConfig {
		const merged = this.configSource.loadMerged();
		const mcpServers: Record<string, McpServerConfig> = Object.fromEntries(this.builtinServers);
		Object.assign(mcpServers, merged.mcpServers);
		for (const [name, config] of this.dynamicServers) mcpServers[name] = config;
		return { mcpServers };
	}

	private combinedSignature(): string {
		return `${this.configSource.getMergedSignature()}|dynamic:${this.dynamicSignature}`;
	}

	private async startServer(
		name: string,
		config: McpServerConfig,
		publish = true,
		options?: { readonly lazyStart?: boolean },
	): Promise<ManagedMcpServer> {
		this.log(`Initializing server: ${name}`);
		const startedAt = Date.now();
		let handshakeMs = 0;
		let toolsMs = 0;
		let resourcesMs = 0;
		const server = createManagedServer(name, config, "starting");
		if (publish) this.servers.set(name, server);

		try {
			const signature = computeMcpServerConfigSignature(config);
			const initParams: McpInitializeParams = {
				protocolVersion: this.protocolVersion,
				clientInfo: this.clientInfo,
				capabilities: buildClientCapabilities(this.interactionHandlers, this.clientCapabilities),
			};
			const facade = new LazyMcpClientHandle({
				name,
				createClient: () =>
					this.clientFactory(name, config, {
						debug: this.debug || config.debug,
						onDiagnostic: (message) => this.log(message),
						interactionHandlers: this.interactionHandlers,
					}),
				init: (client) => client.initialize(initParams),
				onConnected: (result) => {
					server.serverInfo = result.serverInfo;
					server.pid = facade.getPid();
					server.startedAt = Date.now();
					handshakeMs = Date.now() - startedAt;
					this.noteServerActivity(server);
				},
				onConnectFailed: (error) => {
					// A lazy first-use failure keeps the cached catalog published so
					// the call site can retry; only auth-required failures move the
					// server into the terminal needs_auth state.
					if (this.servers.get(name) === server && this.authRequiredErrorMatcher(error)) {
						server.status = "needs_auth";
						server.error = getErrorMessage(error);
						this.log(`Server ${name} needs OAuth authorization`);
					}
				},
				onInFlightChange: () => this.noteServerActivity(server),
				onDiagnostic: (message) => this.log(message),
			});
			server.client = facade;

			const cached = options?.lazyStart === true ? await this.loadCatalogCache(name, signature) : undefined;
			if (cached) {
				server.serverInfo = cached.serverInfo;
				server.tools = [...cached.tools];
				server.resources = [...cached.resources];
				server.status = "ready";
				server.error = undefined;
				if (publish && this.servers.get(name) !== server) {
					await this.retireServer(server);
					return server;
				}
				this.log(
					`Server ${name} restored ${server.tools.length} tools from the catalog cache; connection deferred until first use`,
				);
				return server;
			}

			const result = await facade.initialize(initParams);
			// onConnected already recorded serverInfo/pid/startedAt.

			if (result.capabilities?.tools) {
				const toolsStartedAt = Date.now();
				try {
					server.tools = (await facade.listTools()).tools;
					this.log(`Server ${name} provides ${server.tools.length} tools`);
				} catch (error) {
					this.log(`Failed to list tools for ${name}: ${getErrorMessage(error)}`);
				} finally {
					toolsMs = Date.now() - toolsStartedAt;
				}
			}
			if (result.capabilities?.resources) {
				const resourcesStartedAt = Date.now();
				try {
					server.resources = (await facade.listResources()).resources;
					this.log(`Server ${name} provides ${server.resources.length} resources`);
				} catch (error) {
					this.log(`Failed to list resources for ${name}: ${getErrorMessage(error)}`);
				} finally {
					resourcesMs = Date.now() - resourcesStartedAt;
				}
			}

			server.status = "ready";
			server.error = undefined;
			if (publish && this.servers.get(name) !== server) {
				await this.retireServer(server);
				return server;
			}
			await this.storeCatalogCache(
				name,
				signature,
				toMcpServerCatalogSnapshot(result, server.tools, server.resources),
			);
			this.log(`Server ${name} is ready`);
			this.log(
				`MCP server startup timing name=${name} handshakeMs=${handshakeMs} toolsMs=${toolsMs} resourcesMs=${resourcesMs} totalMs=${Date.now() - startedAt}`,
			);
		} catch (error) {
			const failedClient = server.client;
			if (failedClient) {
				try {
					await failedClient.close();
				} catch (closeError) {
					this.log(`Error closing failed server ${name}: ${getErrorMessage(closeError)}`);
				}
				server.client = undefined;
			}
			if (this.authRequiredErrorMatcher(error)) {
				server.status = "needs_auth";
				server.error = getErrorMessage(error);
				this.log(`Server ${name} needs OAuth authorization`);
				return server;
			}
			server.status = "error";
			server.error = getErrorMessage(error);
			this.log(`Failed to initialize server ${name}: ${server.error}`);
		}
		return server;
	}

	private async loadCatalogCache(name: string, signature: string): Promise<McpServerCatalogSnapshot | undefined> {
		if (!this.catalogCache) return undefined;
		try {
			return await this.catalogCache.load(name, signature);
		} catch (error) {
			this.log(`Failed to read the MCP catalog cache for ${name}: ${getErrorMessage(error)}`);
			return undefined;
		}
	}

	private async storeCatalogCache(name: string, signature: string, snapshot: McpServerCatalogSnapshot): Promise<void> {
		if (!this.catalogCache) return;
		try {
			await this.catalogCache.store(name, signature, snapshot);
		} catch (error) {
			this.log(`Failed to persist the MCP catalog cache for ${name}: ${getErrorMessage(error)}`);
		}
	}

	/**
	 * Records server usage and rearms the idle countdown. Called whenever the
	 * facade's in-flight count changes and whenever a (re)connection completes.
	 */
	private noteServerActivity(server: ManagedMcpServer): void {
		server.lastActivityAt = Date.now();
		this.scheduleIdleRecycle(server);
	}

	private effectiveIdleTimeoutMs(server: ManagedMcpServer): number {
		if (!isStdioServerConfig(server.config)) return 0;
		const configured = server.config.idleTimeout ?? this.idleTimeoutMs ?? MCP_DEFAULT_STDIO_IDLE_TIMEOUT_MS;
		return configured > 0 ? configured : 0;
	}

	private scheduleIdleRecycle(server: ManagedMcpServer): void {
		if (server.idleTimer !== undefined) {
			clearTimeout(server.idleTimer);
			server.idleTimer = undefined;
		}
		const timeout = this.effectiveIdleTimeoutMs(server);
		if (timeout <= 0 || server.retired) return;
		const client = server.client;
		if (!(client instanceof LazyMcpClientHandle) || !client.isConnected()) return;
		// Arm for the remaining idle budget, not a full timeout: a lease released
		// long after the last request still recycles at the activity deadline.
		const remaining = Math.max(0, timeout - (Date.now() - (server.lastActivityAt ?? Date.now())));
		const timer = setTimeout(() => {
			server.idleTimer = undefined;
			void this.recycleIdleServer(server);
		}, remaining);
		// A pending recycle must never keep a CLI or test process alive on its own.
		(timer as unknown as { unref?: () => void }).unref?.();
		server.idleTimer = timer;
	}

	/**
	 * Drops the connection of a stdio server that stayed idle past its timeout.
	 * The catalog stays published and the facade reconnects on the next call, so
	 * this is only a process-reclaim, never a state reset. A failed recheck
	 * rearms nothing — the next activity transition schedules a fresh timer.
	 */
	private async recycleIdleServer(server: ManagedMcpServer): Promise<void> {
		if (server.retired || this.servers.get(server.name) !== server) return;
		const client = server.client;
		if (!(client instanceof LazyMcpClientHandle) || !client.isConnected()) return;
		if (server.activeLeases > 0 || client.getInFlightCount() > 0) return;
		const timeout = this.effectiveIdleTimeoutMs(server);
		if (timeout <= 0) return;
		const elapsed = Date.now() - (server.lastActivityAt ?? 0);
		if (elapsed < timeout) {
			this.scheduleIdleRecycle(server);
			return;
		}
		this.log(`Recycling idle MCP server ${server.name} after ${elapsed}ms without requests`);
		server.pid = undefined;
		server.startedAt = undefined;
		// disconnect() reports close failures via onDiagnostic instead of
		// rejecting, so the fire-and-forget timer path cannot leak a rejection.
		await client.disconnect();
	}

	private async reconcileToEffectiveConfig(): Promise<boolean> {
		const revision = ++this.reconcileRevision;
		let config: McpConfig;
		try {
			config = this.loadEffectiveConfig();
		} catch (error) {
			this.log(`Failed to load effective MCP config, keeping current state: ${getErrorMessage(error)}`);
			this.lastSignature = this.combinedSignature();
			return false;
		}

		const candidates = new Map<string, ManagedMcpServer>();
		const starts: Promise<void>[] = [];
		for (const [name, nextConfig] of Object.entries(config.mcpServers)) {
			const current = this.servers.get(name);
			if (nextConfig.disabled || (current && configsEqual(current.config, nextConfig))) continue;
			starts.push(
				this.startServer(name, nextConfig, false).then((candidate) => {
					candidates.set(name, candidate);
				}),
			);
		}
		await Promise.allSettled(starts);
		if (revision !== this.reconcileRevision) {
			await Promise.all([...candidates.values()].map((candidate) => this.retireServer(candidate)));
			return false;
		}
		const failed = [...candidates.values()].filter((candidate) => candidate.status !== "ready");
		if (failed.length > 0) {
			await Promise.all([...candidates.values()].map((candidate) => this.retireServer(candidate)));
			this.globalConfig = this.configSource.loadGlobal() ?? undefined;
			this.projectConfig = this.configSource.loadProject() ?? undefined;
			this.lastSignature = this.combinedSignature();
			this.log(
				`MCP candidate generation failed for ${failed.map(({ name }) => name).join(", ")}; keeping complete last-known-good generation`,
			);
			return false;
		}

		let changed = false;
		const retired: ManagedMcpServer[] = [];
		for (const [name, current] of [...this.servers]) {
			const nextConfig = config.mcpServers[name];
			if (nextConfig && configsEqual(current.config, nextConfig)) continue;
			const candidate = candidates.get(name);
			if (candidate) this.servers.set(name, candidate);
			else this.servers.delete(name);
			retired.push(current);
			changed = true;
		}
		// Adopt in configuration order so the tool surface order follows the
		// declared registration order (ADR-0071), not the race-dependent order in
		// which each candidate's connection attempt happened to finish.
		for (const name of Object.keys(config.mcpServers)) {
			if (this.servers.has(name)) continue;
			const candidate = candidates.get(name);
			if (!candidate) continue;
			this.servers.set(name, candidate);
			changed = true;
		}
		// Publish the complete candidate set without an await so no Turn can observe
		// a mixture of old and new server generations during physical retirement.
		await Promise.all(retired.map((server) => this.retireServer(server)));
		this.globalConfig = this.configSource.loadGlobal() ?? undefined;
		this.projectConfig = this.configSource.loadProject() ?? undefined;
		this.lastSignature = this.combinedSignature();
		this.log(`Reconcile done, ${this.servers.size} servers active`);
		return changed;
	}

	private log(message: string): void {
		this.onDiagnostic?.(message);
	}

	private acquireServerLease(server: ManagedMcpServer): McpServerBindingLease {
		if (server.retired) throw new Error(`MCP server generation is retired: ${server.name}`);
		server.activeLeases += 1;
		let released = false;
		return {
			view: toView(server),
			client: server.client,
			release: async () => {
				if (released) return;
				released = true;
				server.activeLeases -= 1;
				if (server.activeLeases === 0) {
					this.scheduleIdleRecycle(server);
					for (const resolve of server.unusedWaiters.splice(0)) resolve();
					await this.disposeRetiredServer(server);
				}
			},
		};
	}

	private async retireServer(server: ManagedMcpServer): Promise<void> {
		if (server.idleTimer !== undefined) {
			clearTimeout(server.idleTimer);
			server.idleTimer = undefined;
		}
		if (!server.retired) {
			server.retired = true;
			this.retiredServers.add(server);
		}
		await this.disposeRetiredServer(server);
	}

	private async disposeRetiredServer(server: ManagedMcpServer): Promise<void> {
		if (!server.retired || server.activeLeases > 0) return;
		server.closePromise ??= (async () => {
			if (server.client) {
				try {
					await server.client.close();
				} catch (error) {
					this.log(`Error closing retired server ${server.name}: ${getErrorMessage(error)}`);
				}
			}
			server.client = undefined;
			this.retiredServers.delete(server);
		})();
		await server.closePromise;
	}

	private async waitForServerDisposal(server: ManagedMcpServer): Promise<void> {
		if (server.activeLeases > 0) {
			await new Promise<void>((resolve) => server.unusedWaiters.push(resolve));
		}
		await this.disposeRetiredServer(server);
	}
}

function toView(server: ManagedMcpServer): McpServerView {
	return {
		name: server.name,
		config: server.config,
		status: server.status,
		serverInfo: server.serverInfo,
		tools: server.tools,
		resources: server.resources,
		error: server.error,
		pid: server.pid,
		startedAt: server.startedAt,
	};
}

function toBinding(server: ManagedMcpServer, acquireLease: () => McpServerBindingLease): McpServerBinding {
	return { view: toView(server), client: server.client, acquireLease };
}

function createManagedServer(
	name: string,
	config: McpServerConfig,
	status: McpServerStatus,
	error?: string,
): ManagedMcpServer {
	return {
		name,
		config: { ...config },
		status,
		tools: [],
		resources: [],
		...(error === undefined ? {} : { error }),
		activeLeases: 0,
		retired: false,
		unusedWaiters: [],
	};
}

function mapsEqualConfig(
	left: ReadonlyMap<string, McpServerConfig>,
	right: ReadonlyMap<string, McpServerConfig>,
): boolean {
	if (left.size !== right.size) return false;
	for (const [name, config] of left) {
		const other = right.get(name);
		if (!other || !configsEqual(other, config)) return false;
	}
	return true;
}

function configsEqual(left: McpServerConfig, right: McpServerConfig): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function buildClientCapabilities(
	handlers?: McpServerInteractionHandlers,
	additional: McpClientCapabilities = {},
): McpClientCapabilities {
	return {
		...additional,
		...(handlers?.roots ? { roots: {} } : {}),
		...(handlers?.sampling ? { sampling: {} } : {}),
		...(handlers?.elicitation ? { elicitation: { form: {}, url: {} } } : {}),
	};
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
