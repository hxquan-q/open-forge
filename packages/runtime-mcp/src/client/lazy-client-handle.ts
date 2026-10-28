// Copyright The Open Forge contributors.

import type {
	IMcpClient,
	McpCancelTaskParams,
	McpCancelTaskResult,
	McpGetTaskParams,
	McpGetTaskResult,
	McpInitializeParams,
	McpInitializeResult,
	McpJsonObject,
	McpPromptGetParams,
	McpPromptGetResult,
	McpPromptsListResult,
	McpRequestOptions,
	McpResourceReadResult,
	McpResourcesListResult,
	McpSubscriptionFilter,
	McpSubscriptionHandler,
	McpSubscriptionsListenResult,
	McpTaskWaitOptions,
	McpToolCallResult,
	McpToolsListResult,
	McpUpdateTaskParams,
	McpUpdateTaskResult,
} from "../protocol/index.js";
import type { McpClientHandle } from "./client-handle.js";

export interface LazyMcpClientHandleOptions {
	readonly name: string;
	readonly createClient: () => McpClientHandle;
	readonly init: (client: McpClientHandle) => Promise<McpInitializeResult>;
	readonly onConnected?: (result: McpInitializeResult) => void;
	readonly onConnectFailed?: (error: unknown) => void;
	readonly onInFlightChange?: (inFlight: number) => void;
	readonly onDiagnostic?: (message: string) => void;
}

/**
 * Lazily connects an MCP client on first use and transparently reconnects after
 * an explicit {@link disconnect} (used by idle recycling). Every public request
 * is tracked as an in-flight operation so the supervisor can decide when the
 * connection is truly unused.
 *
 * The handle deliberately keeps no Node.js dependencies so it can live in the
 * platform-neutral runtime package.
 */
export class LazyMcpClientHandle implements McpClientHandle {
	private client?: McpClientHandle;
	private connectingClient?: McpClientHandle;
	private connectPromise?: Promise<McpInitializeResult>;
	private epoch = 0;
	private inFlight = 0;
	private permanentlyClosed = false;

	constructor(private readonly options: LazyMcpClientHandleOptions) {}

	getName(): string {
		return this.options.name;
	}

	getPid(): number | undefined {
		return this.client?.getPid();
	}

	isClientInitialized(): boolean {
		return this.client?.isClientInitialized() ?? false;
	}

	isConnected(): boolean {
		return this.client !== undefined;
	}

	isConnecting(): boolean {
		return this.connectPromise !== undefined && this.client === undefined;
	}

	getInFlightCount(): number {
		return this.inFlight;
	}

	initialize(params: McpInitializeParams): Promise<McpInitializeResult> {
		return this.connect((client) => client.initialize(params));
	}

	listTools(cursor?: string, options?: McpRequestOptions): Promise<McpToolsListResult> {
		return this.invoke((client) => client.listTools(cursor, options));
	}

	callTool(name: string, args?: McpJsonObject, options?: McpRequestOptions): Promise<McpToolCallResult> {
		return this.invoke((client) => client.callTool(name, args, options));
	}

	listResources(cursor?: string, options?: McpRequestOptions): Promise<McpResourcesListResult> {
		return this.invoke((client) => client.listResources(cursor, options));
	}

	readResource(uri: string, options?: McpRequestOptions): Promise<McpResourceReadResult> {
		return this.invoke((client) => client.readResource(uri, options));
	}

	listPrompts(cursor?: string, options?: McpRequestOptions): Promise<McpPromptsListResult> {
		return this.invoke((client) => client.listPrompts(cursor, options));
	}

	async getPrompt(params: McpPromptGetParams, options?: McpRequestOptions): Promise<McpPromptGetResult> {
		return this.invoke((client) => {
			if (!client.getPrompt) {
				throw new Error(`MCP server '${this.options.name}' does not support getPrompt`);
			}
			return client.getPrompt(params, options);
		});
	}

	async getTask(params: McpGetTaskParams, options?: McpRequestOptions): Promise<McpGetTaskResult> {
		return this.invoke((client) => {
			if (!client.getTask) {
				throw new Error(`MCP server '${this.options.name}' does not support getTask`);
			}
			return client.getTask(params, options);
		});
	}

	async updateTask(params: McpUpdateTaskParams, options?: McpRequestOptions): Promise<McpUpdateTaskResult> {
		return this.invoke((client) => {
			if (!client.updateTask) {
				throw new Error(`MCP server '${this.options.name}' does not support updateTask`);
			}
			return client.updateTask(params, options);
		});
	}

