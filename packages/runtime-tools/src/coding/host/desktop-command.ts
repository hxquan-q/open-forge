// Modified by The Open Forge contributors.
export interface DesktopCommandLocation {
	readonly path: string;
	readonly staleConfiguredPath?: string;
}

export interface DesktopCommandResult {
	readonly code: number | null;
	readonly stdout: string;
	readonly stderr: string;
}

export interface CommandProcessOptions {
	readonly signal?: AbortSignal;
	readonly timeoutMs: number;
	readonly maxBufferBytes?: number;
}

export interface CommandProcessPort {
	run(executable: string, args: readonly string[], options: CommandProcessOptions): Promise<DesktopCommandResult>;
}

export interface DesktopCommandPort extends CommandProcessPort {
	locate(): Promise<DesktopCommandLocation>;
}

export type { AsyncExecutionGate } from "../async-execution-gate-contracts.js";

export class DesktopCommandAbortedError extends Error {
	constructor() {
		super("Desktop command aborted");
		this.name = "DesktopCommandAbortedError";
	}
}
