// Modified by The Open Forge contributors.

import type { ActivityTabKey } from "@shared/lib/project-profile";
import { activityPanelTabByProjectAtom, aiEditTargetAtom, aiTerminalFeedAtom } from "@shared/store/atoms";
import type { ActivityWorkspace } from "@shared/workspace/activity-workspace";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import type { DesktopBrowserTabEventEnvelope } from "@/shared/browser-tab-ipc";

/** 跟随新发生的 AI 活动；工作区由面板显式传入，不能读取面板自身尚未提供的 Context。 */
export function useFollowAiActivity(workspace: ActivityWorkspace): void {
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
		const latest = feed.at(-1);
		const previous = lastShell.current;
		lastShell.current = { workspaceId: workspace.id, key: latest?.key };
		if (previous.workspaceId !== workspace.id || !latest || latest.key === previous.key) return;
		if (latest.cwd !== workspace.cwd) return;
		follow("terminal");
	}, [feed, workspace.id, workspace.cwd, follow]);

	const lastEdit = useRef({ workspaceId: workspace.id, target: editTarget });
	useEffect(() => {
		const previous = lastEdit.current;
		lastEdit.current = { workspaceId: workspace.id, target: editTarget };
		if (previous.workspaceId !== workspace.id || !editTarget || editTarget === previous.target) return;
		follow("file");
	}, [editTarget, workspace.id, follow]);

	useEffect(() => {
		const subscribe = window.vetta.browserTab?.onEvent;
		if (!subscribe) return;
		return subscribe((envelope: DesktopBrowserTabEventEnvelope) => {
			if (envelope.workspaceId !== workspace.id) return;
			const event = envelope.event;
			if (event.kind === "session-changed" && event.session.agentActivity) follow("browser");
		});
	}, [workspace.id, follow]);
}
