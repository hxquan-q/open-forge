import {
	defineSessionExtensionService,
	optionalSessionExtensionFunction,
	type SessionExtensionDefinition,
} from "@vetta/runtime-core/session-extensions";
import {
	CODING_AGENT_TOOL_APPROVAL_EXTENSION_ID,
	CODING_AGENT_TOOL_APPROVAL_FUNCTION,
	type CodingAgentToolApprovalPort,
} from "./approval-contract.js";

export const CODING_AGENT_TOOL_APPROVAL_RUNTIME = defineSessionExtensionService<CodingAgentToolApprovalPort>(
	CODING_AGENT_TOOL_APPROVAL_EXTENSION_ID,
	"runtime",
);

export function createCodingAgentToolApprovalSessionExtension(): SessionExtensionDefinition {
	return {
		id: CODING_AGENT_TOOL_APPROVAL_EXTENSION_ID,
		functionDependencies: [optionalSessionExtensionFunction(CODING_AGENT_TOOL_APPROVAL_FUNCTION)],
		create(context) {
			const runtime: CodingAgentToolApprovalPort = {
				isAvailable: () => context.functions.has(CODING_AGENT_TOOL_APPROVAL_FUNCTION),
				request: async (input, signal) => {
					if (!context.functions.has(CODING_AGENT_TOOL_APPROVAL_FUNCTION)) {
						return { decision: "deny" as const };
					}
					// 中断（停止/取消）视作未批准：fail closed，不把超时当拒绝之外的任何事。
					return await context.functions.invoke(CODING_AGENT_TOOL_APPROVAL_FUNCTION, input, signal);
				},
			};
			return {
				contributions: [{ kind: "service", token: CODING_AGENT_TOOL_APPROVAL_RUNTIME, value: runtime }],
				dispose() {},
			};
		},
	};
}
