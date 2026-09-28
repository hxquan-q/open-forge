// Copyright The Open Forge contributors.
import type { WorkspaceMode } from "@shared/store/atoms";
import type { DerivedSessionAxes } from "./session-axes.js";

export const WORKSPACE_MODE_ICON = {
	work: "icon-[solar--document-text-linear]",
	coding: "icon-[solar--code-linear]",
} as const satisfies Record<WorkspaceMode, string>;

export type WorkspaceRightPanel = "work" | "activity" | "none";
export type SessionAxesBadgeKind = "aligned" | "divergent";

/**
 * 右栏只回答「用户现在该看工作台还是执行/预览」。
 * Team 等自带 activity 的宿主、以及用户显式打开的文件/浏览器预览，都不走 work 插槽。
 * work 面板空态不占位：没有任何任务/产物时返回 none，等内容进投影再出现。
 */
export function resolveWorkspaceRightPanel(input: {
	readonly mode: WorkspaceMode | undefined;
	readonly activityPanelOpen: boolean;
	readonly hasExplicitActivity: boolean;
	readonly hasWorkContent: boolean;
}): WorkspaceRightPanel {
	if (input.hasExplicitActivity) return "activity";
	if (input.mode === "work" && !input.activityPanelOpen) {
		return input.hasWorkContent ? "work" : "none";
	}
	return "activity";
}

/** 两轴同档时用一句任务类型；分歧时必须分写，避免再混成同一档。 */
export function sessionAxesBadgeKind(axes: DerivedSessionAxes): SessionAxesBadgeKind {
	return axes.agentMode === axes.capabilityProfile ? "aligned" : "divergent";
}
