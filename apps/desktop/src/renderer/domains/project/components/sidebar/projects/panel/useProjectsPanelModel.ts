// Modified by The Open Forge contributors.
import { useBatchTasks } from "@domains/batch-tasks/hooks/useBatchTasks";
import { notifyTeamSessionsChanged } from "@shared/agent-teams/team-session-events";
import { useSshHosts } from "@shared/hooks/useSshHost";
import { useTeamSidebarConversations } from "@shared/hooks/useTeamSidebarConversations";
import { pathBasename } from "@shared/lib/utils";
import type { SessionInfo } from "@shared/store/atoms";
import {
	activeSessionAtom,
	batchProjectsAtom,
	confirmDialogAtom,
	conversationFilterSource,
	defaultConversationCwdAtom,
	defaultConversationFilterAtom,
	defaultImConversationCwdAtom,
	expandedBatchProjectsAtom,
	inlineFilePreviewAtom,
	lastActiveSessionAtom,
	pendingSessionOpenAtom,
} from "@shared/store/atoms";
import { showToast } from "@shared/store/toast-atoms";
import { useMatches, useNavigate } from "@tanstack/react-router";
import { isSshProjectUri, parseProjectLocation } from "@vetta/ssh-transport/project-uri";
import { useAtom, useAtomValue, useSetAtom, useStore } from "jotai";
import { selectAtom } from "jotai/utils";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { resolveProjectGoneCleanup } from "../../../../hooks/project-gone-cleanup";
import { resolveSessionOpenTarget } from "../../../../hooks/session-open-target";
import { useProjects } from "../../../../hooks/useProjects";
import {
	projectSidebarConversations,
	type SidebarConversationInfo,
} from "../../../../services/sidebar-conversation-projection";
import { resolveSidebarSelectionState } from "./sidebar-selection-state";
import type { BatchProjectEntry, ProjectsPanelModel, ProjectsPanelProps } from "./types";
import { useSidebarSelectionIntent } from "./useSidebarSelectionIntent";

const EMPTY_SESSIONS: SessionInfo[] = [];

/**
 * 侧栏只关心当前会话的 path / cwd。订阅 activeSession 整个对象会让 session 上任何字段
 * 变动（token 计数、运行状态）都把整块项目面板重渲染一遍。
 */
const activeSessionPathAtom = selectAtom(activeSessionAtom, (session) => session?.sessionPath ?? "");
const activeSessionCwdAtom = selectAtom(activeSessionAtom, (session) => session?.cwd ?? "");
const pendingSessionPathAtom = selectAtom(pendingSessionOpenAtom, (session) => session?.sessionPath ?? "");

