// Copyright The Open Forge contributors.
import type { AgentFeatureDefinition } from "@vetta/runtime-core/kernel";
import {
	optionalSessionExtensionFunction,
	type SessionExtensionDefinition,
} from "@vetta/runtime-core/session-extensions";
import {
	CODING_AGENT_ATTACH_ARTIFACT_EXTENSION_ID,
	CODING_AGENT_ATTACH_ARTIFACT_FUNCTION,
	createAttachArtifactTool,
} from "./attach-artifact-tool.js";

/** Artifact 登记扩展：宿主注册 attach 函数（TASK-0015 任务面）时才贡献工具。 */
export function createCodingAgentAttachArtifactSessionExtension(): SessionExtensionDefinition {
	return {
		id: CODING_AGENT_ATTACH_ARTIFACT_EXTENSION_ID,
		functionDependencies: [optionalSessionExtensionFunction(CODING_AGENT_ATTACH_ARTIFACT_FUNCTION)],
		create(context) {
			// 未注册宿主函数（CLI 等宿主）不贡献工具，不产生不可用入口。
			if (!context.functions.has(CODING_AGENT_ATTACH_ARTIFACT_FUNCTION)) {
				return { contributions: [], dispose() {} };
			}
			const feature: AgentFeatureDefinition = {
				id: "coding-agent.attach-artifact",
				async prepare(prepareContext) {
					prepareContext.signal.throwIfAborted();
					return {
						async contribute(contributionContext) {
							contributionContext.signal.throwIfAborted();
							return {
								tools: [
									createAttachArtifactTool({
										invoke: async (request, signal) => {
											if (!context.functions.has(CODING_AGENT_ATTACH_ARTIFACT_FUNCTION)) return undefined;
											try {
												return await context.functions.invoke(
													CODING_AGENT_ATTACH_ARTIFACT_FUNCTION,
													request,
													signal,
												);
											} catch (error) {
												if (signal.aborted) return { attached: false, reason: "cancelled" };
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
