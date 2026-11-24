// Modified by The Open Forge contributors.
import { HOST_PROTOCOL_ERROR_CODES, HostProtocolError } from "@vetta/host-protocol/client";
import type { SessionEvent } from "@vetta/runtime-core";
import type { IpcRenderer } from "electron";
import { decodeSessionEvent } from "../../shared/session-event-codec.js";
import {
	decodeSessionGlobalEvent,
	type RunningChangedEvent,
	type SessionGlobalEvent,
	type SessionsChangedEvent,
} from "../../shared/session-global-event-codec.js";
import type { DesktopApi } from "../api.js";
import type { DesktopSessionApi } from "../api-types/session.js";
import { createDesktopHostClient, type DesktopHostClient } from "../host-transport.js";
import { MAX_CONSECUTIVE_DECODE_FAILURES, onIpcEvent, subscribeById } from "./helper.js";
import { subscribeSessionSearch } from "./session-search.js";

const CHANNELS = {
	CREATE: "vetta:session:create",
	PROMPT: "vetta:session:prompt",
	INTERRUPT_HEALTH: "vetta:session:interrupt-health",
	INTERRUPTED_STARTUP: "vetta:session:interrupted-startup",
	AGENT_MODE_CHANGED: "vetta:session:agent-mode-changed",
	GET_STATE: "vetta:session:get-state",
	GET_MESSAGES: "vetta:session:get-messages",
	GET_FULL_HISTORY: "vetta:session:get-full-history",
	QUESTION_REQUEST: "vetta:session:question-request",
	QUESTION_RESOLVED: "vetta:session:question-resolved",
	PLAN_REVIEW_REQUEST: "vetta:session:plan-review-request",
	PLAN_REVIEW_RESOLVED: "vetta:session:plan-review-resolved",
	MCP_ELICITATION_REQUEST: "vetta:session:mcp-elicitation-request",
	MCP_ELICITATION_RESOLVED: "vetta:session:mcp-elicitation-resolved",
	MCP_ELICITATION_RESPONSE: "vetta:session:mcp-elicitation-response",
	MCP_TASKS_CHANGED: "vetta:session:mcp-tasks-changed",
	MCP_APP_SURFACE_GET: "vetta:session:mcp-app-surface-get",
	MCP_APP_CALL_TOOL: "vetta:session:mcp-app-call-tool",
	MCP_APP_READ_RESOURCE: "vetta:session:mcp-app-read-resource",
	MCP_APP_RELEASE: "vetta:session:mcp-app-release",
	SANDBOX_GRANT_REQUEST: "vetta:session:sandbox-grant-request",
	SANDBOX_GRANT_RESPONSE: "vetta:session:sandbox-grant-response",
	SANDBOX_GRANTS_LIST: "vetta:session:sandbox-grants-list",
	SANDBOX_GRANTS_REVOKE: "vetta:session:sandbox-grants-revoke",
	SANDBOX_GRANTS_REVOKE_ALL: "vetta:session:sandbox-grants-revoke-all",
	DISPOSE: "vetta:session:dispose",
	CLEAR_DEFAULT_CONVERSATION: "vetta:session:clear-default-conversation",
	CLEAR_DEFAULT_ARTIFACTS: "vetta:session:clear-default-artifacts",
	VIEWER_OPEN: "vetta:session:viewer-open",
	VIEWER_SUBSCRIBE: "vetta:session:viewer-subscribe",
	VIEWER_UNSUBSCRIBE: "vetta:session:viewer-unsubscribe",
	VIEWER_EVENT: "vetta:session:viewer-event",
} as const;

/**
 * 会话事件订阅（TASK-0477）：走 Host `session.subscribe`，事件帧经 MessagePort 推送；
 * 旧 IPC 三通道已删除，端口未就绪或注册前断开时显式失败，由调用方降级提示。
 * 端口回放先于响应帧到达，由 portHostEvents 的有界缓冲在注册时按序补发；解码容错与旧通道一致。
 */
