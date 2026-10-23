// Modified by The Open Forge contributors.
import type { AgentFeatureDefinition, ContextProvider, RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import type { CodingAgentRuntimeToolRegistration } from "../../runtime-contracts/index.js";

/**
 * 持久记忆 Feature（TASK-0375）：显式工具组 + 证据上下文注入的统一装配。
 * 工具面由 0374 提供，证据块由 memory-evidence-context 提供；本模块只做
 * 组合——Turn 内快照固定、遗忘在下一 prepare 前被存储层过滤。
 */
export function createPersistentMemoryFeature(options: {
	readonly registrations: readonly CodingAgentRuntimeToolRegistration[];
	readonly contextProvider: ContextProvider;
}): AgentFeatureDefinition {
	const tools = options.registrations.map((registration) => registration.tool as RuntimeToolDefinition<never>);
	return {
		id: "coding-agent.persistent-memory",
		async prepare(context) {
			context.signal.throwIfAborted();
			return {
				async contribute(contributionContext) {
					contributionContext.signal.throwIfAborted();
					return { tools, contextProviders: [options.contextProvider] };
				},
				async dispose() {},
			};
		},
	};
}
