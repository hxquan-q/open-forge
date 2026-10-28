// Modified by The Open Forge contributors.
export type AsyncExecutionGatePhase = "queued" | "started" | "cancelled" | "timed-out" | "rejected" | "released";

/** Identity must come from the host, never from operation arguments or file contents. */
export interface AsyncExecutionGateEvent {
	readonly phase: AsyncExecutionGatePhase;
	readonly timestamp: number;
	readonly ownerId?: string;
	readonly requestId?: string;
	readonly activeCount: number;
	readonly queuedCount: number;
	readonly drainingCount: number;
	readonly waitMs: number;
	readonly heldMs?: number;
}

export interface AsyncExecutionGateRunOptions {
	readonly signal?: AbortSignal;
	/** Only limits admission waiting; it does not limit the operation's execution. */
	readonly waitTimeoutMs?: number;
	readonly ownerId?: string;
	readonly requestId?: string;
	readonly onEvent?: (event: AsyncExecutionGateEvent) => void | Promise<void>;
}

export interface AsyncExecutionGateOptions {
	readonly maxQueued?: number;
	readonly scheduling?: "fifo" | "round-robin";
	readonly now?: () => number;
}

export interface AsyncExecutionGate {
	/** The original operation Promise must represent the lifetime of the held resource. */
	run<T>(operation: () => Promise<T>, options?: AsyncExecutionGateRunOptions): Promise<T>;
}

export type AsyncExecutionGateErrorCode =
	| "ASYNC_EXECUTION_ABORTED"
	| "ASYNC_EXECUTION_QUEUE_FULL"
	| "ASYNC_EXECUTION_WAIT_TIMEOUT";

export class AsyncExecutionGateError extends Error {
	constructor(
		readonly code: AsyncExecutionGateErrorCode,
		message: string,
	) {
		super(message);
		this.name = "AsyncExecutionGateError";
	}
}
