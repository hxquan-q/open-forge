// Copyright The Open Forge contributors.
/**
 * 定时任务无人值守授权分档（ADR-0132 / TASK-0116）。
 *
 * 分档只细化「自动化会话上哪些能力可在既有审批管线内静默放行」，
 * 不改变 executionMode 三态，也不绕过 L4 / 计费一票否决。
 */
import type { ToolRiskLevel } from "@vetta/runtime-core/task";

export const UNATTENDED_PERMISSION_TIER_KEYS = [
	"allowWorkspaceWrite",
	"allowCommonCommands",
	"allowBatchDelete",
	"allowSystemTools",
	"autoApprovePrompts",
] as const;

export type UnattendedPermissionTierKey = (typeof UNATTENDED_PERMISSION_TIER_KEYS)[number];

/** 任务级可选分档；缺省或全 false 时审批行为与改前一致。 */
export type UnattendedPermissionTiers = {
	readonly [K in UnattendedPermissionTierKey]?: boolean;
};

export type UnattendedCapabilityKind =
	| "workspaceWrite"
	| "commonCommands"
	| "batchDelete"
	| "systemTools"
	| "genericPrompt";

export type UnattendedAutoApproveResult =
	| { readonly outcome: "autoApprove"; readonly capability: UnattendedCapabilityKind }
	| {
			readonly outcome: "requireHuman";
			readonly reason: "l4" | "billing" | "tierDenied" | "defaults";
			readonly capability?: UnattendedCapabilityKind;
	  };

/** 全部关闭的规范空对象——与省略字段语义相同。 */
export const EMPTY_UNATTENDED_PERMISSION_TIERS: UnattendedPermissionTiers = Object.freeze({});

const WORKSPACE_WRITE_TOOLS = new Set([
	"write",
	"edit",
	"artifact",
	"kb_write_page",
	"doc_to_pdf",
	"html_to_pdf",
	"im_send_attachment",
]);

const BATCH_DELETE_TOOLS = new Set(["scheduled_task_delete"]);

/** 计费 / 配额语境：任意分档下都强制人工确认。 */
const BILLING_QUOTA_PATTERN =
	/\b(quota|billing|credit|credits|payment|paid|subscription|insufficient[_\s-]?quota|purchase|invoice)\b|积分|付费|配额|订阅|计费|余额不足/i;

/** 批量删除命令特征（未升到 L4 的仍归本档；L4 由上层硬闸）。 */
const BATCH_DELETE_COMMAND_PATTERN =
	/\b(rm\s+(-[a-zA-Z]*r[a-zA-Z]*|[a-zA-Z-]*--recursive)|del\s+\/s|rd\s+\/s|rmdir\s+\/s|Remove-Item\b[^\n]*-(Recurse|Force)|find\b[^\n]*-delete)\b/i;

/** 常见只读/低风险命令（允许在「常用命令」档静默）。 */
const COMMON_COMMAND_PATTERN =
	/^\s*(git\s+(status|diff|log|show|branch|rev-parse|remote|fetch|pull|stash\s+list)(\s|$)|ls(\s|$)|dir(\s|$)|pwd(\s|$)|echo(\s|$)|cat(\s|$)|type(\s|$)|head(\s|$)|tail(\s|$)|which(\s|$)|where(\s|$)|(npm|bun|pnpm|yarn)\s+(test|run|lint|check|typecheck|tsc)(\s|$)|rg(\s|$)|grep(\s|$)|find(\s|$)|glob(\s|$))/i;

/** 系统级 / 包管理安装 / 服务控制。 */
const SYSTEM_TOOL_COMMAND_PATTERN =
	/\b(npm\s+i(nstall)?|bun\s+add|pnpm\s+add|yarn\s+add|pip\s+install|brew\s+|apt(-get)?\s+|dnf\s+|yum\s+|choco\s+|winget\s+|docker\s+|systemctl\s+|service\s+|powershell\s+-|sudo\s+|schtasks\s+|reg\s+(add|delete))\b/i;

const CAPABILITY_TO_TIER: Readonly<Record<UnattendedCapabilityKind, UnattendedPermissionTierKey>> = {
	workspaceWrite: "allowWorkspaceWrite",
	commonCommands: "allowCommonCommands",
	batchDelete: "allowBatchDelete",
	systemTools: "allowSystemTools",
	genericPrompt: "autoApprovePrompts",
};

export function enableAllUnattendedPermissionTiers(): UnattendedPermissionTiers {
	return Object.freeze({
		allowWorkspaceWrite: true,
		allowCommonCommands: true,
		allowBatchDelete: true,
		allowSystemTools: true,
		autoApprovePrompts: true,
	});
}

export function isUnattendedPermissionTierEnabled(
	tiers: UnattendedPermissionTiers | undefined,
	key: UnattendedPermissionTierKey,
): boolean {
	return tiers?.[key] === true;
}

