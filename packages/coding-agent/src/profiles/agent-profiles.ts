// Copyright The Open Forge contributors.
import type { AgentConfigurationSelection } from "../agent-configuration/configuration-schema.js";

/**
 * Agent 能力 Profile（ADR-0128 / ISSUE-0005 方案 C）。
 *
 * 三轴分层：`WorkspaceMode` 只决定项目界面布局（Desktop）；`agentMode` 保持
 * ADR-0071 的提示词偏向；本文件定义的 `agentProfileId` 在创建新 Session 时固化
 * 该会话的能力**默认值**（工具默认开关与 Memory 默认），不构成硬边界：
 * Profile 只决定「开箱默认」，用户配置与项目策略仍可显式调整；执行授权一律
 * 走 Tool Policy 与 Approval（TASK-0016），Prompt 与 Profile 都不是权限边界。
 */

export type CodingAgentBuiltInProfileId = "work" | "coding";

export interface CodingAgentAgentProfile {
	readonly id: CodingAgentBuiltInProfileId;
	/** `null` = 不设默认工具子集（与既有行为一致）。 */
	readonly defaultToolNames: readonly string[] | null;
	readonly memoryEnabled: boolean;
}

/** work：默认不带 Shell 写类工具（bash/shell）；文档/知识/批处理类仍可用。 */
const WORK_PROFILE: CodingAgentAgentProfile = Object.freeze({
	id: "work",
	defaultToolNames: [
		"read",
		"grep",
		"glob",
		"find",
		"ls",
		"dir_tree",
		"current_time",
		"progress",
		"todo",
		"memory",
		"invoke_skill",
		"write",
		"edit",
		"doc_to_pdf",
		"html_to_pdf",
		"extract_text_from_pdf",
		"extract_text_from_img",
		"render_pdf_page",
		"kb_write_page",
		"kb_filter_by_tags",
		"kb_list_available_tags",
		"research_scope",
		"dataset_profile",
		"im_send_attachment",
		"artifact",
		"browser_tab",
		"scheduled_task_list",
		"scheduled_task_create",
		"scheduled_task_update",
		"scheduled_task_delete",
	],
	memoryEnabled: true,
});

/** coding：保持现状默认（全量工具 + Memory 开启）。 */
const CODING_PROFILE: CodingAgentAgentProfile = Object.freeze({
	id: "coding",
	defaultToolNames: null,
	memoryEnabled: true,
});

export const CODING_AGENT_PROFILES: Readonly<Record<CodingAgentBuiltInProfileId, CodingAgentAgentProfile>> =
	Object.freeze({ work: WORK_PROFILE, coding: CODING_PROFILE });

/** 未知/缺省 id 一律回落 coding（不做能力收紧，避免静默改变既有会话）。 */
export function resolveAgentProfile(id: string | undefined): CodingAgentAgentProfile {
	if (id === "work") return WORK_PROFILE;
	return CODING_PROFILE;
}

/**
 * 把 Profile 默认折算成 `AgentConfigurationSelection` 基线：仅当宿主/用户没有
 * 显式选择工具时才应用默认子集，显式选择永远优先。
 */
export function applyAgentProfileDefaults(
	profile: CodingAgentAgentProfile,
	selection: AgentConfigurationSelection | undefined,
): AgentConfigurationSelection {
	if (profile.defaultToolNames === null) return selection ?? { template: null, overrides: {} };
	// 显式选择优先：用户/宿主已选工具集合时不覆盖（[] 表示刻意禁用同样尊重）。
	if (selection?.overrides.tools !== undefined && selection?.overrides.tools !== null) return selection;
	if (selection?.template?.configuration.tools) return selection;
	return {
		template: selection?.template ?? null,
		overrides: { ...(selection?.overrides ?? {}), tools: [...profile.defaultToolNames] },
	};
}

/**
 * {@link applyAgentProfileDefaults} 这次是否真的把 Profile 默认工具折算进了显式选择。
 * 宿主据此把同一份清单作为 `profileDefaultToolNames` 证据随会话下发（BUG-0014）：
 * 准入校验对其中宿主未注册的名字按软默认降级，而显式选择不受影响。
 */
export function appliesAgentProfileDefaultTools(
	profile: CodingAgentAgentProfile,
	selection: AgentConfigurationSelection | undefined,
): boolean {
	if (profile.defaultToolNames === null) return false;
	if (selection?.overrides.tools !== undefined && selection?.overrides.tools !== null) return false;
	if (selection?.template?.configuration.tools) return false;
	return true;
}
