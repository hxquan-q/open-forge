import type { IpcRenderer } from "electron";
import { decodeSessionEvent } from "../../shared/session-event-codec.js";
import type { DesktopApi } from "../api.js";
import type { DesktopSessionApi } from "../api-types/session.js";
import { createDesktopHostClient } from "../host-transport.js";
import { onIpcEvent, subscribeById } from "./helper.js";
import { subscribeSessionSearch } from "./session-search.js";

const CHANNELS = {
	CREATE: "vetta:session:create",
	SESSIONS_CHANGED: "vetta:session:sessions-changed",
	PROMPT: "vetta:session:prompt",
	CONTINUE: "vetta:session:continue",
	ABORT: "vetta:session:abort",
	INTERRUPT_HEALTH: "vetta:session:interrupt-health",
	INTERRUPTED_STARTUP: "vetta:session:interrupted-startup",
	SUBSCRIBE: "vetta:session:subscribe",
	UNSUBSCRIBE: "vetta:session:unsubscribe",
	AGENT_MODE_CHANGED: "vetta:session:agent-mode-changed",
	GET_STATE: "vetta:session:get-state",
	GET_MESSAGES: "vetta:session:get-messages",
	GET_FULL_HISTORY: "vetta:session:get-full-history",
	QUESTION_REQUEST: "vetta:session:question-request",
	QUESTION_LIST_PENDING: "vetta:session:question-list-pending",
	QUESTION_RESOLVED: "vetta:session:question-resolved",
	QUESTION_RESPONSE: "vetta:session:question-response",

	PLAN_REVIEW_REQUEST: "vetta:session:plan-review-request",
	PLAN_REVIEW_LIST_PENDING: "vetta:session:plan-review-list-pending",
	PLAN_REVIEW_RESOLVED: "vetta:session:plan-review-resolved",
	PLAN_REVIEW_RESPONSE: "vetta:session:plan-review-response",
	MCP_ELICITATION_REQUEST: "vetta:session:mcp-elicitation-request",
	MCP_ELICITATION_LIST_PENDING: "vetta:session:mcp-elicitation-list-pending",
	MCP_ELICITATION_RESOLVED: "vetta:session:mcp-elicitation-resolved",
	MCP_ELICITATION_RESPONSE: "vetta:session:mcp-elicitation-response",
	MCP_TASKS_CHANGED: "vetta:session:mcp-tasks-changed",
	MCP_TASKS_LIST: "vetta:session:mcp-tasks-list",
	MCP_TASKS_CANCEL: "vetta:session:mcp-tasks-cancel",
	MCP_TASKS_CLEAR_FINISHED: "vetta:session:mcp-tasks-clear-finished",
	MCP_APP_SURFACE_GET: "vetta:session:mcp-app-surface-get",
	MCP_APP_CALL_TOOL: "vetta:session:mcp-app-call-tool",
	MCP_APP_READ_RESOURCE: "vetta:session:mcp-app-read-resource",
	MCP_APP_RELEASE: "vetta:session:mcp-app-release",
	SANDBOX_GRANT_REQUEST: "vetta:session:sandbox-grant-request",
	SANDBOX_GRANT_RESPONSE: "vetta:session:sandbox-grant-response",
	SANDBOX_GRANTS_LIST: "vetta:session:sandbox-grants-list",
	SANDBOX_GRANTS_REVOKE: "vetta:session:sandbox-grants-revoke",
	SANDBOX_GRANTS_REVOKE_ALL: "vetta:session:sandbox-grants-revoke-all",
	DELETE: "vetta:session:delete",
	DELETE_ALL_FOR_CWD: "vetta:session:delete-all-for-cwd",
	DISPOSE: "vetta:session:dispose",
	EVENT: "vetta:session:event",
	RUNNING_CHANGED: "vetta:session:running-changed",
	CLEAR_DEFAULT_CONVERSATION: "vetta:session:clear-default-conversation",
	CLEAR_DEFAULT_ARTIFACTS: "vetta:session:clear-default-artifacts",
	VIEWER_OPEN: "vetta:session:viewer-open",
	VIEWER_SUBSCRIBE: "vetta:session:viewer-subscribe",
	VIEWER_UNSUBSCRIBE: "vetta:session:viewer-unsubscribe",
	VIEWER_EVENT: "vetta:session:viewer-event",
} as const;