/** 任一档为 true 才视为「配置了无人值守放行」；否则走默认审批路径。 */
export function hasAnyUnattendedPermissionGrant(tiers: UnattendedPermissionTiers | undefined): boolean {
	if (!tiers) return false;
	return UNATTENDED_PERMISSION_TIER_KEYS.some((key) => tiers[key] === true);
}

export function normalizeUnattendedPermissionTiers(value: unknown): UnattendedPermissionTiers | undefined {
	if (value == null) return undefined;
	if (typeof value !== "object" || Array.isArray(value)) return undefined;
	const record = value as Record<string, unknown>;
	const next: { -readonly [K in UnattendedPermissionTierKey]?: boolean } = {};
	let saw = false;
	for (const key of UNATTENDED_PERMISSION_TIER_KEYS) {
		const raw = record[key];
		if (raw === undefined) continue;
		if (typeof raw !== "boolean") return undefined;
		if (raw) {
			next[key] = true;
			saw = true;
		} else {
			next[key] = false;
			saw = true;
		}
	}
	if (!saw) return undefined;
	// 拒绝未知键，避免脏数据悄悄进持久化。
	for (const key of Object.keys(record)) {
		if (!(UNATTENDED_PERMISSION_TIER_KEYS as readonly string[]).includes(key)) return undefined;
	}
	return next;
}

export function isBillingQuotaContext(input: {
	readonly toolName: string;
	readonly summary: string;
	readonly inputPreview: unknown;
}): boolean {
	const blobs = [input.toolName, input.summary, stringifyPreview(input.inputPreview)];
	return blobs.some((text) => BILLING_QUOTA_PATTERN.test(text));
}

export function classifyUnattendedCapability(input: {
	readonly toolName: string;
	readonly summary: string;
	readonly inputPreview: unknown;
}): UnattendedCapabilityKind {
	const toolName = input.toolName;
	const command = readCommand(input.inputPreview);

	if (BATCH_DELETE_TOOLS.has(toolName) || (command.length > 0 && BATCH_DELETE_COMMAND_PATTERN.test(command))) {
		return "batchDelete";
	}
	if (WORKSPACE_WRITE_TOOLS.has(toolName)) {
		return "workspaceWrite";
	}
	if (toolName.startsWith("mcp_") || (command.length > 0 && SYSTEM_TOOL_COMMAND_PATTERN.test(command))) {
		return "systemTools";
	}
	if ((toolName === "bash" || toolName === "shell") && command.length > 0 && COMMON_COMMAND_PATTERN.test(command)) {
		return "commonCommands";
	}
	if (toolName === "bash" || toolName === "shell") {
		// 未识别的 shell：偏系统面，避免被「常用命令」误放。
		return "systemTools";
	}
	return "genericPrompt";
}

/**
 * 判定自动化会话是否可对该审批请求静默放行。
 * - L4 与计费语境：永远 requireHuman；
 * - 未配置任何授权档：requireHuman(defaults)，由 broker 走既有 Trust/UI；
 * - 已授权对应档且非上述否决：autoApprove。
 */
export function evaluateUnattendedToolAutoApprove(input: {
	readonly tiers: UnattendedPermissionTiers | undefined;
	readonly toolName: string;
	readonly level: ToolRiskLevel;
	readonly summary: string;
	readonly inputPreview: unknown;
}): UnattendedAutoApproveResult {
	if (input.level === "L4") {
		return { outcome: "requireHuman", reason: "l4" };
	}
	if (
		isBillingQuotaContext({
			toolName: input.toolName,
			summary: input.summary,
			inputPreview: input.inputPreview,
		})
	) {
		return { outcome: "requireHuman", reason: "billing" };
	}
	if (!hasAnyUnattendedPermissionGrant(input.tiers)) {
		return { outcome: "requireHuman", reason: "defaults" };
	}

	const capability = classifyUnattendedCapability({
		toolName: input.toolName,
		summary: input.summary,
		inputPreview: input.inputPreview,
	});
	const tierKey = CAPABILITY_TO_TIER[capability];
	if (isUnattendedPermissionTierEnabled(input.tiers, tierKey)) {
		return { outcome: "autoApprove", capability };
	}
	return { outcome: "requireHuman", reason: "tierDenied", capability };
}

function readCommand(inputPreview: unknown): string {
	if (inputPreview == null || typeof inputPreview !== "object" || Array.isArray(inputPreview)) return "";
	const command = (inputPreview as Record<string, unknown>).command;
	return typeof command === "string" ? command : "";
}

function stringifyPreview(inputPreview: unknown): string {
	if (typeof inputPreview === "string") return inputPreview;
	if (inputPreview == null) return "";
	try {
		return JSON.stringify(inputPreview);
	} catch {
		return String(inputPreview);
	}
}
