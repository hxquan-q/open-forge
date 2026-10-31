import type {
	DesktopMcpElicitationRequest,
	DesktopMcpTask,
	DesktopMcpTasksChangedEvent,
	DesktopUserQuestionRequest,
} from "@preload/api";
import { useMatches, useNavigate } from "@tanstack/react-router";
import type { CodingAgentPlanReviewRequest } from "@vetta/coding-agent/function-extensions";
import { getDefaultStore, useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { BROWSER_ELEMENT_PICKER_TOGGLE_EVENT } from "@/shared/browser-tab-ipc";
import { FILE_EDITOR_SAVE_EVENT } from "@/shared/shortcuts";
import { loadNewSessionPage } from "../domains/conversation/components/loadNewSessionPage";
import { useAppInit } from "../domains/conversation/hooks/useAppInit";
import { useSessionManager } from "../domains/conversation/hooks/useSessionManager";
import { useDesktopNotificationSound } from "../domains/message/hooks/useDesktopNotificationSound";
import { useNotificationInit } from "../domains/message/hooks/useNotificationInit";
import { useProjectActions } from "../domains/project/hooks/useProjects";
import { useModelCatalogSync } from "../shared/hooks/useModelCatalogSync";
import { useNarrowScreen } from "../shared/hooks/useNarrowScreen";
import { useRunningSessionsSync } from "../shared/hooks/useRunningSessionsSync";
import { useGlobalShortcuts } from "../shared/hooks/useShortcuts";
import { useUpdaterInit } from "../shared/hooks/useUpdaterInit";
import { i18n } from "../shared/i18n";
import {
	activeSessionAtom,
	appshotAttachmentAtom,
	commandMenuOpenAtom,
	defaultConversationCwdAtom,
	fileEditorHasUnsavedChangesAtom,
	focusInputRequestAtom,
	groupMcpTasksBySession,
	lastActiveSessionAtom,
	mcpTasksBySessionAtom,
	pendingMcpElicitationsAtom,
	pendingPlanReviewsAtom,
	pendingQuestionsAtom,
	pendingSessionCreationAtom,
	pendingSessionOpenAtom,
	projectsAtom,
	sandboxPermissionDrawerAtom,
	scheduledSessionPathsAtom,
	sidebarCollapsedAtom,
	sidebarWidthAtom,
} from "../shared/store/atoms";
import { showToast } from "../shared/store/toast-atoms";
import { shouldShowChatRoutePending } from "./chat-route-pending";
import { syncPendingInteractions } from "./pending-interaction-sync";
import type { RootLayoutModel } from "./types";
import { useCodingSessionLayout } from "./useCodingSessionLayout";
import { useLastSessionRestore } from "./useLastSessionRestore";

export function useRootLayoutModel(): RootLayoutModel {
	const { openProject, ensureLocalSession } = useProjectActions();
	const projects = useAtomValue(projectsAtom);
	const navigate = useNavigate();
	const setSandboxPermissionDrawer = useSetAtom(sandboxPermissionDrawerAtom);
	const setCommandMenuOpen = useSetAtom(commandMenuOpenAtom);
	const defaultConversationCwd = useAtomValue(defaultConversationCwdAtom);
	const activeSession = useAtomValue(activeSessionAtom);
	const pendingSessionCreation = useAtomValue(pendingSessionCreationAtom);
	const pendingSessionOpen = useAtomValue(pendingSessionOpenAtom);
	const lastActiveSession = useAtomValue(lastActiveSessionAtom);
	const matchesForGuard = useMatches();
	const currentPath = matchesForGuard[matchesForGuard.length - 1]?.pathname ?? "/";
	const [sidebarCollapsed, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom);
	// 左栏占位宽度与侧边栏面板读同一个 atom（拖拽改宽时逐帧同步），见 SidebarDock。
	const sidebarWidth = useAtomValue(sidebarWidthAtom);
	const hasUnsavedFileChanges = useAtomValue(fileEditorHasUnsavedChangesAtom);
	const toggleSidebar = useCallback(() => {
		setSidebarCollapsed((v) => !v);
	}, [setSidebarCollapsed]);

	// 响应式侧边栏：窄屏时不挤压布局，改为悬浮浮层（hover 唤出，移出即隐藏）。
	const narrow = useNarrowScreen();
	const [overlayOpen, setOverlayOpen] = useState(false);
	const overlayCloseTimerRef = useRef<number | null>(null);
	const cancelOverlayClose = useCallback(() => {
		if (overlayCloseTimerRef.current != null) {
			window.clearTimeout(overlayCloseTimerRef.current);
			overlayCloseTimerRef.current = null;
		}
	}, []);
	const openOverlay = useCallback(() => {
		cancelOverlayClose();
		setOverlayOpen(true);
	}, [cancelOverlayClose]);
	const closeOverlay = useCallback(() => {
		cancelOverlayClose();
		setOverlayOpen(false);
	}, [cancelOverlayClose]);
	// 触发按钮 → 浮层之间留出短暂宽限，避免指针经过间隙时闪烁。
	const scheduleOverlayClose = useCallback(() => {
		cancelOverlayClose();
		overlayCloseTimerRef.current = window.setTimeout(() => setOverlayOpen(false), 120);
	}, [cancelOverlayClose]);
	// 退出窄屏时复位浮层状态。
	useEffect(() => {
		if (!narrow) {
			cancelOverlayClose();
			setOverlayOpen(false);
		}
	}, [narrow, cancelOverlayClose]);

	// 云会话生命周期已上移到 App 根部的 <CloudAuthBoot />（lite 构建不挂载）
	useAppInit();
	useNotificationInit();
	useDesktopNotificationSound();
	useUpdaterInit();
	// 演示定稿：code 模式会话自动收左栏、开右栏；切回普通会话展开左栏（档位边沿生效）。
	useCodingSessionLayout();
	// 模型目录保鲜：focus / 切回可见时按 TTL 重拉，服务端增删模型无需重启应用。
	useModelCatalogSync();
	// 全局 running-sessions 订阅必须挂在始终挂载的 App 上：它是 streaming 状态真值
	// 来源之一，挂在会被卸载的 Sidebar 上会在卸载期间丢 RUNNING_CHANGED 事件。
	useRunningSessionsSync();
	// 队列的出队/续发已收归主进程 kernel（ADR-0060）：followUp 在 turn 自然停止点
	// 接力消费，renderer 不再需要全局出队调度器。
	// 会话打开/发送的唯一挂载点。ChatPage 与新会话页走模块级 ref，避免再挂一份。
	const { openSession, sendMessage } = useSessionManager();
	const sessionRestoreState = useLastSessionRestore(currentPath);

	useEffect(() => {
		if (!hasUnsavedFileChanges) return;
		const preventClose = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = "";
		};
		window.addEventListener("beforeunload", preventClose);
		return () => window.removeEventListener("beforeunload", preventClose);
	}, [hasUnsavedFileChanges]);

	// 没有待恢复会话时提前加载 NewSession 路由代码；侧栏项目/会话列表可继续独立加载。
	// 页面本身仍等路由守卫确认后再挂载，避免其初始化 effect 清除待恢复记录。
	useEffect(() => {
		if (currentPath !== "/" || activeSession || pendingSessionCreation || pendingSessionOpen || lastActiveSession)
			return;
		void loadNewSessionPage().catch((error: unknown) => {
			console.warn("[RootLayout] preload new session page failed", error);
		});
	}, [currentPath, activeSession, pendingSessionCreation, pendingSessionOpen, lastActiveSession]);

	// 路由守卫：仅在确认没有可恢复会话后，才跳到默认「对话」项目的 NewSession 页。
	useEffect(() => {
		if (
			currentPath !== "/" ||
			activeSession ||
			pendingSessionCreation ||
			pendingSessionOpen ||
			!defaultConversationCwd ||
			sessionRestoreState !== "complete"
		) {
			return;
		}
		void navigate({
			to: "/new-session/$cwd",
			params: { cwd: encodeURIComponent(defaultConversationCwd) },
		});
	}, [
		currentPath,
		activeSession,
		pendingSessionCreation,
		pendingSessionOpen,
		defaultConversationCwd,
		sessionRestoreState,
		navigate,
	]);

	// 上报「聊天页当前所在 session」给主进程：仅在聊天路由 "/" 且有 activeSession
	// 时报其 sessionPath，否则 null。主进程据此 + 窗口聚焦态做系统通知抑制判定。
	useEffect(() => {
		const sessionPath = currentPath === "/" ? activeSession?.sessionPath || null : null;
		void window.vetta.notification.setForegroundSession(sessionPath);
	}, [currentPath, activeSession]);

	// 点击系统通知 → 主进程已前台化窗口，这里把对应 session 打开并路由到聊天页。
	useEffect(() => {
		return window.vetta.notification.onNavigate((payload) => {
			if (payload.type === "agent-turn-complete" || payload.type === "agent-question-pending") {
				void openSession(payload.cwd, payload.sessionPath);
			}
		});
	}, [openSession]);

	// 快捷面板回车 → 主进程已据 postSendBehavior 处理窗口聚焦，这里在默认「对话」目录下
	// 新建会话并直接发送 prompt（复用通知路由同款 openSession + sendMessage）。
	useEffect(() => {
		return window.vetta.quickPanel.onRunPrompt(({ text }) => {
			const cwd = defaultConversationCwd;
			if (!cwd || !text.trim()) return;
			void (async () => {
				try {
					await openSession(cwd);
					await sendMessage(text);
				} catch (error) {
					console.warn("[RootLayout] quick panel run prompt failed", error);
				}
			})();
		});
	}, [openSession, sendMessage, defaultConversationCwd]);

	useEffect(() => {
		const store = getDefaultStore();
		const unsubCaptured = window.vetta.appshot.onCaptured((payload) => {
			store.set(appshotAttachmentAtom, {
				id: payload.id,
				appName: payload.appName,
				windowTitle: payload.windowTitle,
				documentPath: payload.documentPath,
				imagePath: payload.imagePath,
				iconPath: payload.iconPath,
				textPath: payload.textPath,
				capturedAt: payload.capturedAt,
			});
			if (currentPath !== "/" && !currentPath.startsWith("/new-session") && defaultConversationCwd) {
				void navigate({
					to: "/new-session/$cwd",
					params: { cwd: encodeURIComponent(defaultConversationCwd) },
				});
			}
			store.set(focusInputRequestAtom, (previous) => previous + 1);
		});
		const unsubCaptureError = window.vetta.appshot.onCaptureError((payload) => {
			const message =
				payload.reason === "self-capture"
					? i18n.t("chat:appshot.errorSelfCapture")
					: payload.reason === "no-permission"
						? i18n.t("chat:appshot.errorNoPermission")
						: i18n.t("chat:appshot.errorHelperFailed");
			showToast({ variant: "warning", message });
		});
		const unsubInterruptHealth = window.vetta.session.onInterruptHealth((payload) => {
			if (payload.action === "auto-retried") {
				showToast({
					variant: "success",
					title: i18n.t("chat:sessionInterrupt.autoRetriedTitle"),
					message: i18n.t("chat:sessionInterrupt.autoRetriedBody"),
				});
				return;
			}
			// 失败提醒指明原因（网络中断 / 回复截断 / 上游错误），并能一键跳到该会话。
			const reasonKey = payload.trigger ?? "indeterminate";
			const canOpen = Boolean(payload.cwd && payload.sessionPath);
			showToast({
				variant: "warning",
				title: i18n.t("chat:sessionInterrupt.notifyTitle"),
				message: i18n.t(`chat:sessionInterrupt.reason.${reasonKey}`, {
					defaultValue: i18n.t("chat:sessionInterrupt.notifyBody"),
				}),
				durationMs: 10_000,
				action: canOpen
					? {
							label: i18n.t("chat:sessionInterrupt.openSession"),
							onClick: () => void openSession(payload.cwd as string, payload.sessionPath),
						}
					: undefined,
			});
		});
		// 启动一次性扫描：上次退出时回复未正常完成的会话，提醒并可一键打开。
		const unsubInterruptedStartup = window.vetta.session.onInterruptedStartup((payload) => {
			const first = payload.sessions[0];
			if (!first) return;
			showToast({
				variant: "warning",
				title: i18n.t("chat:sessionInterrupt.startupTitle"),
				message: i18n.t("chat:sessionInterrupt.startupBody", { count: payload.sessions.length }),
				durationMs: 12_000,
				action: {
					label: i18n.t("chat:sessionInterrupt.openSession"),
					onClick: () => void openSession(first.cwd, first.sessionPath),
				},
			});
		});
		return () => {
			unsubCaptured();
			unsubCaptureError();
			unsubInterruptHealth();
			unsubInterruptedStartup();
		};
	}, [currentPath, defaultConversationCwd, navigate, openSession]);

	// 主进程持有「等待用户处理」的真相源；三类请求共用同一套订阅 + 快照收敛。
	const setPendingQuestions = useSetAtom(pendingQuestionsAtom);
	useEffect(
		() =>
			syncPendingInteractions<DesktopUserQuestionRequest>(
				{
					onRequest: (handler) => window.vetta.session.onQuestionRequest(handler),
					onResolved: (handler) => window.vetta.session.onQuestionResolved(handler),
					listPending: () => window.vetta.session.listPendingQuestions(),
				},
				setPendingQuestions,
				(error) => console.warn("[RootLayout] sync pending questions failed", error),
			),
		[setPendingQuestions],
	);

	const setPendingMcpElicitations = useSetAtom(pendingMcpElicitationsAtom);
	useEffect(
		() =>
			syncPendingInteractions<DesktopMcpElicitationRequest>(
				{
					onRequest: (handler) => window.vetta.session.onMcpElicitationRequest(handler),
					onResolved: (handler) => window.vetta.session.onMcpElicitationResolved(handler),
					listPending: () => window.vetta.session.listPendingMcpElicitations(),
				},
				setPendingMcpElicitations,
				(error) => console.warn("[RootLayout] sync pending MCP elicitations failed", error),
			),
		[setPendingMcpElicitations],
	);

	const setPendingPlanReviews = useSetAtom(pendingPlanReviewsAtom);
	useEffect(
		() =>
			syncPendingInteractions<CodingAgentPlanReviewRequest>(
				{
					onRequest: (handler) => window.vetta.session.onPlanReviewRequest(handler),
					onResolved: (handler) => window.vetta.session.onPlanReviewResolved(handler),
					listPending: () => window.vetta.session.listPendingPlanReviews(),
				},
				setPendingPlanReviews,
				(error) => console.warn("[RootLayout] sync pending plan reviews failed", error),
			),
		[setPendingPlanReviews],
	);

	const setMcpTasks = useSetAtom(mcpTasksBySessionAtom);
	useEffect(() => {
		let active = true;
		let latest: readonly DesktopMcpTask[] | undefined;
		const apply = (tasks: readonly DesktopMcpTask[]): void => {
			latest = tasks;
			setMcpTasks(groupMcpTasksBySession(tasks));
		};
		const unsubscribe = window.vetta.session.onMcpTasksChanged((event: DesktopMcpTasksChangedEvent) => {
			if (active) apply(event.tasks);
		});
		void window.vetta.session
			.listMcpTasks()
			.then((snapshot) => {
				if (active && latest === undefined) apply(snapshot);
			})
			.catch((error: unknown) => console.warn("[RootLayout] sync MCP tasks failed", error));
		return () => {
			active = false;
			unsubscribe();
		};
	}, [setMcpTasks]);

	const grantQueueRef = useRef<Parameters<Parameters<typeof window.vetta.session.onSandboxGrantRequest>[0]>[0][]>([]);
	const grantActiveRef = useRef(false);

	useEffect(() => {
		const showGrant = (request: Parameters<Parameters<typeof window.vetta.session.onSandboxGrantRequest>[0]>[0]) => {
			grantActiveRef.current = true;
			const showNext = () => {
				const nextRequest = grantQueueRef.current.shift();
				if (nextRequest) {
					showGrant(nextRequest);
				} else {
					grantActiveRef.current = false;
				}
			};
			setSandboxPermissionDrawer({
				requestId: request.requestId,
				runtimeId: request.sessionId,
				title: request.title,
				message: request.message,
				sensitive: request.sensitive,
				onConfirm: () => {
					void window.vetta.session.respondToSandboxGrant(request.requestId, "allow_once");
					setSandboxPermissionDrawer(null);
					showNext();
				},
				onCancel: () => {
					void window.vetta.session.respondToSandboxGrant(request.requestId, "deny");
					setSandboxPermissionDrawer(null);
					showNext();
				},
				onAllowSession: request.sensitive
					? undefined
					: () => {
							void window.vetta.session.respondToSandboxGrant(request.requestId, "allow_session");
							setSandboxPermissionDrawer(null);
							showNext();
						},
			});
		};
		return window.vetta.session.onSandboxGrantRequest((request) => {
			if (grantActiveRef.current) {
				grantQueueRef.current.push(request);
				return;
			}
			showGrant(request);
		});
	}, [setSandboxPermissionDrawer]);

	// 调度任务（自动化）"立即执行"时，session 在 main 进程已经建好，但 JSONL
	// 要等 assistant 首个回复才落盘。这里订阅 task.started，乐观地把 session
	// 插入 sidebar，避免必须等 agent 跑完才出现的延迟。
	const setScheduledSessionPaths = useSetAtom(scheduledSessionPathsAtom);
	useEffect(() => {
		// 启动时拉取已有定时 session 路径，供侧栏识别并挂图标。
		void window.vetta.scheduler.getScheduledSessionPaths().then((paths) => {
			setScheduledSessionPaths(new Set(paths));
		});
		return window.vetta.scheduler.onTaskEvent((event) => {
			if (event.type !== "task.started") return;
			if (!event.sessionPath || !event.cwd) return;
			setScheduledSessionPaths((prev) => new Set(prev).add(event.sessionPath));
			ensureLocalSession(event.cwd, {
				id: event.sessionId,
				path: event.sessionPath,
				cwd: event.cwd,
				name: event.sessionName,
				firstMessage: event.firstMessage,
				modifiedAt: Date.now(),
			});
		});
	}, [ensureLocalSession, setScheduledSessionPaths]);

	// ─── Global keyboard shortcuts ───
	const projectsRef = useRef(projects);
	projectsRef.current = projects;

	const defaultCwdRef = useRef(defaultConversationCwd);
	defaultCwdRef.current = defaultConversationCwd;

	useGlobalShortcuts(
		useCallback(
			(actionId: string) => {
				switch (actionId) {
					case "new-session": {
						// 默认走「对话」项目的 NewSession 页面；若主进程尚未返回 cwd，退回第一个项目。
						const target = defaultCwdRef.current || projectsRef.current[0]?.cwd;
						if (target) {
							void navigate({
								to: "/new-session/$cwd",
								params: { cwd: encodeURIComponent(target) },
							});
						}
						break;
					}
					case "open-project": {
						void openProject();
						break;
					}
					case "open-settings": {
						void navigate({ to: "/settings/$tab", params: { tab: "account" } });
						break;
					}
					case "open-command-menu": {
						// 面板内自己绑了一条 mod+k 关闭；能走到这里说明面板是关着的。
						setCommandMenuOpen(true);
						break;
					}
					case "save-file": {
						window.dispatchEvent(new Event(FILE_EDITOR_SAVE_EVENT));
						break;
					}
					case "browser-element-picker": {
						window.dispatchEvent(new Event(BROWSER_ELEMENT_PICKER_TOGGLE_EVENT));
						break;
					}
				}
			},
			[openProject, navigate, setCommandMenuOpen],
		),
	);

	return {
		actions: {
			closeOverlay,
			openOverlay,
			scheduleOverlayClose,
			toggleSidebar,
		},
		narrow,
		onOpenSession: openSession,
		overlayOpen,
		routePending: shouldShowChatRoutePending({
			hasActiveSession: Boolean(activeSession),
			hasDefaultConversation: Boolean(defaultConversationCwd),
			hasPendingSessionCreation: Boolean(pendingSessionCreation),
			hasPendingSessionOpen: Boolean(pendingSessionOpen),
			isChatRoute: currentPath === "/",
			sessionRestoreComplete: sessionRestoreState === "complete",
		}),
		sidebarCollapsed,
		sidebarWidth,
	};
}