export function createSessionApi(ipc: IpcRenderer): Pick<DesktopApi, "session"> {
	const host = createDesktopHostClient(ipc);
	return {
		session: {
			create: (config, kind, traceContext) => ipc.invoke(CHANNELS.CREATE, config, kind, traceContext),
			listProjects: () => host.call("session.listProjects", {}),
			listSessions: (cwd) => host.call("session.listSessions", { cwd }),
			searchSessions: (request, onEvent) => subscribeSessionSearch(ipc, request, onEvent),
			onSessionsChanged: (handler) => onIpcEvent(ipc, CHANNELS.SESSIONS_CHANGED, handler),
			prompt: (sessionId, request, traceContext) => ipc.invoke(CHANNELS.PROMPT, sessionId, request, traceContext),
			continue: (sessionId) => ipc.invoke(CHANNELS.CONTINUE, sessionId),
			retry: async (sessionId) => {
				await host.call("session.retry", { sessionId });
			},
			abort: (sessionId) => ipc.invoke(CHANNELS.ABORT, sessionId),
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
			subscribe: (sessionId, handler) =>
				subscribeById(
					ipc,
					CHANNELS.SUBSCRIBE,
					CHANNELS.EVENT,
					CHANNELS.UNSUBSCRIBE,
					handler,
					[sessionId],
					decodeSessionEvent,
				),
			onQuestionRequest: (handler) => onIpcEvent(ipc, CHANNELS.QUESTION_REQUEST, handler),
			listPendingQuestions: () => ipc.invoke(CHANNELS.QUESTION_LIST_PENDING),
			onQuestionResolved: (handler) => onIpcEvent(ipc, CHANNELS.QUESTION_RESOLVED, handler),
			respondToQuestion: (requestId, result) => ipc.invoke(CHANNELS.QUESTION_RESPONSE, requestId, result),
			getPlanModeState: (sessionId) => host.call("session.getPlanModeState", { sessionId }),
			setPermissionMode: (sessionId, permissionMode) =>
				host.call("session.setPlanModePermissionMode", { sessionId, permissionMode }),
			getGoalState: (sessionId) => host.call("session.getGoalState", { sessionId }),
			startGoal: (sessionId, objective) => host.call("session.startGoal", { sessionId, objective }),
			pauseGoal: (sessionId, goalId) => host.call("session.pauseGoal", { sessionId, goalId }),
			resumeGoal: (sessionId, goalId) => host.call("session.resumeGoal", { sessionId, goalId }),
			clearGoal: (sessionId, goalId) => host.call("session.clearGoal", { sessionId, goalId }),
			onPlanReviewRequest: (handler) => onIpcEvent(ipc, CHANNELS.PLAN_REVIEW_REQUEST, handler),
			listPendingPlanReviews: () => ipc.invoke(CHANNELS.PLAN_REVIEW_LIST_PENDING),
			onPlanReviewResolved: (handler) => onIpcEvent(ipc, CHANNELS.PLAN_REVIEW_RESOLVED, handler),
			respondToPlanReview: (requestId, result) => ipc.invoke(CHANNELS.PLAN_REVIEW_RESPONSE, requestId, result),
			onMcpElicitationRequest: (handler) => onIpcEvent(ipc, CHANNELS.MCP_ELICITATION_REQUEST, handler),
			listPendingMcpElicitations: () => ipc.invoke(CHANNELS.MCP_ELICITATION_LIST_PENDING),
			onMcpElicitationResolved: (handler) => onIpcEvent(ipc, CHANNELS.MCP_ELICITATION_RESOLVED, handler),
			respondToMcpElicitation: (requestId, result) =>
				ipc.invoke(CHANNELS.MCP_ELICITATION_RESPONSE, requestId, result),
			onMcpTasksChanged: (handler) => onIpcEvent(ipc, CHANNELS.MCP_TASKS_CHANGED, handler),
			listMcpTasks: (sessionId) => ipc.invoke(CHANNELS.MCP_TASKS_LIST, sessionId),
			cancelMcpTask: (id) => ipc.invoke(CHANNELS.MCP_TASKS_CANCEL, id),
			clearFinishedMcpTasks: (sessionId) => ipc.invoke(CHANNELS.MCP_TASKS_CLEAR_FINISHED, sessionId),
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
			delete: (sessionPath) => ipc.invoke(CHANNELS.DELETE, sessionPath),
			deleteAllForCwd: (cwd) => ipc.invoke(CHANNELS.DELETE_ALL_FOR_CWD, cwd),
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
			onRunningChanged: (handler) => onIpcEvent(ipc, CHANNELS.RUNNING_CHANGED, handler),
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
