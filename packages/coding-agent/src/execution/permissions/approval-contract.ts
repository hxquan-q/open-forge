// Copyright The Open Forge contributors.
import { defineSessionExtensionFunction } from "@vetta/runtime-core/session-extensions";
import type { ToolRiskDescriptor, ToolRiskLevel } from "@vetta/runtime-core/task";

/**
 * 高风险工具的逐次审批合同（TASK-0016）。
 *
 * 模型请求面与执行面共用同一风险判定；执行面命中 per-call 等级时经本端口
 * 请求用户裁决。审批的持久化事实（requested/decision）由实现本函数的宿主
 * 写入会话事件日志，coding-agent 只拥有闸门语义。
 */

export const CODING_AGENT_TOOL_APPROVAL_EXTENSION_ID = "coding-agent.tool-approval";

/** 展示给用户前已脱敏/规范化的审批请求载荷。 */
export interface CodingAgentToolApprovalFunctionRequest {
	readonly approvalId: string;
	readonly sessionId: string;
	readonly turnId: string;
	readonly toolName: string;
	readonly level: ToolRiskLevel;
	readonly risk: ToolRiskDescriptor;
	readonly summary: string;
	readonly inputPreview: unknown;
	readonly affectedResources: readonly string[];
}

/** `edit` 表示用户改写了参数：宿主返回改写后的 input，闸门将生成新审批请求重新校验。 */
export interface CodingAgentToolApprovalDecision {
	readonly decision: "approve" | "approve_once" | "deny" | "edit";
	readonly input?: Readonly<Record<string, unknown>>;
}

export const CODING_AGENT_TOOL_APPROVAL_FUNCTION = defineSessionExtensionFunction<
	CodingAgentToolApprovalFunctionRequest,
	CodingAgentToolApprovalDecision
>(CODING_AGENT_TOOL_APPROVAL_EXTENSION_ID, "request");

export interface CodingAgentToolApprovalPort {
	isAvailable(): boolean;
	request(
		input: CodingAgentToolApprovalFunctionRequest,
		signal: AbortSignal,
	): Promise<CodingAgentToolApprovalDecision>;
}
