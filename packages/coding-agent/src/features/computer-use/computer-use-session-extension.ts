// Copyright The Open Forge contributors.
import { type TSchema, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { AgentFeatureDefinition, RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import {
	optionalSessionExtensionFunction,
	type SessionExtensionDefinition,
} from "@vetta/runtime-core/session-extensions";
import { COMPUTER_USE_FUNCTION, type ComputerUseInput, readComputerUseInput } from "./computer-use-contract.js";

export function createComputerUseSessionExtension(): SessionExtensionDefinition {
	return {
		id: "coding-agent.computer-use",
		functionDependencies: [optionalSessionExtensionFunction(COMPUTER_USE_FUNCTION)],
		create(context) {
			if (!context.functions.has(COMPUTER_USE_FUNCTION)) return { contributions: [], dispose() {} };
			const actionTool = (
				name: string,
				action: ComputerUseInput["action"],
				description: string,
				inputSchema: TSchema,
			): RuntimeToolDefinition => ({
				name,
				label: name,
				description,
				inputSchema,
				validateInput(input) {
					if (
						!Value.Check(inputSchema, input) ||
						typeof input !== "object" ||
						input === null ||
						Array.isArray(input)
					)
						throw new Error("Invalid computer_use input");
					return readComputerUseInput({ ...input, action });
				},
				async execute({ input, sessionId, signal }) {
					return context.functions.invoke(
						COMPUTER_USE_FUNCTION,
						{ sessionId, input: readComputerUseInput(input) },
						signal,
					);
				},
			});

			const feature: AgentFeatureDefinition = {
				id: "coding-agent.computer-use",
				async prepare(prepareContext) {
					prepareContext.signal.throwIfAborted();
					return {
						async contribute() {
							return {
								tools: [
									actionTool(
										"computer_observe",
										"observe",
										"Capture the full Windows desktop and return a screenshot.",
										Type.Object({}, { additionalProperties: false }),
									),
									actionTool(
										"computer_click",
										"click",
										"Click a screenshot coordinate on the full desktop. Use coordinates from the latest computer_observe result.",
										Type.Object(
											{ revision: Type.String({ minLength: 1 }), x: Type.Integer(), y: Type.Integer() },
											{ additionalProperties: false },
										),
									),
									actionTool(
										"computer_press",
										"press",
										"Press a key or chord on the full desktop. Use this to navigate the desktop or open applications, for example Win+R.",
										Type.Object({ keys: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
									),
									actionTool(
										"computer_type",
										"type",
										"Type literal text into the currently focused desktop control.",
										Type.Object({ text: Type.String() }, { additionalProperties: false }),
									),
									actionTool(
										"computer_scroll",
										"scroll",
										"Scroll the full desktop at the supplied screen coordinates.",
										Type.Object(
											{
												revision: Type.String({ minLength: 1 }),
												x: Type.Integer(),
												y: Type.Integer(),
												amount: Type.Integer(),
											},
											{ additionalProperties: false },
										),
									),
								],
							};
						},
						async dispose() {},
					};
				},
			};
			return { contributions: [{ kind: "agent-feature", feature }], dispose() {} };
		},
	};
}