	async cancelTask(params: McpCancelTaskParams, options?: McpRequestOptions): Promise<McpCancelTaskResult> {
		return this.invoke((client) => {
			if (!client.cancelTask) {
				throw new Error(`MCP server '${this.options.name}' does not support cancelTask`);
			}
			return client.cancelTask(params, options);
		});
	}

	async waitForTask(params: McpGetTaskParams, options?: McpTaskWaitOptions): Promise<McpGetTaskResult> {
		return this.invoke((client) => {
			if (!client.waitForTask) {
				throw new Error(`MCP server '${this.options.name}' does not support waitForTask`);
			}
			return client.waitForTask(params, options);
		});
	}

	async listenSubscriptions(
		filter: McpSubscriptionFilter,
		onNotification: McpSubscriptionHandler,
		options?: McpRequestOptions,
	): Promise<McpSubscriptionsListenResult> {
		return this.invoke((client) => {
			if (!client.listenSubscriptions) {
				throw new Error(`MCP server '${this.options.name}' does not support listenSubscriptions`);
			}
			return client.listenSubscriptions(filter, onNotification, options);
		});
	}

	/** Permanently closes the handle; any later call fails immediately. */
	async close(): Promise<void> {
		this.permanentlyClosed = true;
		await this.disconnect();
	}

	/**
	 * Drops the current connection without discarding the handle. The next
	 * request transparently reconnects; in-flight requests keep their client
	 * reference and resolve on their own.
	 */
	async disconnect(): Promise<void> {
		this.epoch += 1;
		// A transport already owns resources while its handshake is pending.
		const client = this.client ?? this.connectingClient;
		this.client = undefined;
		this.connectingClient = undefined;
		this.connectPromise = undefined;
		if (!client) return;
		try {
			await client.close();
		} catch (error) {
			this.options.onDiagnostic?.(
				`MCP client '${this.options.name}' failed to close during disconnect: ${toMessage(error)}`,
			);
		}
	}

	private connect(init: (client: McpClientHandle) => Promise<McpInitializeResult>): Promise<McpInitializeResult> {
		if (this.permanentlyClosed) {
			return Promise.reject(new Error(`MCP client '${this.options.name}' is closed`));
		}
		const pending = this.connectPromise;
		if (pending) return pending;
		const epoch = this.epoch;
		const promise = (async (): Promise<McpInitializeResult> => {
			const client = this.options.createClient();
			this.connectingClient = client;
			try {
				const result = await init(client);
				if (this.permanentlyClosed || this.epoch !== epoch) {
					try {
						await client.close();
					} catch (closeError) {
						this.options.onDiagnostic?.(
							`MCP client '${this.options.name}' failed to close a superseded connection: ${toMessage(closeError)}`,
						);
					}
					throw new Error(`MCP client '${this.options.name}' connection was superseded`);
				}
				this.client = client;
				this.options.onConnected?.(result);
				return result;
			} catch (error) {
				// Only clear when this attempt still owns the slot: a disconnect()
				// bumps the epoch and may already have installed a newer attempt.
				if (this.epoch === epoch) this.connectPromise = undefined;
				try {
					await client.close();
				} catch (closeError) {
					this.options.onDiagnostic?.(
						`MCP client '${this.options.name}' failed to close after a failed connect: ${toMessage(closeError)}`,
					);
				}
				this.options.onConnectFailed?.(error);
				throw error;
			} finally {
				if (this.connectingClient === client) this.connectingClient = undefined;
			}
		})();
		this.connectPromise = promise;
		return promise;
	}

	private async invoke<T>(run: (client: IMcpClient) => Promise<T>): Promise<T> {
		// The in-flight window covers the connection attempt as well as the
		// request itself so idle recycling cannot tear down a client that a
		// caller is still trying to establish.
		this.inFlight += 1;
		if (this.inFlight === 1) this.options.onInFlightChange?.(this.inFlight);
		try {
			for (;;) {
				await this.connect(this.options.init);
				const client = this.client;
				if (!client) continue; // The connection was superseded; reconnect.
				return await run(client);
			}
		} finally {
			this.inFlight -= 1;
			if (this.inFlight === 0) this.options.onInFlightChange?.(0);
		}
	}
}

function toMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
