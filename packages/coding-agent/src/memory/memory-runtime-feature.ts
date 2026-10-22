// Modified by The Open Forge contributors.
import type { AgentFeatureDefinition, RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import type { CodingAgentRuntimeToolRegistration } from "../runtime-contracts/index.js";

/**
 * 记忆工具 Feature（TASK-0374 扩展）：legacy rollover 工具（单注册）与
 * 显式记忆工具组（多注册）共用同一装配形状；同一会话按策略只装配其中
 * 一组（peripheral-assembly 侧由 memoryPolicy/memeryMode 判定，见
 * VERIFY-0020 与 ADR-0149），本模块不重复判定。
 */
export function createCodingAgentMemoryRuntimeFeature(
	registration: CodingAgentRuntimeToolRegistration,
): AgentFeatureDefinition;

export function createCodingAgentMemoryRuntimeFeature(
	registrations: readonly CodingAgentRuntimeToolRegistration[],
): AgentFeatureDefinition;

export function createCodingAgentMemoryRuntimeFeature(
	registration: CodingAgentRuntimeToolRegistration | readonly CodingAgentRuntimeToolRegistration[],
): AgentFeatureDefinition {
	const registrations = Array.isArray(registration) ? registration : [registration];
	const tools = registrations.map((entry) => entry.tool as RuntimeToolDefinition<never>);
	return {
		id: "coding-agent.memory",
		async prepare(context) {
			context.signal.throwIfAborted();
			return {
				async contribute(contributionContext) {
					contributionContext.signal.throwIfAborted();
					return { tools };
				},
				async dispose() {},
			};
		},
	};
}
