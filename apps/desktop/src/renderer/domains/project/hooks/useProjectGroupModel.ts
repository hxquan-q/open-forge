// Modified by The Open Forge contributors.
import { notifyTeamSessionsChanged } from "@shared/agent-teams/team-session-events";
import { classifyTeamSessionRenameFailure } from "@shared/agent-teams/team-session-rename-failure";
import { pathBasename } from "@shared/lib/utils";
import type { Project, ProjectType } from "@shared/store/atoms";
import {
	archivedSessionPathsAtom,
	automationSessionLinksAtom,
	pinnedSessionPathsAtom,
	projectContextMenuAtom,
	renamingSessionPathAtom,
	runningSessionPathsAtom,
	scheduledSessionPathsAtom,
	sessionContextMenuAtom,
	sessionDisplayLabel,
} from "@shared/store/atoms";
import { showToast } from "@shared/store/toast-atoms";
import { isSshProjectUri } from "@vetta/ssh-transport/project-uri";
import { DEFAULT_VISIBLE_SESSIONS } from "@vetta-org/theme-ui/project";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	type AutomationGroupRowFields,
	automationGroupContaining,
	collapseAutomationSessions,
	expandAutomationGroupRows,
} from "../services/automation-session-groups";
import {
	isSidebarConversationActive,
	type SidebarConversationInfo,
	sidebarConversationIdentity,
	sidebarConversationKey,
} from "../services/sidebar-conversation-projection";
import { buildSidebarSessionOrdering, withoutArchivedSessions } from "../services/sidebar-session-order";
import { reuseUnchangedSessionViews } from "./stableSessionViews";

export interface ProjectGroupSessionView extends AutomationGroupRowFields {
	key: string;
	path: string;
	label: string;
	active: boolean;
	renaming: boolean;
	running: boolean;
	scheduled: boolean;
	pinned: boolean;
	iconClassName?: string;
	trailingAvatarUrls?: readonly string[];
	titleExtra?: string;
	/** 数据文件缺失的团队会话（BUG-0195）：置灰呈现。 */
	dimmed?: boolean;
	session: SidebarConversationInfo;
}

interface UseProjectGroupModelArgs {
	activeSessionPath: string;
	activeTeamSessionId: string;
	isActive?: boolean;
	isExpanded: boolean;
	onCollapse: (cwd: string) => void;
	onExpand: (cwd: string) => void;
	onNavigateProject: (cwd: string) => void;
	onNewSession: (cwd: string) => void;
	onRenameSession: (cwd: string, sessionPath: string, name: string) => void;
	onSelectSession: (cwd: string, session: SidebarConversationInfo) => void;
	project: Project;
	/** 远程项目所属主机的显示名，借 badge 位常驻展示，替代「批量任务」以外的空档。 */
	remoteHostLabel?: string;
	sessions: SidebarConversationInfo[];
}

