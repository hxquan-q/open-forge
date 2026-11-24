// Copyright The Open Forge contributors.
import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { RuntimeToolResult } from "@vetta/runtime-core/kernel";
import { defineSessionExtensionFunction } from "@vetta/runtime-core/session-extensions";

const ref = () => Type.String({ minLength: 1 });
const object = { additionalProperties: false } as const;
export const ComputerUseInputSchema = Type.Union([
	Type.Object({ action: Type.Literal("observe") }, object),
	Type.Object({ action: Type.Literal("click"), revision: ref(), x: Type.Integer(), y: Type.Integer() }, object),
	Type.Object({ action: Type.Literal("press"), keys: Type.String({ minLength: 1 }) }, object),
	Type.Object({ action: Type.Literal("type"), text: Type.String() }, object),
	Type.Object(
		{ action: Type.Literal("scroll"), revision: ref(), x: Type.Integer(), y: Type.Integer(), amount: Type.Integer() },
		object,
	),
]);
export type ComputerUseInput = Static<typeof ComputerUseInputSchema>;
export function readComputerUseInput(input: unknown): ComputerUseInput {
	if (!Value.Check(ComputerUseInputSchema, input)) throw new Error("Invalid computer_use input");
	return input;
}
export interface ComputerUseRequest {
	readonly sessionId: string;
	readonly input: ComputerUseInput;
}
export const COMPUTER_USE_FUNCTION = defineSessionExtensionFunction<ComputerUseRequest, RuntimeToolResult>(
	"coding-agent.computer-use",
	"invoke",
);
export const COMPUTER_USE_DESCRIPTION =
	"Operate the full Windows desktop. Observe the desktop first, then use global coordinates and keyboard input to open and operate any application; observe again after changing the screen.";
