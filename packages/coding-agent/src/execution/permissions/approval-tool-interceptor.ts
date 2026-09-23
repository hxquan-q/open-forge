import type { ToolRiskLevel } from "@vetta/runtime-core/task";
import { defaultApprovalRequirement, evaluateToolRisk, type ToolRiskDescriptor } from "@vetta/runtime-core/task";
import type { CodingAgentToolInterceptor, ToolInterceptionContext } from "../../interception/tool/contracts.js";
import type { CodingAgentToolApprovalPort } from "./approval-contract.js";

/**
 * 执行面的权限闸门（TASK-0016）：
 *
 * - 宿主未接入审批端口时不设闸（与既有行为一致）；接入后 per-call 等级逐次审批；
 * - Trust grant 的命中判定在端口实现侧（宿主拥有 grant 存储）——端口可直接
 *   返回 approve 而不弹窗；L4 是否豁免同样由宿主按「永远逐次确认」执行；
 * - `edit` 决策用改写后的参数生成新审批请求重新校验，旧请求不视作批准；
 * - 审批端口抛错或被中断时 fail closed（拒绝执行）。
 */

export interface CodingAgentApprovalPolicyOptions {
	readonly approvalPort: CodingAgentToolApprovalPort | undefined;
	readonly resolveRiskDescriptor: (toolName: string) => ToolRiskDescriptor | undefined;
	/** 生成审批摘要与受影响资源；实现负责脱敏。 */
	readonly summarize: (
		toolName: string,
		input: Readonly<Record<string, unknown>>,
	) => { readonly summary: string; readonly affectedResources: readonly string[] };
}

const MAX_EDIT_ROUNDS = 3;

export function createApprovalToolInterceptor(options: CodingAgentApprovalPolicyOptions): CodingAgentToolInterceptor {
	const requireApproval = (level: ToolRiskLevel): boolean => defaultApprovalRequirement(level) === "per-call";

	return {
		async before(context: ToolInterceptionContext) {
			if (!options.approvalPort?.isAvailable()) return undefined;
			const { tool, request } = context;
			let input = context.input;
			const evaluation = evaluateToolRisk({
				toolName: tool.name,
				descriptor: options.resolveRiskDescriptor(tool.name),
			});
			if (!requireApproval(evaluation.level)) return undefined;

			for (let round = 0; round < MAX_EDIT_ROUNDS; round += 1) {
				const { summary, affectedResources } = options.summarize(tool.name, input);
				const decision = await options.approvalPort.request(
					{
						approvalId: `approval-${request.sessionId}-${request.toolCallId}-${round}`,
						sessionId: request.sessionId,
						turnId: request.turnId,
						toolName: tool.name,
						level: evaluation.level,
						risk: evaluation.descriptor,
						summary,
						inputPreview: input,
						affectedResources,
					},
					request.signal,
				);
				if (decision.decision === "approve" || decision.decision === "approve_once") {
					return {};
				}
				if (decision.decision === "edit" && decision.input) {
					// 用户改写了参数：生成新审批请求重新校验，不得沿用旧批准。
					input = decision.input;
					continue;
				}
				return { block: { reason: `tool "${tool.name}" denied by user approval` } };
			}
			return { block: { reason: `tool "${tool.name}" approval exceeded edit rounds` } };
		},
	};
}