export function useProjectGroupModel({
	activeSessionPath,
	activeTeamSessionId,
	isActive = false,
	isExpanded,
	onCollapse,
	onExpand,
	onNavigateProject,
	onNewSession,
	onRenameSession,
	onSelectSession,
	project,
	remoteHostLabel,
	sessions,
}: UseProjectGroupModelArgs) {
	const { t, i18n } = useTranslation("project");
	const setContextMenu = useSetAtom(sessionContextMenuAtom);
	const setProjectContextMenu = useSetAtom(projectContextMenuAtom);
	const renamingSessionPath = useAtomValue(renamingSessionPathAtom);
	const setRenamingSessionPath = useSetAtom(renamingSessionPathAtom);
	const viewCacheRef = useRef(new Map<string, ProjectGroupSessionView>());
	const [showAllSessions, setShowAllSessions] = useState(false);
	const revealedActiveSessionRef = useRef<string | null>(null);
	const runningSessionPaths = useAtomValue(runningSessionPathsAtom);
	const pinnedSessionPaths = useAtomValue(pinnedSessionPathsAtom);
	const scheduledSessionPaths = useAtomValue(scheduledSessionPathsAtom);
	const scheduledBasenames = useMemo(() => {
		const basenames = new Set<string>();
		for (const path of scheduledSessionPaths) basenames.add(path.slice(path.lastIndexOf("/") + 1));
		return basenames;
	}, [scheduledSessionPaths]);
	// 运行标记覆盖整个项目：归档行即使不显示，项目这个事实仍然成立。
	const projectHasRunning = useMemo(
		() => sessions.some((session) => runningSessionPaths.has(session.path)),
		[sessions, runningSessionPaths],
	);
	const archivedSessionPaths = useAtomValue(archivedSessionPathsAtom);
	const unarchivedSessions = useMemo(
		() => withoutArchivedSessions(sessions, archivedSessionPaths),
		[archivedSessionPaths, sessions],
	);
	// 同一自动化「每次新建会话」产生的会话折叠成一行，排序与「显示更多」都按折叠后的行数算。
	const automationLinks = useAtomValue(automationSessionLinksAtom);
	const collapsed = useMemo(
		() => collapseAutomationSessions(unarchivedSessions, automationLinks, pinnedSessionPaths),
		[automationLinks, pinnedSessionPaths, unarchivedSessions],
	);
	const [expandedTaskIds, setExpandedTaskIds] = useState<ReadonlySet<string>>(() => new Set<string>());
	const ordering = useMemo(
		() =>
			buildSidebarSessionOrdering(collapsed.sessions, pinnedSessionPaths, DEFAULT_VISIBLE_SESSIONS, showAllSessions),
		[collapsed.sessions, pinnedSessionPaths, showAllSessions],
	);

	useEffect(() => {
		if (!isExpanded) setShowAllSessions(false);
	}, [isExpanded]);

	const activeConversationKey = activeTeamSessionId
		? `agent-team:${activeTeamSessionId}`
		: activeSessionPath
			? `conversation:${activeSessionPath}`
			: "";
	useEffect(() => {
		if (!activeConversationKey) {
			revealedActiveSessionRef.current = null;
			return;
		}
		if (revealedActiveSessionRef.current === activeConversationKey) return;
		// 正在看的会话藏在会话组里时展开该组，并以组的位置判断是否要「显示更多」。
		const groupTaskId = activeTeamSessionId
			? undefined
			: automationGroupContaining(collapsed.groupsByHeadPath, activeSessionPath);
		const groupHeadPath = groupTaskId
			? [...collapsed.groupsByHeadPath].find(([, group]) => group.taskId === groupTaskId)?.[0]
			: undefined;
		const activeIndex = ordering.all.findIndex((session) =>
			groupHeadPath ? session.path === groupHeadPath : sidebarConversationKey(session) === activeConversationKey,
		);
		if (activeIndex < 0) return;
		revealedActiveSessionRef.current = activeConversationKey;
		if (groupTaskId) setExpandedTaskIds((prev) => (prev.has(groupTaskId) ? prev : new Set(prev).add(groupTaskId)));
		const collapsedOrdering = buildSidebarSessionOrdering(
			collapsed.sessions,
			pinnedSessionPaths,
			DEFAULT_VISIBLE_SESSIONS,
			false,
		);
		if (activeIndex >= collapsedOrdering.visible.length) setShowAllSessions(true);
	}, [activeConversationKey, activeSessionPath, activeTeamSessionId, collapsed, ordering.all, pinnedSessionPaths]);

	const displayName = project.name ?? pathBasename(project.cwd);
	const projectType = project.type;
	const isRemoteProject = isSshProjectUri(project.cwd);
	const projectBadge = getProjectBadge(project, projectType, t) ?? (isRemoteProject ? remoteHostLabel : undefined);

	// t 在 changeLanguage 后可能保持同一引用；读 i18n.language 强制语言切换时重算未命名团队会话文案。
	const sessionViews: ProjectGroupSessionView[] = useMemo(() => {
		void i18n.language;
		const toView = (session: SidebarConversationInfo): ProjectGroupSessionView => {
			const identity = sidebarConversationIdentity(session, {
				conversationLabel: session.kind === "conversation" ? sessionDisplayLabel(session) : undefined,
				untitledTeamLabel: t("sidebar.session.untitledTeam"),
			});
			const isSessionActive = isSidebarConversationActive(session, activeSessionPath, activeTeamSessionId);
			const isRunning = runningSessionPaths.has(session.path);
			const isSchedule =
				identity.mutable &&
				(scheduledSessionPaths.has(session.path) ||
					scheduledBasenames.has(session.path.slice(session.path.lastIndexOf("/") + 1)));
			return {
				key: identity.key,
				path: session.path,
				label: identity.label,
				active: isSessionActive,
				pinned: pinnedSessionPaths.has(session.path),
				renaming: identity.mutable && renamingSessionPath === session.path,
				running: isRunning,
				scheduled: isSchedule,
				iconClassName: identity.iconClassName,
				trailingAvatarUrls: identity.trailingAvatarUrls,
				titleExtra: identity.titleExtra,
				...(session.kind === "agent-team" && session.dataFileMissing ? { dimmed: true } : {}),
				session,
			};
		};
		const next = expandAutomationGroupRows(
			ordering.visible.map(toView),
			collapsed.groupsByHeadPath,
			expandedTaskIds,
			toView,
		);
		// 未变的行还回旧引用，让下游行组件的 memo 生效。
		return reuseUnchangedSessionViews(viewCacheRef.current, next);
	}, [
		activeSessionPath,
		activeTeamSessionId,
		collapsed.groupsByHeadPath,
		expandedTaskIds,
		i18n.language,
		renamingSessionPath,
		runningSessionPaths,
		pinnedSessionPaths,
		scheduledBasenames,
		scheduledSessionPaths,
		t,
		ordering.visible,
	]);

	// per-row 回调必须引用稳定，否则行组件的 memo 永远命中不了。
	const projectCwd = project.cwd;
	const collapse = useCallback(() => onCollapse(projectCwd), [onCollapse, projectCwd]);
	const expand = useCallback(() => onExpand(projectCwd), [onExpand, projectCwd]);
	const navigateProject = useCallback(() => onNavigateProject(projectCwd), [onNavigateProject, projectCwd]);
	const newSession = useCallback(() => onNewSession(projectCwd), [onNewSession, projectCwd]);
	const openProjectContextMenu = useCallback(
		(event: React.MouseEvent) => {
			event.preventDefault();
			setProjectContextMenu({ x: event.clientX, y: event.clientY, project });
		},
		[project, setProjectContextMenu],
	);
	const openSessionContextMenu = useCallback(
		(event: React.MouseEvent, session: SidebarConversationInfo) => {
			event.preventDefault();
			setContextMenu({
				x: event.clientX,
				y: event.clientY,
				session,
				allowMutations: true,
				canTag: false,
				// 项目内会话随项目归属工作空间，不提供单独移动。
				independent: false,
			});
		},
		[setContextMenu],
	);
	const renameDone = useCallback(() => setRenamingSessionPath(null), [setRenamingSessionPath]);
	const renameSessionByPath = useCallback(
		(session: SidebarConversationInfo, name: string) => {
			if (session.kind === "conversation") {
				onRenameSession(projectCwd, session.path, name);
				return;
			}
			void window.vetta.agentTeams
				.renameSession({ id: session.teamSessionId, coordinationSessionPath: session.path }, name)
				.then(() => {
					notifyTeamSessionsChanged(session.teamId);
				})
				.catch((error: unknown) => {
					// IPC rejection 无出口会升级成 unhandled rejection（BUG-0114）；
					// 数据文件缺失按锚点归类成「只能删除」（BUG-0195）。
					console.error("[project-group] rename team session failed", error);
					showToast({
						variant: "error",
						message:
							classifyTeamSessionRenameFailure(error) === "data_file_missing"
								? t("allstarDev.home.sessions.renameFailedDataMissing")
								: t("sidebar.session.renameFailed"),
					});
				});
		},
		[onRenameSession, projectCwd, t],
	);
	const selectSessionByPath = useCallback(
		(session: SidebarConversationInfo) => {
			// 数据文件缺失的团队会话打开必败：不导航（BUG-0195）。
			if (session.kind === "agent-team" && session.dataFileMissing) return;
			onSelectSession(projectCwd, session);
		},
		[onSelectSession, projectCwd],
	);
	const toggleShowAll = useCallback(() => setShowAllSessions((value) => !value), []);
	// 组头点击即展开/收起整组运行；展开状态只留在本组件内存，切走项目后重来。
	const toggleGroup = useCallback((taskId: string) => {
		setExpandedTaskIds((prev) => {
			const next = new Set(prev);
			if (!next.delete(taskId)) next.add(taskId);
			return next;
		});
	}, []);

	return {
		displayName,
		expanded: isExpanded,
		hasMoreSessions: ordering.hasMore,
		hasRunning: projectHasRunning,
		hiddenCount: ordering.hiddenCount,
		isActive,
		newSessionTitle: t("sidebar.nav.newSession"),
		toggleTitle: t("sidebar.projects.toggleSessions", { name: displayName }),
		noSessionsLabel: t("sidebar.projects.noSessions"),
		project,
		projectBadge,
		projectType,
		remote: isRemoteProject,
		sessionViews,
		showAllSessions,
		showMoreLabels: {
			collapse: t("sidebar.projects.collapseSessions"),
			expand: t("sidebar.projects.expandMore", { count: ordering.hiddenCount }),
		},
		actions: {
			collapse,
			expand,
			navigateProject,
			newSession,
			openProjectContextMenu,
			openSessionContextMenu,
			renameDone,
			renameSession: renameSessionByPath,
			selectSession: selectSessionByPath,
			toggleGroup,
			toggleShowAll,
		},
	};
}

function getProjectBadge(
	_project: Project,
	projectType: ProjectType,
	t: (key: "detail.typeBatch") => string,
): string | undefined {
	if (projectType === "normal") return undefined;
	return t("detail.typeBatch");
}
