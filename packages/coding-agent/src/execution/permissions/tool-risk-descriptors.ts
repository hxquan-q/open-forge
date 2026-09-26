// Copyright The Open Forge contributors.
import type { ToolRiskDescriptor } from "@vetta/runtime-core/task";

/**
 * 产品默认风险矩阵（REQ-0001 / mvp-scope）。
 *
 * Registry 只描述能力；是否放行由 Policy（等级 × Trust grant）决定，
 * 执行授权永远走 Approval，能力可见性不替代授权（ISSUE-0005 方案 C）。
 */

const READ_ONLY: ToolRiskDescriptor = Object.freeze({
	defaultLevel: "L0",
	executionClass: "parallel-safe",
	irreversible: false,
	externalSideEffect: false,
	requiredScopes: [],
});

const LOCAL_WRITE: ToolRiskDescriptor = Object.freeze({
	defaultLevel: "L2",
	executionClass: "parallel-safe",
	irreversible: false,
	externalSideEffect: false,
	requiredScopes: ["fs:write"],
});

const SHELL: ToolRiskDescriptor = Object.freeze({
	defaultLevel: "L3",
	executionClass: "exclusive",
	irreversible: false,
	externalSideEffect: true,
	requiredScopes: ["shell"],
});

const EXTERNAL_TOOL: ToolRiskDescriptor = Object.freeze({
	defaultLevel: "L3",
	executionClass: "exclusive",
	irreversible: false,
	externalSideEffect: true,
	requiredScopes: [],
});

const LIGHTWEIGHT: ToolRiskDescriptor = Object.freeze({
	defaultLevel: "L1",
	executionClass: "parallel-safe",
	irreversible: false,
	externalSideEffect: false,
	requiredScopes: [],
});

/** 定时任务变更：写入宿主调度器持久状态、留下会自行执行的自动化，按外部副作用逐次审批。 */
const SCHEDULED_MUTATION: ToolRiskDescriptor = Object.freeze({
	defaultLevel: "L3",
	executionClass: "parallel-safe",
	irreversible: false,
	externalSideEffect: true,
	requiredScopes: [],
});

const SCHEDULED_DELETE: ToolRiskDescriptor = Object.freeze({
	...SCHEDULED_MUTATION,
	irreversible: true,
});

const BUILT_IN: Readonly<Record<string, ToolRiskDescriptor>> = Object.freeze({
	read: READ_ONLY,
	grep: READ_ONLY,
	glob: READ_ONLY,
	find: READ_ONLY,
	ls: READ_ONLY,
	dir_tree: READ_ONLY,
	current_time: READ_ONLY,
	progress: READ_ONLY,
	invoke_skill: LIGHTWEIGHT,
	kb_write_page: LOCAL_WRITE,
	kb_filter_by_tags: READ_ONLY,
	kb_list_available_tags: READ_ONLY,
	research_scope: READ_ONLY,
	dataset_profile: READ_ONLY,
	write: LOCAL_WRITE,
	edit: LOCAL_WRITE,
	bash: SHELL,
	shell: SHELL,
	doc_to_pdf: LOCAL_WRITE,
	html_to_pdf: LOCAL_WRITE,
	extract_text_from_pdf: READ_ONLY,
	extract_text_from_img: READ_ONLY,
	render_pdf_page: READ_ONLY,
	todo: LIGHTWEIGHT,
	artifact: LOCAL_WRITE,
	browser_tab: READ_ONLY,
	memory: LIGHTWEIGHT,
	im_send_attachment: LOCAL_WRITE,
	bg_task_output: READ_ONLY,
	bg_task_stop: LOCAL_WRITE,
	scheduled_task_list: READ_ONLY,
	scheduled_task_create: SCHEDULED_MUTATION,
	scheduled_task_update: SCHEDULED_MUTATION,
	scheduled_task_delete: SCHEDULED_DELETE,
});

/** MCP / 插件工具的默认档：外部进程、边界不可静态证明，按需逐次审批或 Trust 放行。 */
const MCP_TOOL: ToolRiskDescriptor = EXTERNAL_TOOL;

/** 未知工具返回 undefined，由 `evaluateToolRisk` fail closed 到 L4。 */
export function defaultToolRiskDescriptor(toolName: string): ToolRiskDescriptor | undefined {
	const builtIn = BUILT_IN[toolName];
	if (builtIn) return builtIn;
	if (toolName.startsWith("mcp_")) return MCP_TOOL;
	return undefined;
}
