// Copyright The Open Forge contributors.
import { activityPanelOpenAtom, type WorkspaceMode } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { resolveWorkspaceRightPanel, type WorkspaceRightPanel } from "../lib/workspace-session-flow.js";
import { useTaskProjection } from "./useTaskProjection";

const NO_RUNTIMES: readonly string[] = [];

/**
 * 右栏决策的唯一装配点：面板开关 atom + 会话 Task/Artifact 投影 + 纯函数 resolver。
 * 投影挂在这一层而不是面板里——右栏「有内容才出现」时面板根本不挂载，快照补齐
 * 必须在这里常驻，否则重开的会话永远发现不了已有任务/产物。
 */
export function useWorkspaceRightPanel(input: {
	readonly mode: WorkspaceMode | undefined;
	readonly runtimeIds: readonly string[];
	readonly hasExplicitActivity: boolean;
}): WorkspaceRightPanel {
	const activityPanelOpen = useAtomValue(activityPanelOpenAtom);
	const taskState = useTaskProjection(input.mode === "work" ? input.runtimeIds : NO_RUNTIMES);
	const hasWorkContent = taskState.tasks.length > 0 || taskState.artifacts.length > 0;
	// work 模式右栏默认是插槽面板；Team 等显式 activity、以及用户打开的预览，都不走这槽。
	return resolveWorkspaceRightPanel({
		mode: input.mode,
		activityPanelOpen,
		hasExplicitActivity: input.hasExplicitActivity,
		hasWorkContent,
	});
}