async function subscribeSessionEvents(
	host: DesktopHostClient,
	sessionId: string,
	handler: (event: SessionEvent) => void,
): Promise<() => void> {
	if (!(await host.whenPortReady())) {
		throw new HostProtocolError(
			HOST_PROTOCOL_ERROR_CODES.CAPABILITY_UNAVAILABLE,
			"session.subscribe 需要 Host MessagePort，端口未建立或已关闭",
		);
	}

	const { subscriptionId } = await host.call("session.subscribe", { sessionId });

	let consecutiveDecodeFailures = 0;
	const deliver = (payload: unknown): void => {
		let event: SessionEvent;
		try {
			event = decodeSessionEvent(payload);
		} catch (error) {
			consecutiveDecodeFailures += 1;
			const stopTolerating = consecutiveDecodeFailures >= MAX_CONSECUTIVE_DECODE_FAILURES;
			console.error(
				stopTolerating
					? `[host] session.subscribe 连续 ${consecutiveDecodeFailures} 条载荷无法解码，视为协议不匹配`
					: "[host] 丢弃一条无法解码的 session.subscribe 载荷",
				error,
			);
			if (stopTolerating) throw error;
			return;
		}
		consecutiveDecodeFailures = 0;
		handler(event);
	};

	const removeHandler = host.onHostEvent(subscriptionId, deliver);
	if (!removeHandler) {
		// 响应返回前端口已断开：Host 端订阅已随连接清理，此处显式失败避免静默丢事件。
		throw new HostProtocolError(
			HOST_PROTOCOL_ERROR_CODES.HOST_UNAVAILABLE,
			"Host 端口在事件处理器注册前关闭，session.subscribe 订阅已失效",
		);
	}

	let removed = false;
	return () => {
		if (removed) return;
		removed = true;
		removeHandler();
		void host.call("session.unsubscribe", { subscriptionId }).catch(() => {
			// 端口已关闭时 Host 端订阅已随连接清理，无订阅可摘，取消失败不上抛。
		});
	};
}

/**
 * 进程级会话推送订阅（TASK-0479）：sessions-changed 与 running-changed 共用一条
 * `session.subscribeGlobal` 连接级订阅，首个监听者触发建立；窗口生命周期内不主动退订，
 * 避免订阅重建期间丢事件。payload 以 `kind` 分流到各监听集合，解码容错与旧通道一致。
 * 建立失败只记录一次并复位，后续监听注册可重试；端口关闭后重试必然失败，属于预期降级。
 */
function createSessionGlobalSubscription(
	host: DesktopHostClient,
): Pick<DesktopSessionApi, "onSessionsChanged" | "onRunningChanged"> {
	const sessionsChangedHandlers = new Set<(event: SessionsChangedEvent) => void>();
	const runningChangedHandlers = new Set<(event: RunningChangedEvent) => void>();
	// 两类事件共用一条端口事件流，解码失败按整体连续计数，协议异常时统一停止容忍。
	let consecutiveDecodeFailures = 0;
	let started = false;
	let starting = false;

	const deliver = (payload: unknown): void => {
		let event: SessionGlobalEvent;
		try {
			event = decodeSessionGlobalEvent(payload);
		} catch (error) {
			consecutiveDecodeFailures += 1;
			const stopTolerating = consecutiveDecodeFailures >= MAX_CONSECUTIVE_DECODE_FAILURES;
			console.error(
				stopTolerating
					? `[host] session.subscribeGlobal 连续 ${consecutiveDecodeFailures} 条载荷无法解码，视为协议不匹配`
					: "[host] 丢弃一条无法解码的 session.subscribeGlobal 载荷",
				error,
			);
			if (stopTolerating) throw error;
			return;
		}
		consecutiveDecodeFailures = 0;
		if (event.kind === "sessions-changed") {
			for (const handler of sessionsChangedHandlers) handler(event.event);
		} else {
			for (const handler of runningChangedHandlers) handler(event.event);
		}
	};

	const ensureStarted = (): void => {
		if (started || starting) return;
		starting = true;
		void (async () => {
			try {
				if (!(await host.whenPortReady())) {
					throw new HostProtocolError(
						HOST_PROTOCOL_ERROR_CODES.CAPABILITY_UNAVAILABLE,
						"session.subscribeGlobal 需要 Host MessagePort，端口未建立或已关闭",
					);
				}
				const { subscriptionId } = await host.call("session.subscribeGlobal", {});
				if (!host.onHostEvent(subscriptionId, deliver)) {
					throw new HostProtocolError(
						HOST_PROTOCOL_ERROR_CODES.HOST_UNAVAILABLE,
						"Host 端口在事件处理器注册前关闭，session.subscribeGlobal 订阅已失效",
					);
				}
				started = true;
			} catch (error) {
				console.error("[host] session.subscribeGlobal 订阅建立失败，后续监听注册时重试", error);
			} finally {
				starting = false;
			}
		})();
	};

	const subscribe = <T>(handlers: Set<(event: T) => void>, handler: (event: T) => void): (() => void) => {
		handlers.add(handler);
		ensureStarted();
		return () => {
			handlers.delete(handler);
		};
	};

	return {
		onSessionsChanged: (handler) => subscribe(sessionsChangedHandlers, handler),
		onRunningChanged: (handler) => subscribe(runningChangedHandlers, handler),
	};
}

