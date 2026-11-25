// Copyright The Open Forge contributors.

import { useAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { weKnoraSaveErrorAtom } from "../atoms";
import { persistWeKnoraSidebarCollapsed, readPersistedWeKnoraSidebarCollapsed } from "../weknora-sidebar-state";
import { useWeKnoraModel } from "./useWeKnoraModel";

/**
 * WeKnora 页整页模型（TASK-0506 / PLAN-0032 P4d）：在 `useWeKnoraModel`（业务连接层）
 * 之上聚合页面 UI 铬件状态——侧栏收起/宽度、设置面板开合。视图层只消费本模型的字段。
 *
 * 对照 `useMemoryPageModel` 的 Page/Model/View 分层：`useWeKnoraModel` 内部数据流与 IPC
 * 契约不变，本层只加页面级 UI 状态；侧栏收起语义、落盘 key 与 sanitize 兜底沿用
 * `weknora-sidebar-state`（A 组 AC-1~5 的行为不变）。
 */

/** 会话栏宽度边界（px）：验收用例 1 登记的拖宽区间。 */
export const WEKNORA_SIDEBAR_MIN_WIDTH = 200;
export const WEKNORA_SIDEBAR_MAX_WIDTH = 480;
export const WEKNORA_SIDEBAR_DEFAULT_WIDTH = 272;

function clampSidebarWidth(width: number): number {
	return Math.min(WEKNORA_SIDEBAR_MAX_WIDTH, Math.max(WEKNORA_SIDEBAR_MIN_WIDTH, width));
}

export function useWeKnoraViewModel() {
	const core = useWeKnoraModel();
	// ④：保存失败反馈走独立 atom 读取 —— 刻意不进连接层 view model，以保持其对外 API 形状不变。
	const [saveError] = useAtom(weKnoraSaveErrorAtom);

	// 侧栏收起是单页面 UI 铬件状态（02-plan §2.5）：本地 state 而非 atom，
	// 惰性初始化只读一次落盘（AC-3 重启保持），切换时写回。
	const [sidebarCollapsed, setSidebarCollapsed] = useState(readPersistedWeKnoraSidebarCollapsed);
	const [sidebarWidth, setSidebarWidth] = useState(WEKNORA_SIDEBAR_DEFAULT_WIDTH);
	const [settingsOpen, setSettingsOpen] = useState(false);

	const toggleSidebar = useCallback((): void => {
		const next = !sidebarCollapsed;
		setSidebarCollapsed(next);
		persistWeKnoraSidebarCollapsed(next);
	}, [sidebarCollapsed]);

	// ResizeHandle 每次回调给的是「自上次回调以来的增量」，这里对受控宽度做增量收敛
	// （与 SplitDetailLayout 的 handleResize 同一折算方式）。
	const resizeSidebar = useCallback((delta: number): void => {
		setSidebarWidth((current) => clampSidebarWidth(current + delta));
	}, []);

	const toggleSettings = useCallback((): void => {
		setSettingsOpen((open) => !open);
	}, []);

	const model = useMemo(
		() => ({
			configured: core.configured,
			baseUrl: core.config?.baseUrl ?? "",
			hasApiKey: core.config?.hasApiKey ?? false,
			agents: core.agents,
			agentsStatus: core.agentsStatus,
			selectedAgentId: core.selectedAgentId,
			messages: core.messages,
			isStreaming: core.isStreaming,
			currentSessionId: core.currentSessionId,
			sessions: core.sessions,
			sessionsStatus: core.sessionsStatus,
			loadingSessionId: core.loadingSessionId,
			streamingSessionIds: core.streamingSessionIds,
			deletingSessionId: core.deletingSessionId,
			batchDeleting: core.batchDeleting,
			exporting: core.exporting,
			deleteError: core.deleteError,
			canAsk: core.canAsk,
			saving: core.saving,
			saveError,
			sidebarCollapsed,
			sidebarWidth,
			settingsOpen,
		}),
		[core, saveError, sidebarCollapsed, sidebarWidth, settingsOpen],
	);

	const actions = useMemo(
		() => ({
			...core.actions,
			toggleSidebar,
			resizeSidebar,
			toggleSettings,
		}),
		[core.actions, toggleSidebar, resizeSidebar, toggleSettings],
	);

	return { model, actions };
}

export type WeKnoraPageViewModel = ReturnType<typeof useWeKnoraViewModel>["model"];
export type WeKnoraPageActions = ReturnType<typeof useWeKnoraViewModel>["actions"];
