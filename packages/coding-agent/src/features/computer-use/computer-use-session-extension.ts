// Copyright The Open Forge contributors.
import type { AgentFeatureDefinition } from "@vetta/runtime-core/kernel";
import {
	optionalSessionExtensionFunction,
	type SessionExtensionDefinition,
} from "@vetta/runtime-core/session-extensions";
import {
	COMPUTER_USE_DESCRIPTION,
	COMPUTER_USE_FUNCTION,
	ComputerUseInputSchema,
	readComputerUseInput,
} from "./computer-use-contract.js";

export function createComputerUseSessionExtension(): SessionExtensionDefinition {
	return {
		id: "coding-agent.computer-use",
		functionDependencies: [optionalSessionExtensionFunction(COMPUTER_USE_FUNCTION)],
		create(context) {
			if (!context.functions.has(COMPUTER_USE_FUNCTION)) return { contributions: [], dispose() {} };
			const feature: AgentFeatureDefinition = {
				id: "coding-agent.computer-use",
				async prepare(prepareContext) {
					prepareContext.signal.throwIfAborted();
					return {
						async contribute() {
							return {
								tools: [
									{
										name: "computer_use",
										label: "computer use",
										description: COMPUTER_USE_DESCRIPTION,
										inputSchema: ComputerUseInputSchema,
										validateInput: readComputerUseInput,
										async execute({ input, sessionId, signal }) {
											return context.functions.invoke(
												COMPUTER_USE_FUNCTION,
												{ sessionId, input: readComputerUseInput(input) },
												signal,
											);
										},
									},
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
