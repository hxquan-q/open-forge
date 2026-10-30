// Modified by The Open Forge contributors.

import type { ActivityTabKey } from "@shared/lib/project-profile";
import { activityPanelTabByProjectAtom, aiEditTargetAtom, aiTerminalFeedAtom } from "@shared/store/atoms";
import type { ActivityWorkspace } from "@shared/workspace/activity-workspace";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import type { DesktopBrowserTabEventEnvelope } from "@/shared/browser-tab-ipc";

/**
 * 跟随新发生的 AI 活动；工作区由面板显式传入，不能读取面板自身尚未提供的 Context。
 * `enabled=false`（§11.3 非 coding 挂载点）时完全不跟随——不订阅浏览器事件、
 * 不对任何活动信号写页签。
 */
export function useFollowAiActivity(workspace: ActivityWorkspace, enabled: boolean): void {
	const feed = useAtomValue(aiTerminalFeedAtom);
	const editTarget = useAtomValue(aiEditTargetAtom);
	const setTabByProject = useSetAtom(activityPanelTabByProjectAtom);
	const follow = useCallback(
		(tab: ActivityTabKey) => {
			setTabByProject((previous) => {
				if (previous.get(workspace.id) === tab) return previous;
				const next = new Map(previous);
				next.set(workspace.id, tab);
				return next;
			});
		},
		[workspace.id, setTabByProject],
	);

	// 先记住挂载/切换工作区时的旧信号，不回放其他会话遗留的活动。
	const lastShell = useRef({ workspaceId: workspace.id, key: feed.at(-1)?.key });
	useEffect(() => {
		if (!enabled) return;
		const latest = feed.at(-1);
		const previous = lastShell.current;
		lastShell.current = { workspaceId: workspace.id, key: latest?.key };
		if (previous.workspaceId !== workspace.id || !latest || latest.key === previous.key) return;
		if (latest.cwd !== workspace.cwd) return;
		follow("terminal");
	}, [enabled, feed, workspace.id, workspace.cwd, follow]);

	const lastEdit = useRef({ workspaceId: workspace.id, target: editTarget });
	useEffect(() => {
		if (!enabled) return;
		const previous = lastEdit.current;
		lastEdit.current = { workspaceId: workspace.id, target: editTarget };
		if (previous.workspaceId !== workspace.id || !editTarget || editTarget === previous.target) return;
		// F03：编辑目标按来源 cwd 过滤，其他项目的目标不切本工作区页签。
		if (editTarget.cwd !== workspace.cwd) return;
		follow("file");
	}, [enabled, editTarget, workspace.id, workspace.cwd, follow]);

	useEffect(() => {
		if (!enabled) return;
		const subscribe = window.vetta.browserTab?.onEvent;
		if (!subscribe) return;
		return subscribe((envelope: DesktopBrowserTabEventEnvelope) => {
			if (envelope.workspaceId !== workspace.id) return;
			const event = envelope.event;
			if (event.kind === "session-changed" && event.session.agentActivity) follow("browser");
		});
	}, [enabled, workspace.id, follow]);
}
