// Copyright The Open Forge contributors.
import type { WorkspaceMode } from "@shared/store/atoms";

export type SessionAxis = "work" | "coding";

export interface DerivedSessionAxes {
	readonly agentMode: SessionAxis;
	readonly capabilityProfile: SessionAxis;
}

/** 页头工作区选择在创建会话时同时派生解释模式与工具集，不把三轴拆开给用户。 */
export function deriveSessionAxesFromWorkspaceMode(mode: WorkspaceMode): DerivedSessionAxes {
	return mode === "work"
		? { agentMode: "work", capabilityProfile: "work" }
		: { agentMode: "coding", capabilityProfile: "coding" };
}

/**
 * 徽章轴的唯一派生点（TASK-0080）：解释模式只读 agentMode，工具面只读 capabilityProfile，
 * 两轴互不借用对方取值——此前连接层两处内联三元互相 OR，两标签永不相异，恰好掩蔽双轴分歧。
 * 未知值的折叠口径与 main 侧（resolve-session-config.ts / agent-modes 注册表）逐一对齐：
 * - agentMode 在落盘层是裸 string，main 的 normalizeDesktopAgentMode 与
 *   LEGACY_SESSION_AGENT_MODE 都把未知值折叠为 "work"，这里同为「非 coding 即 work」；
 * - capabilityProfile 未知（ADR-0128 之前的旧会话未落盘该字段）时，main 的
 *   resolveDesktopSessionConfig 对 profile 折叠为「非 work 即 coding」，这里同口径，
 *   保证徽标与 main 实际生效的工具面一致（手编第三值 agentMode 的旧会话也按 coding 报）。
 */
export function resolveSessionAxes(
	agentMode: string | undefined,
	capabilityProfile: string | undefined,
): DerivedSessionAxes {
	return {
		agentMode: agentMode === "coding" ? "coding" : "work",
		capabilityProfile: capabilityProfile === "work" ? "work" : "coding",
	};
}

/**
 * 徽标文案开关：模板由 i18next 插值完成（`t(key, values)` 是唯一插值层），这里不再
 * 手动 replace——否则既留双通道，`String.replace` 单次替换还会让重复占位符漏出花括号。
 */
export function formatSessionAxesBadge(input: {
	readonly agentMode?: string;
	readonly capabilityProfile?: string;
	readonly template: string;
}): string | null {
	if (!input.agentMode && !input.capabilityProfile) return null;
	return input.template;
}
