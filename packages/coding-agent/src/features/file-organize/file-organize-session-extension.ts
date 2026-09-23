import type { AgentFeatureDefinition } from "@vetta/runtime-core/kernel";
import {
	optionalSessionExtensionFunction,
	type SessionExtensionDefinition,
} from "@vetta/runtime-core/session-extensions";
import { CODING_AGENT_FILE_ORGANIZE_FUNCTION, createFileOrganizeTool } from "./organize-files-tool.js";

/**
 * 文件整理会话扩展：宿主注册了 organize 函数（预览+执行端口）时贡献工具。
 * 未注册的宿主（CLI 等）不出现该工具，不产生不可用入口。
 */
export function createCodingAgentFileOrganizeSessionExtension(): SessionExtensionDefinition {
	return {
		id: "coding-agent.file-organize",
		functionDependencies: [optionalSessionExtensionFunction(CODING_AGENT_FILE_ORGANIZE_FUNCTION)],
		create(context) {
			// 未注册宿主函数（CLI 等宿主）不贡献工具，不产生不可用入口。
			if (!context.functions.has(CODING_AGENT_FILE_ORGANIZE_FUNCTION)) {
				return { contributions: [], dispose() {} };
			}
			const invoke: Parameters<typeof createFileOrganizeTool>[0]["invoke"] = async (request, signal) => {
				if (!context.functions.has(CODING_AGENT_FILE_ORGANIZE_FUNCTION)) return undefined;
				try {
					return await context.functions.invoke(CODING_AGENT_FILE_ORGANIZE_FUNCTION, request, signal);
				} catch (error) {
					if (signal.aborted) return { confirmed: false, items: [] };
					throw error;
				}
			};
			const feature: AgentFeatureDefinition = {
				id: "coding-agent.file-organize",
				async prepare(prepareContext) {
					prepareContext.signal.throwIfAborted();
					return {
						async contribute(contributionContext) {
							contributionContext.signal.throwIfAborted();
							return { tools: [createFileOrganizeTool({ invoke })] };
						},
						async dispose() {},
					};
				},
			};
			return {
				contributions: [{ kind: "agent-feature", feature }],
				dispose() {},
			};
		},
	};
}