export function createSessionApi(ipc: IpcRenderer): Pick<DesktopApi, "session"> {
	const host = createDesktopHostClient(ipc);
	const globalEvents = createSessionGlobalSubscription(host);
	return {
		session: {
			create: (config, kind, traceContext) => ipc.invoke(CHANNELS.CREATE, config, kind, traceContext),
			listProjects: () => host.call("session.listProjects", {}),
			listSessions: (cwd) => host.call("session.listSessions", { cwd }),
			searchSessions: (request, onEvent) => subscribeSessionSearch(ipc, request, onEvent),
			onSessionsChanged: (handler) => globalEvents.onSessionsChanged(handler),
			prompt: (sessionId, request, traceContext) => ipc.invoke(CHANNELS.PROMPT, sessionId, request, traceContext),
			continue: async (sessionId) => {
				await host.call("session.continue", { sessionId });
			},
			retry: async (sessionId) => {
				await host.call("session.retry", { sessionId });
			},
			abort: async (sessionId) => {
				await host.call("session.abort", { sessionId });
			},
			setInterruptDraftNonEmpty: async (sessionId, nonEmpty) => {
				await host.call("session.setInterruptDraftNonEmpty", { sessionId, nonEmpty });
			},
			onInterruptHealth: (handler) => onIpcEvent(ipc, CHANNELS.INTERRUPT_HEALTH, handler),
			onInterruptedStartup: (handler) => onIpcEvent(ipc, CHANNELS.INTERRUPTED_STARTUP, handler),
			getQueueState: (sessionId) => host.call("session.getQueueState", { sessionId }),
			queueContextCompaction: (sessionId) => host.call("session.queueContextCompaction", { sessionId }),
			removeQueuedMessage: (sessionId, itemId) => host.call("session.removeQueuedMessage", { sessionId, itemId }),
			reorderQueuedMessages: async (sessionId, itemIds) => {
				await host.call("session.reorderQueuedMessages", { sessionId, itemIds });
			},
			sendQueuedMessageNow: (sessionId, itemId) => host.call("session.sendQueuedMessageNow", { sessionId, itemId }),
			resumeQueue: async (sessionId) => {
				await host.call("session.resumeQueue", { sessionId });
			},
			clearQueue: async (sessionId) => {
				await host.call("session.clearQueue", { sessionId });
			},
			clearTodos: (sessionId) => host.call("session.clearTodos", { sessionId }),
			subscribe: (sessionId, handler) => subscribeSessionEvents(host, sessionId, handler),
			onQuestionRequest: (handler) => onIpcEvent(ipc, CHANNELS.QUESTION_REQUEST, handler),
			listPendingQuestions: () => host.call("session.listPendingQuestions", {}),
			onQuestionResolved: (handler) => onIpcEvent(ipc, CHANNELS.QUESTION_RESOLVED, handler),
			respondToQuestion: async (requestId, result) => {
				await host.call("session.respondToQuestion", { requestId, result });
			},
			getPlanModeState: (sessionId) => host.call("session.getPlanModeState", { sessionId }),
			setPermissionMode: (sessionId, permissionMode) =>
				host.call("session.setPlanModePermissionMode", { sessionId, permissionMode }),
			getGoalState: (sessionId) => host.call("session.getGoalState", { sessionId }),
			startGoal: (sessionId, objective) => host.call("session.startGoal", { sessionId, objective }),
			pauseGoal: (sessionId, goalId) => host.call("session.pauseGoal", { sessionId, goalId }),
			resumeGoal: (sessionId, goalId) => host.call("session.resumeGoal", { sessionId, goalId }),
			clearGoal: (sessionId, goalId) => host.call("session.clearGoal", { sessionId, goalId }),
			onPlanReviewRequest: (handler) => onIpcEvent(ipc, CHANNELS.PLAN_REVIEW_REQUEST, handler),
			listPendingPlanReviews: () => host.call("session.listPendingPlanReviews", {}),
			onPlanReviewResolved: (handler) => onIpcEvent(ipc, CHANNELS.PLAN_REVIEW_RESOLVED, handler),
			respondToPlanReview: async (requestId, result) => {
				await host.call("session.respondToPlanReview", { requestId, result });
			},
			onMcpElicitationRequest: (handler) => onIpcEvent(ipc, CHANNELS.MCP_ELICITATION_REQUEST, handler),
			listPendingMcpElicitations: () => host.call("session.mcpElicitationListPending", {}),
			onMcpElicitationResolved: (handler) => onIpcEvent(ipc, CHANNELS.MCP_ELICITATION_RESOLVED, handler),
			respondToMcpElicitation: (requestId, result) =>
				ipc.invoke(CHANNELS.MCP_ELICITATION_RESPONSE, requestId, result),
			onMcpTasksChanged: (handler) => onIpcEvent(ipc, CHANNELS.MCP_TASKS_CHANGED, handler),
			listMcpTasks: (sessionId) => host.call("session.mcpTasksList", sessionId ? { sessionId } : {}),
			cancelMcpTask: (id) => host.call("session.mcpTasksCancel", { id }),
			clearFinishedMcpTasks: (sessionId) => host.call("session.mcpTasksClearFinished", { sessionId }),
			getMcpAppSurface: (id) => ipc.invoke(CHANNELS.MCP_APP_SURFACE_GET, id),
			callMcpAppTool: (request) => ipc.invoke(CHANNELS.MCP_APP_CALL_TOOL, request),
			readMcpAppResource: (request) => ipc.invoke(CHANNELS.MCP_APP_READ_RESOURCE, request),
			releaseMcpAppSurface: (id) => ipc.invoke(CHANNELS.MCP_APP_RELEASE, id),
			onSandboxGrantRequest: (handler) => onIpcEvent(ipc, CHANNELS.SANDBOX_GRANT_REQUEST, handler),
			respondToSandboxGrant: (requestId, decision) =>
				ipc.invoke(CHANNELS.SANDBOX_GRANT_RESPONSE, requestId, decision),
			listSandboxGrants: (sessionId) => ipc.invoke(CHANNELS.SANDBOX_GRANTS_LIST, sessionId),
			revokeSandboxGrant: (sessionId, grantId) => ipc.invoke(CHANNELS.SANDBOX_GRANTS_REVOKE, sessionId, grantId),
			revokeAllSandboxGrants: (sessionId) => ipc.invoke(CHANNELS.SANDBOX_GRANTS_REVOKE_ALL, sessionId),
			clearFinishedBackgroundTasks: (sessionId) => host.call("session.clearFinishedBackgroundTasks", { sessionId }),
			killBackgroundTask: (sessionId, taskId) => host.call("session.killBackgroundTask", { sessionId, taskId }),
			interruptSubagent: (sessionId, target) => host.call("session.interruptSubagent", { sessionId, target }),
			getSessionPath: async (sessionId) => (await host.call("session.getSessionPath", { sessionId })) ?? undefined,
			updateSettings: async (sessionId, partialSettings) => {
				await host.call("session.updateSettings", { sessionId, patch: partialSettings });
			},
			setExecutionMode: async (sessionId, mode) => {
				await host.call("session.setExecutionMode", { sessionId, mode });
			},
			setGlobalExecutionMode: async (mode) => {
				await host.call("session.setGlobalExecutionMode", { mode });
			},
			setGlobalAgentMode: async (mode) => {
				await host.call("session.setGlobalAgentMode", { mode });
			},
			onAgentModeChanged: (handler) => onIpcEvent(ipc, CHANNELS.AGENT_MODE_CHANGED, handler),
			setGlobalThinkingLevel: async (level) => {
				await host.call("session.setGlobalThinkingLevel", { level });
			},
			getGlobalThinkingLevel: () => host.call("session.getThinkingLevel", {}),
			getPersonas: () => host.call("session.getPersonas", {}),
			getAgentModes: () => host.call("session.getAgentModes", {}),
			getPersonalization: () => host.call("session.getPersonalization", {}),
			setPersonalization: async (input) => {
				await host.call("session.setPersonalization", input);
			},
			getState: (sessionId) => ipc.invoke(CHANNELS.GET_STATE, sessionId),
			getMessages: (sessionId) => ipc.invoke(CHANNELS.GET_MESSAGES, sessionId),
			getFullHistory: ((sessionId: string, options?: unknown) =>
				options === undefined
					? ipc.invoke(CHANNELS.GET_FULL_HISTORY, sessionId)
					: ipc.invoke(CHANNELS.GET_FULL_HISTORY, sessionId, options)) as DesktopSessionApi["getFullHistory"],
			navigateForEdit: (sessionId, entryId) => host.call("session.navigateForEdit", { sessionId, entryId }),
			switchBranch: (sessionId, entryId) => host.call("session.switchBranch", { sessionId, entryId }),
			deleteMessage: (sessionId, entryId) => host.call("session.deleteMessage", { sessionId, entryId }),
			replaceLastUserMessage: (sessionId, entryId) =>
				host.call("session.replaceLastUserMessage", { sessionId, entryId }),
			forkSession: (sessionId, entryId) => host.call("session.forkSession", { sessionId, entryId }),
			delete: async (sessionPath) => {
				await host.call("session.delete", { sessionPath });
			},
			deleteAllForCwd: (cwd) => host.call("session.deleteAllForCwd", { cwd }),
			rename: async (sessionPath, name) => {
				await host.call("session.rename", { sessionPath, name });
			},
			autoTitle: (sessionId, userText, assistantText) =>
				host.call("session.autoTitle", { sessionId, userText, assistantText }),
			nextPromptSuggestions: (sessionId, conversation) =>
				host.call("session.nextPromptSuggestions", { sessionId, conversation }),
			dispose: (sessionId) => ipc.invoke(CHANNELS.DISPOSE, sessionId),
			listRunning: () => host.call("session.listRunning", {}),
			listRunningCwds: () => host.call("session.listRunningCwds", {}),
			onRunningChanged: (handler) => globalEvents.onRunningChanged(handler),
			clearDefaultConversation: (scope) => ipc.invoke(CHANNELS.CLEAR_DEFAULT_CONVERSATION, scope),
			clearDefaultArtifacts: (scope) => ipc.invoke(CHANNELS.CLEAR_DEFAULT_ARTIFACTS, scope),
			openViewer: ((path: string, options?: unknown) =>
				options === undefined
					? ipc.invoke(CHANNELS.VIEWER_OPEN, path)
					: ipc.invoke(CHANNELS.VIEWER_OPEN, path, options)) as DesktopSessionApi["openViewer"],
			subscribeViewer: (path, handler) =>
				subscribeById(ipc, CHANNELS.VIEWER_SUBSCRIBE, CHANNELS.VIEWER_EVENT, CHANNELS.VIEWER_UNSUBSCRIBE, handler, [
					path,
				]),
		},
	};
}
