// Copyright The Open Forge contributors.
import type { ComputerUseInput } from "@vetta/coding-agent/function-extensions";
import type { ComputerWindow } from "../../shared/computer-use.js";

export type ComputerBackendCommand =
	| { readonly op: "restore"; readonly target: ComputerWindow }
	| { readonly op: "execute"; readonly input: ComputerUseInput };
export interface ComputerBackendResult {
	readonly ok: boolean;
	readonly code?: string;
	readonly text?: string;
	readonly image?: { readonly data: string; readonly mimeType: "image/png" };
}
export interface ComputerBackend {
	invoke(command: ComputerBackendCommand, signal?: AbortSignal): Promise<ComputerBackendResult>;
	/** Resolves only after the operation has stopped and held inputs have been released. */
	interrupt(): Promise<void>;
	dispose(): Promise<void>;
}
export interface HiddenWindowLedger {
	load(): Promise<readonly ComputerWindow[]>;
	save(windows: readonly ComputerWindow[]): Promise<void>;
}
export interface ComputerDisplay {
	read(): { hidden: boolean; topmost: boolean };
	update(value: { hidden?: boolean; topmost?: boolean }): void;
	/** Temporarily removes Vetta from the physical input surface; restoring must not steal focus. */
	yield(): () => void;
}
