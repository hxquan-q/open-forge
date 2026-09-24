// Copyright The Open Forge contributors.
import type { AgentFeatureDefinition } from "@vetta/runtime-core/kernel";
import {
	optionalSessionExtensionFunction,
	type SessionExtensionDefinition,
} from "@vetta/runtime-core/session-extensions";
import { CODING_AGENT_MODEL_TOOL_ORDER } from "../../tool-policy/model-tool-order.js";
import { createArtifactTool } from "./artifact-tool.js";
import { CODING_AGENT_ARTIFACT_EXTENSION_ID, CODING_AGENT_ARTIFACT_FUNCTION } from "./artifact-tool-contract.js";

/** 能力驱动：仅当宿主注册 artifact invoke 函数时贡献工具。 */
export function createCodingAgentArtifactSessionExtension(): SessionExtensionDefinition {
	return {
		id: CODING_AGENT_ARTIFACT_EXTENSION_ID,
		functionDependencies: [optionalSessionExtensionFunction(CODING_AGENT_ARTIFACT_FUNCTION)],
		create(context) {
			if (!context.functions.has(CODING_AGENT_ARTIFACT_FUNCTION)) {
				return { contributions: [], dispose() {} };
			}
			const feature: AgentFeatureDefinition = {
				id: CODING_AGENT_ARTIFACT_EXTENSION_ID,
				async prepare(prepareContext) {
					prepareContext.signal.throwIfAborted();
					return {
						async contribute(contributionContext) {
							contributionContext.signal.throwIfAborted();
							return {
								tools: [
									createArtifactTool({
										modelOrder: CODING_AGENT_MODEL_TOOL_ORDER.artifact,
										invoke: async (request, signal) => {
											if (!context.functions.has(CODING_AGENT_ARTIFACT_FUNCTION)) return undefined;
											try {
												return await context.functions.invoke(
													CODING_AGENT_ARTIFACT_FUNCTION,
													request,
													signal,
												);
											} catch (error) {
												if (signal.aborted) {
													return {
														ok: false,
														code: "cancelled",
														message: "cancelled",
														action: request.input.action,
													};
												}
												throw error;
											}
										},
									}),
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
