// Copyright The Open Forge contributors.
import { type Static, Type } from "@sinclair/typebox";

const strict = { additionalProperties: false } as const;
export const ComputerWindowSchema = Type.Object(
	{
		id: Type.String({ minLength: 1, maxLength: 128 }),
		hwnd: Type.String({ pattern: "^[0-9]+$" }),
		pid: Type.Integer({ minimum: 1 }),
		started: Type.String({ minLength: 1, maxLength: 40 }),
		instance: Type.String({ pattern: "^[1-9][0-9]{0,19}$" }),
		className: Type.String({ maxLength: 256 }),
		exe: Type.String({ maxLength: 4096 }),
		title: Type.String({ maxLength: 4096 }),
		hidden: Type.Boolean(),
		showCommand: Type.Integer({ minimum: 0, maximum: 11 }),
	},
	strict,
);
export type ComputerWindow = Static<typeof ComputerWindowSchema>;
export const ComputerControlSchema = Type.Union([
	Type.Object({ action: Type.Literal("enable"), enabled: Type.Boolean() }, strict),
	Type.Object(
		{
			action: Type.Literal("grant"),
			sessionId: Type.String({ minLength: 1, maxLength: 512 }),
		},
		strict,
	),
	Type.Object(
		{
			action: Type.Union([
				Type.Literal("pause"),
				Type.Literal("resume"),
				Type.Literal("stop"),
				Type.Literal("restore-all"),
			]),
		},
		strict,
	),
	Type.Object({ action: Type.Literal("restore"), targetId: Type.String({ minLength: 1, maxLength: 128 }) }, strict),
	Type.Object(
		{
			action: Type.Literal("display"),
			hidden: Type.Optional(Type.Boolean()),
			topmost: Type.Optional(Type.Boolean()),
		},
		strict,
	),
]);
export type ComputerControl = Static<typeof ComputerControlSchema>;
export type ComputerPhase = "disabled" | "idle" | "ready" | "running" | "stopping" | "paused" | "error";
export interface ComputerUseState {
	readonly revision: number;
	readonly shortcutsAvailable?: boolean;
	readonly supported: boolean;
	readonly enabled: boolean;
	readonly phase: ComputerPhase;
	readonly sessionId?: string;
	readonly sessionName?: string;
	readonly hiddenWindows: readonly ComputerWindow[];
	readonly vettaHidden: boolean;
	readonly topmost: boolean;
	readonly issue?: string;
}
export interface ComputerUseApi {
	state(): Promise<ComputerUseState>;
	control(command: ComputerControl): Promise<ComputerUseState>;
	onChanged(handler: (state: ComputerUseState) => void): () => void;
}
export const COMPUTER_USE_CHANNELS = {
	state: "vetta:computer-use:state",
	control: "vetta:computer-use:control",
	changed: "vetta:computer-use:changed",
} as const;