export function useProjectsPanelModel({
	filter,
	onOpenSession,
}: Pick<ProjectsPanelProps, "filter" | "onOpenSession">): ProjectsPanelModel {
	const { t } = useTranslation("project");
	const {
		projects,
		projectsInitialized,
		sessionsMap,
		sessionLoadingCwds,
		expandedProjects,
		expandProject,
		collapseProject,
		deleteSession,
		renameSession,
		archiveProject,
		removeProject,
		deleteProjectFromDisk,
		loadSessions,
		removePinnedSessions,
	} = useProjects();
	const teamSidebar = useTeamSidebarConversations(projects.map((project) => project.cwd));
	const activeSessionPathValue = useAtomValue(activeSessionPathAtom);
	const pendingSessionPath = useAtomValue(pendingSessionPathAtom);
	const activeSessionCwd = useAtomValue(activeSessionCwdAtom);
	const store = useStore();
	const imCwd = useAtomValue(defaultImConversationCwdAtom);
	const setActiveSession = useSetAtom(activeSessionAtom);
	const setInlineFilePreview = useSetAtom(inlineFilePreviewAtom);
	const setConfirm = useSetAtom(confirmDialogAtom);
	const navigate = useNavigate();
	const matches = useMatches();
	const currentPath = matches[matches.length - 1]?.pathname ?? "/";
	// 删除是异步的：完成时判断「是否还在首页」要用那时的路由，而不是发起删除时
	// 闭包里的旧值——否则等待期间离开首页的用户会被拉回新建页（BUG-0191）。
	const currentPathRef = useRef(currentPath);
	useEffect(() => {
		currentPathRef.current = currentPath;
	}, [currentPath]);
	const routeParams = matches[matches.length - 1]?.params as
		| { path?: string; cwd?: string; sessionId?: string }
		| undefined;
	const viewerSessionPath = routeParams?.path ? decodeURIComponent(routeParams.path) : "";
	/** `/project/$cwd` 与 `/new-session/$cwd` 的参数值本身是编码过的（见导航处的 encodeURIComponent）。 */
	const routeCwd = routeParams?.cwd ? decodeURIComponent(routeParams.cwd) : "";
	const routeActiveTeamSessionId =
		currentPath.startsWith("/agent-teams/") && routeParams?.sessionId
			? decodeURIComponent(routeParams.sessionId)
			: "";
	const { fallbackSelection, settledSelection } = resolveSidebarSelectionState({
		currentPath,
		activeSessionPath: activeSessionPathValue,
		pendingSessionPath,
		viewerSessionPath,
		routeTeamSessionId: routeActiveTeamSessionId,
	});
	const { selectionIntent: sidebarSelectionIntent, selectAfterPaint } = useSidebarSelectionIntent(settledSelection);
	const selectedSession = sidebarSelectionIntent ?? fallbackSelection;
	const activeSessionPath = selectedSession?.kind === "conversation" ? selectedSession.path : "";
	const activeTeamSessionId = selectedSession?.kind === "agent-team" ? selectedSession.sessionId : "";
	// 与 currentPathRef 同理：团队会话的「活动」由路由推导，删除完成时判定要读
	// 那时的最新值，不能用发起删除时闭包里的旧值（BUG-0191 团队分支）。
	const activeTeamSessionIdRef = useRef(activeTeamSessionId);
	useEffect(() => {
		activeTeamSessionIdRef.current = activeTeamSessionId;
	}, [activeTeamSessionId]);
	const batchProjects = useAtomValue(batchProjectsAtom);
	const [expandedBatchProjects, setExpandedBatchProjects] = useAtom(expandedBatchProjectsAtom);
	const { deleteTask: deleteBatchTask, deleteProject: deleteBatchProject } = useBatchTasks();
	const defaultConversationFilter = useAtomValue(defaultConversationFilterAtom);
	// 标签档只是「对话」的一个子集视图，会话来源仍取普通对话目录。
	const defaultConversationSource = conversationFilterSource(defaultConversationFilter);
	const defaultConversationCwd = useAtomValue(defaultConversationCwdAtom);

	const expandBatchProject = useCallback(
		(cwd: string) => {
			setExpandedBatchProjects((prev) => {
				if (prev.has(cwd)) return prev;
				const next = new Set(prev);
				next.add(cwd);
				return next;
			});
		},
		[setExpandedBatchProjects],
	);

	const collapseBatchProject = useCallback(
		(cwd: string) => {
			setExpandedBatchProjects((prev) => {
				if (!prev.has(cwd)) return prev;
				const next = new Set(prev);
				next.delete(cwd);
				return next;
			});
		},
		[setExpandedBatchProjects],
	);

	const visibleBatchProjects = useMemo(
		() => batchProjects.filter((project) => project.tasks.some((task) => task.sessionPath)),
		[batchProjects],
	);

	const batchAsProjects = useMemo<BatchProjectEntry[]>(
		() =>
			visibleBatchProjects.map((batchProject) => {
				const tasksWithSession = batchProject.tasks.filter((task) => task.sessionPath);
				return {
					project: {
						cwd: batchProject.id,
						name: batchProject.name,
						sessionCount: tasksWithSession.length,
						type: "batch",
					},
					sessions: tasksWithSession.map((task) => ({
						kind: "conversation" as const,
						id: task.id,
						path: task.sessionPath!,
						cwd: task.cwd,
						name: task.name || undefined,
						firstMessage: task.name || task.id,
						modifiedAt: task.updatedAt,
					})),
				};
			}),
		[visibleBatchProjects],
	);

	const showBatchGroup = filter === "all" || filter === "batch";
	const defaultProject = useMemo(() => projects.find((project) => project.isDefault), [projects]);
	// 默认区的会话来源 cwd：claw 过滤读 im-gateway 自己的 cwd（ADR-0005），
	// 与 defaultProject.cwd 是两个物理目录，选中 / 重命名都必须用这个值。
	const defaultSessionsCwd = defaultConversationSource === "claw" ? imCwd : defaultProject?.cwd;
	const filteredProjects = useMemo(() => {
		const visible = projects.filter((project) => project.type !== "batch" && !project.isDefault);
		if (filter === "all") return visible;
		return visible.filter((project) => project.type === filter);
	}, [projects, filter]);

	const navigateProject = useCallback(
		(cwd: string) => {
			void (async () => {
				setInlineFilePreview(null);
				await navigate({ to: "/project/$cwd", params: { cwd: encodeURIComponent(cwd) } });
				setActiveSession(null);
			})();
		},
		[navigate, setActiveSession, setInlineFilePreview],
	);

	const newSession = useCallback(
		(cwd: string) => {
			void navigate({ to: "/new-session/$cwd", params: { cwd: encodeURIComponent(cwd) } });
		},
		[navigate],
	);

	/**
	 * 标签档下新建的会话会继承当前标签（见 applyActiveTagFilterToNewConversation），
	 * 所以档位保持不动：切回「对话」反而会把用户从自己选的标签视图里踢出去。
	 */
	const defaultNewSession = newSession;

	// sessionsMap 每次 listSessions 回填都会换 Map 引用。openSessionByTarget 作为
	// onSelectSession 传进每个 memo 的 ProjectGroup，若直接依赖 sessionsMap，任意一次
	// 回填都会击穿所有项目组的 memo。事件回调只在点击时才需要最新值，走 ref 读取。
	const sessionsMapRef = useRef(sessionsMap);
	useEffect(() => {
		sessionsMapRef.current = sessionsMap;
	}, [sessionsMap]);
	const openInteractiveSession = useCallback(
		async (cwd: string, path: string, executionMode?: Parameters<ProjectsPanelProps["onOpenSession"]>[2]) => {
			const previousPath = store.get(activeSessionAtom)?.sessionPath;
			if (executionMode === undefined) await onOpenSession(cwd, path);
			else await onOpenSession(cwd, path, executionMode);
			const activePath = store.get(activeSessionAtom)?.sessionPath;
			if (!activePath) return false;
			return activePath === previousPath ? undefined : ({ kind: "conversation", path: activePath } as const);
		},
		[onOpenSession, store],
	);

	const openSessionByTarget = useCallback(
		(cwd: string, path: string) => {
			const target = resolveSessionOpenTarget(sessionsMapRef.current.get(cwd), path);
			if (target === "unavailable") return;
			if (target === "viewer") {
				selectAfterPaint({ kind: "conversation", path }, () =>
					navigate({ to: "/viewer/$path", params: { path: encodeURIComponent(path) } }),
				);
				return;
			}
			selectAfterPaint({ kind: "conversation", path }, () => openInteractiveSession(cwd, path));
		},
		[navigate, openInteractiveSession, selectAfterPaint],
	);

	const selectSidebarSession = useCallback(
		(cwd: string, session: SidebarConversationInfo) => {
			if (session.kind === "agent-team") {
				// 数据文件缺失的团队会话打开必败：不导航（BUG-0195）。项目区与默认区
				// 的行选择都在此收口，置灰行点击后什么都不发生。
				if (session.dataFileMissing) return;
				selectAfterPaint({ kind: "agent-team", sessionId: session.teamSessionId }, () =>
					navigate({
						to: "/agent-teams/$teamId/sessions/$sessionId",
						params: { teamId: session.teamId, sessionId: session.teamSessionId },
					}),
				);
				return;
			}
			openSessionByTarget(cwd, session.path);
		},
		[navigate, openSessionByTarget, selectAfterPaint],
	);

	const selectBatchSession = useCallback(
		(_cwd: string, session: SidebarConversationInfo) => {
			const task = visibleBatchProjects
				.flatMap((project) => project.tasks)
				.find((item) => item.sessionPath === session.path);
			if (!task) return;
			selectAfterPaint({ kind: "conversation", path: session.path }, () =>
				openInteractiveSession(task.cwd, session.path, task.executionMode),
			);
		},
		[openInteractiveSession, selectAfterPaint, visibleBatchProjects],
	);

	// 默认区（含 claw）与项目区共用同一套判定；cwd 由 defaultSessionsCwd 逐层传下，
	// 保证查 access 用的是会话真正所属的 cwd。
	const defaultSelectSession = selectSidebarSession;

	const deletePanelSession = useCallback(
		(session: SidebarConversationInfo) => {
			// 删除编排收口在这里（BUG-0191）：菜单层只确认与调用。主删除失败时
			// 只弹失败 toast——列表/标记/活动会话/路由全部保留，用户可重试；
			// 标注/归档标记、摘行与必要导航只在删除成功之后执行。活动会话以
			// 完成时最新状态判定，旧闭包不得清掉用户等待期间切到的新会话。
			const failToast = (context: string, error: unknown): void => {
				console.error(context, error);
				showToast({ variant: "error", message: t("sidebar.dialogs.deleteSessionFailedToast") });
			};
			// 会话没了，它留下的标注与归档标记就是孤儿；删除确认成功后才清理，
			// 清理失败不回滚删除结果，但属于「部分关联信息未清理」。
			const cleanupMetadata = async (path: string): Promise<boolean> => {
				let failed = false;
				try {
					await window.vetta.conversationTags.forgetConversations([path]);
				} catch (error) {
					failed = true;
					console.error("[projects-panel] forget conversation tags failed", path, error);
				}
				try {
					await window.vetta.archivedSessions.forget([path]);
				} catch (error) {
					failed = true;
					console.error("[projects-panel] forget archived session failed", path, error);
				}
				return failed;
			};
			const reportPartialCleanup = (): void => {
				showToast({ variant: "warning", message: t("sidebar.dialogs.deleteSessionPartialCleanupToast") });
			};
			// 完成时重新读活动会话与路由：用户可能在等待期间切走或离开首页，
			// 只有删的仍是当前活动会话才允许清活动/导航，其余情况只摘行。
			const settleActiveSession = (path: string, projectCwd: string): void => {
				if (store.get(activeSessionAtom)?.sessionPath !== path) return;
				setActiveSession(null);
				if (currentPathRef.current === "/") {
					void navigate({ to: "/new-session/$cwd", params: { cwd: encodeURIComponent(projectCwd) } });
				}
			};
			if (session.kind === "agent-team") {
				void (async () => {
					try {
						await window.vetta.agentTeams.deleteSession({
							id: session.teamSessionId,
							coordinationSessionPath: session.path,
						});
					} catch (error) {
						// IPC rejection 无出口会升级成 unhandled rejection，用户侧零反馈（BUG-0114）。
						failToast("[projects-panel] delete team session failed", error);
						return;
					}
					notifyTeamSessionsChanged(session.teamId);
					// 完成时判定（与普通/批量同口径）：用户等待期切走后不得拉回首页。
					if (activeTeamSessionIdRef.current === session.teamSessionId) {
						void navigate({ to: "/" });
					}
					const metadataFailed = await cleanupMetadata(session.path);
					if (metadataFailed) reportPartialCleanup();
				})();
				return;
			}
			const batchMatch = batchProjects.find((project) =>
				project.tasks.some((task) => task.sessionPath === session.path),
			);
			if (batchMatch) {
				const task = batchMatch.tasks.find((item) => item.sessionPath === session.path);
				if (task) {
					void (async () => {
						try {
							await deleteBatchTask(batchMatch.id, task.id);
						} catch (error) {
							failToast("[projects-panel] delete batch task session failed", error);
							return;
						}
						// 导航/清活动不等待元数据清理：清理 IPC 挂起不应把用户滞留在已删会话上。
						settleActiveSession(session.path, batchMatch.id);
						if (await cleanupMetadata(session.path)) reportPartialCleanup();
					})();
					return;
				}
			}
			void (async () => {
				let result: { cleanupFailed: boolean };
				try {
					result = await deleteSession(session.cwd, session.path);
				} catch (error) {
					failToast("[projects-panel] delete session failed", error);
					return;
				}
				settleActiveSession(session.path, session.cwd);
				const metadataFailed = await cleanupMetadata(session.path);
				if (result.cleanupFailed || metadataFailed) reportPartialCleanup();
			})();
		},
		[batchProjects, deleteBatchTask, deleteSession, setActiveSession, store, navigate, t],
	);

	const renamePanelSession = useCallback(
		(cwd: string, sessionPath: string, name: string) => {
			void renameSession(cwd, sessionPath, name);
		},
		[renameSession],
	);

	const cleanupAfterProjectGone = useCallback(
		(projectCwd: string, sessionPathsInProject: string[]) => {
			const { clearActiveSession, navigation } = resolveProjectGoneCleanup(projectCwd, sessionPathsInProject, {
				currentPath,
				routeCwd,
				routeSessionPath: viewerSessionPath,
				activeSessionCwd,
				activeSessionPath: activeSessionPathValue,
				defaultConversationCwd,
			});
			if (clearActiveSession) setActiveSession(null);
			if (navigation.kind === "new-session") {
				void navigate({ to: "/new-session/$cwd", params: { cwd: encodeURIComponent(navigation.cwd) } });
				return;
			}
			if (navigation.kind === "home") {
				// 回首页不应经 lastActive 恢复被删项目的会话（可能是 code 会话，删完项目却
				// 落进开发版块很突兀）——属于该项目的恢复指针一并清除，回落默认「对话」。
				const last = store.get(lastActiveSessionAtom) as { cwd?: string; sessionPath?: string } | null;
				if (
					last &&
					(last.cwd === projectCwd ||
						(typeof last.sessionPath === "string" && sessionPathsInProject.includes(last.sessionPath)))
				) {
					store.set(lastActiveSessionAtom, null);
				}
				void navigate({ to: "/" });
			}
		},
		[
			activeSessionCwd,
			activeSessionPathValue,
			setActiveSession,
			currentPath,
			routeCwd,
			store,
			viewerSessionPath,
			defaultConversationCwd,
			navigate,
		],
	);

	const confirmDeleteBatchProject = useCallback(
		(batch: (typeof batchProjects)[number]) => {
			const taskPaths = batch.tasks.map((task) => task.sessionPath).filter((path): path is string => Boolean(path));
			setConfirm({
				title: t("sidebar.dialogs.deleteBatchTitle"),
				message: t("sidebar.dialogs.deleteBatchMessage", { name: batch.name }),
				confirmLabel: t("sidebar.dialogs.deleteConfirm"),
				variant: "danger",
				onConfirm: async () => {
					await deleteBatchProject(batch.id);
					cleanupAfterProjectGone(batch.id, taskPaths);
				},
			});
		},
		[cleanupAfterProjectGone, deleteBatchProject, setConfirm, t],
	);

	const removePanelProject = useCallback(
		(cwd: string) => {
			const batch = batchProjects.find((project) => project.id === cwd);
			if (batch) {
				confirmDeleteBatchProject(batch);
				return;
			}
			const project = projects.find((item) => item.cwd === cwd);
			const displayName = project?.name ?? pathBasename(cwd);
			const sessionPaths = (sessionsMap.get(cwd) ?? []).map((session) => session.path);
			setConfirm({
				title: t("sidebar.dialogs.removeTitle"),
				message: t("sidebar.dialogs.removeMessage", { name: displayName }),
				confirmLabel: t("sidebar.dialogs.removeConfirm"),
				variant: "default",
				onConfirm: async () => {
					await removeProject(cwd);
					cleanupAfterProjectGone(cwd, sessionPaths);
				},
			});
		},
		[
			batchProjects,
			confirmDeleteBatchProject,
			projects,
			sessionsMap,
			setConfirm,
			t,
			removeProject,
			cleanupAfterProjectGone,
		],
	);

	const deletePanelProject = useCallback(
		(cwd: string) => {
			const batch = batchProjects.find((project) => project.id === cwd);
			if (batch) {
				confirmDeleteBatchProject(batch);
				return;
			}
			const project = projects.find((item) => item.cwd === cwd);
			const displayName = project?.name ?? pathBasename(cwd);
			const sessionPaths = (sessionsMap.get(cwd) ?? []).map((session) => session.path);
			setConfirm({
				title: t("sidebar.dialogs.deleteProjectTitle"),
				message: t("sidebar.dialogs.deleteProjectMessage", { name: displayName }),
				confirmLabel: t("sidebar.dialogs.deleteConfirm"),
				variant: "danger",
				onConfirm: async () => {
					await deleteProjectFromDisk(cwd);
					cleanupAfterProjectGone(cwd, sessionPaths);
				},
			});
		},
		[
			batchProjects,
			confirmDeleteBatchProject,
			projects,
			sessionsMap,
			setConfirm,
			t,
			deleteProjectFromDisk,
			cleanupAfterProjectGone,
		],
	);

	const clearConversation = useCallback(
		(cwd: string) => {
			const allSessions = sessionsMap.get(cwd) ?? [];
			setConfirm({
				title: t("sidebar.dialogs.clearConversationTitle"),
				message: t("sidebar.dialogs.clearConversationMessage", { count: allSessions.length }),
				confirmLabel: t("sidebar.dialogs.clearConfirm"),
				variant: "danger",
				onConfirm: async () => {
					await window.vetta.session.clearDefaultConversation("conversation");
					const removedPaths = new Set(allSessions.map((session) => session.path));
					removePinnedSessions(removedPaths);
					if (removedPaths.has(activeSessionPathValue) || (activeSessionCwd === cwd && !removedPaths.size)) {
						setActiveSession(null);
						void navigate({
							to: "/new-session/$cwd",
							params: { cwd: encodeURIComponent(cwd) },
						});
					}
					await loadSessions(cwd);
				},
			});
		},
		[
			setConfirm,
			sessionsMap,
			activeSessionPathValue,
			activeSessionCwd,
			setActiveSession,
			navigate,
			loadSessions,
			removePinnedSessions,
			t,
		],
	);

	const clearClaw = useCallback(
		(cwd: string) => {
			const imSessions = sessionsMap.get(imCwd) ?? [];
			setConfirm({
				title: t("sidebar.dialogs.clearClawTitle"),
				message: t("sidebar.dialogs.clearClawMessage", { count: imSessions.length }),
				confirmLabel: t("sidebar.dialogs.clearConfirm"),
				variant: "danger",
				onConfirm: async () => {
					await window.vetta.session.clearDefaultConversation("claw");
					const removedPaths = new Set(imSessions.map((session) => session.path));
					removePinnedSessions(removedPaths);
					if (removedPaths.has(activeSessionPathValue)) {
						setActiveSession(null);
						void navigate({
							to: "/new-session/$cwd",
							params: { cwd: encodeURIComponent(cwd) },
						});
					}
					if (imCwd) await loadSessions(imCwd);
				},
			});
		},
		[
			setConfirm,
			sessionsMap,
			imCwd,
			activeSessionPathValue,
			setActiveSession,
			navigate,
			loadSessions,
			removePinnedSessions,
			t,
		],
	);

	const activeProjectCandidates = useMemo(() => {
		if (!currentPath.startsWith("/project/")) return new Set<string>();
		const raw = currentPath.slice("/project/".length);
		if (!raw) return new Set<string>();
		const variants = new Set<string>([raw]);
		let value = raw;
		for (let i = 0; i < 3; i++) {
			try {
				const decoded = decodeURIComponent(value);
				if (decoded === value) break;
				variants.add(decoded);
				value = decoded;
			} catch {
				break;
			}
		}
		return variants;
	}, [currentPath]);

	const isProjectActive = useCallback((cwd: string) => activeProjectCandidates.has(cwd), [activeProjectCandidates]);

	const noOtherProjects = filteredProjects.length === 0 && (!showBatchGroup || batchAsProjects.length === 0);

	// 远程项目行的主机标签：整个面板共享一份主机清单，随主进程广播刷新。
	// 主机被删掉的项目归 OrphanRemoteProjectGuard 接管，这里只负责显示。
	const hasRemoteProjects = filteredProjects.some((project) => isSshProjectUri(project.cwd));
	const { hosts: sshHosts } = useSshHosts(hasRemoteProjects);
	const sshHostLabels = useMemo(() => new Map(sshHosts.map((host) => [host.id, host.label])), [sshHosts]);
	const remoteHostLabel = useCallback(
		(cwd: string) => {
			if (!isSshProjectUri(cwd)) return undefined;
			try {
				const location = parseProjectLocation(cwd);
				return location.kind === "ssh" ? sshHostLabels.get(location.hostId) : undefined;
			} catch {
				return undefined;
			}
		},
		[sshHostLabels],
	);

	useEffect(() => {
		if (defaultConversationSource === "claw" && imCwd) {
			void loadSessions(imCwd);
		}
	}, [defaultConversationSource, imCwd, loadSessions]);

	const ordinaryDefaultSessions = defaultSessionsCwd
		? (sessionsMap.get(defaultSessionsCwd) ?? EMPTY_SESSIONS)
		: EMPTY_SESSIONS;
	const defaultSessions = useMemo(
		() =>
			projectSidebarConversations(
				ordinaryDefaultSessions,
				defaultConversationSource === "conversation" ? teamSidebar.conversations : [],
				{ kind: "default" },
			),
		[defaultConversationSource, ordinaryDefaultSessions, teamSidebar.conversations],
	);
	const projectSidebarSessions = useMemo(() => {
		const result = new Map<string, SidebarConversationInfo[]>();
		for (const project of filteredProjects) {
			result.set(
				project.cwd,
				projectSidebarConversations(sessionsMap.get(project.cwd) ?? EMPTY_SESSIONS, teamSidebar.conversations, {
					kind: "project",
					projectPath: project.cwd,
				}),
			);
		}
		return result;
	}, [filteredProjects, sessionsMap, teamSidebar.conversations]);
	useEffect(() => {
		if (!activeTeamSessionId) return;
		for (const [cwd, sessions] of projectSidebarSessions) {
			if (
				!expandedProjects.has(cwd) &&
				sessions.some((session) => session.kind === "agent-team" && session.teamSessionId === activeTeamSessionId)
			) {
				expandProject(cwd);
				return;
			}
		}
	}, [activeTeamSessionId, expandProject, expandedProjects, projectSidebarSessions]);

	return {
		activeSessionPath,
		activeTeamSessionId,
		batchProjects: batchAsProjects,
		defaultConversationFilter,
		defaultProject,
		defaultSessions,
		defaultSessionsCwd: defaultSessionsCwd ?? "",
		defaultSessionsLoading:
			Boolean(
				defaultSessionsCwd && sessionLoadingCwds.has(defaultSessionsCwd) && !sessionsMap.has(defaultSessionsCwd),
			) ||
			(defaultConversationSource === "conversation" && teamSidebar.loading),
		expandedBatchProjects,
		expandedProjects,
		filteredProjects,
		imCwd,
		noOtherProjects,
		remoteHostLabel,
		projectSessions: (cwd) => projectSidebarSessions.get(cwd) ?? [],
		projectSessionsLoading: (cwd) => (sessionLoadingCwds.has(cwd) && !sessionsMap.has(cwd)) || teamSidebar.loading,
		projectsLoading: !projectsInitialized,
		showBatchGroup,
		actions: {
			archiveProject: (cwd) => {
				void archiveProject(cwd);
			},
			batchNewSession: newSession,
			clearClaw,
			clearConversation,
			collapseBatchProject,
			collapseProject,
			deleteProject: deletePanelProject,
			deleteSession: deletePanelSession,
			defaultNewSession,
			defaultSelectSession,
			expandBatchProject,
			expandProject,
			isProjectActive,
			navigateProject,
			openClawSettings: () => {
				void navigate({ to: "/settings/$tab", params: { tab: "im" } });
			},
			removeProject: removePanelProject,
			renameSession: renamePanelSession,
			selectBatchSession,
			selectSession: selectSidebarSession,
		},
	};
}
