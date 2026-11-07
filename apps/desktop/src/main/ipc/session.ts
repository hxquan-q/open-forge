// Modified by The Open Forge contributors.
import { randomUUID } from "node:crypto";
import { type Dirent, type FSWatcher, watch } from "node:fs";
import { mkdir, readdir, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { codingAgentSessionShardPath } from "@vetta/coding-agent/bootstrap";
import type {
	CodingAgentQuestionFunctionRequest,
	CodingAgentQuestionResult,
	CodingAgentSandboxAuthorizationDecision,
	CodingAgentSandboxAuthorizationFunctionRequest,
} from "@vetta/coding-agent/function-extensions";
import type {
	AgentPluginContinuationInvocation,
	AgentPluginContinuationResult,
	AgentPluginHandlerResult,
	AgentPluginSystemPromptInvocation,
	AgentPluginToolInvocation,
} from "@vetta/coding-agent/plugin-runtime";

import {
	CODING_AGENT_BACKGROUND_TASKS_OBSERVATION,
	CODING_AGENT_BACKGROUND_TASKS_READ,
	CODING_AGENT_SESSION_PROFILE_STATE_READ,
	CODING_AGENT_SUBAGENTS_OBSERVATION,
	CODING_AGENT_SUBAGENTS_READ,
} from "@vetta/coding-agent/session-extensions";
import type { HistoryEntry, SessionEvent } from "@vetta/runtime-core";
import { sessionExtensionObservation } from "@vetta/runtime-core/session-extensions";
import { isMcpJsonValue, type McpJsonObject } from "@vetta/runtime-mcp";
import { BrowserWindow, ipcMain, type WebContents } from "electron";
import type { DesktopMcpAppResourceRead, DesktopMcpAppToolCall } from "../../shared/mcp-app.js";
import type { DesktopMcpElicitationResponse, DesktopMcpElicitationValue } from "../../shared/mcp-interaction.js";
import { PLUGIN_CONTRIBUTION_CHANNELS } from "../../shared/plugin-ipc.js";
import { SESSION_SEARCH_CHANNELS } from "../../shared/session-search.js";
import {
	runSessionInterruptStartupScan,
	startSessionInterruptMonitor,
} from "../agent-runtime/session-interrupt-bootstrap.js";
import {
	clearSessionManualStop,
	markSessionManualStop,
	watchSessionForInterruptContinue,
} from "../agent-runtime/session-interrupt-watch-registry.js";
import { stopSessionBackgroundWork } from "../agent-runtime/stop-session-work.js";
import { agentTeamSessionService } from "../agent-teams/team-session-service.js";
import { stopMonitoringRuntimeSession } from "../app-monitor/app-monitor-service.js";
import { onConversationListChanged } from "../conversations/conversation-list-events.js";
import { assertOrdinaryConversationPath } from "../conversations/conversation-ownership-guard.js";
import { getDesktopConversationService } from "../conversations/desktop-conversation-service.js";
import { desktopSessionSearch } from "../conversations/desktop-session-search.js";
import {
	collectRunningInteractiveSessionIds,
	InteractiveSessionResidencyTracker,
	reconcileIdleInteractiveSessions,
} from "../conversations/idle-session-residency.js";
import { getDesktopMcpElicitationBroker } from "../conversations/mcp-elicitation-broker.js";
import { getDesktopPlanReviewBroker } from "../conversations/plan-review-broker.js";
import { purgeProjectSessions } from "../conversations/project-session-purge.js";
import { parsePromptRequest } from "../conversations/prompt-request-schema.js";
import type { DesktopCodingAgentSessionConfig } from "../conversations/resolve-session-config.js";
import { getDesktopSandboxAuthorizationBroker } from "../conversations/sandbox-authorization-broker.js";
import { diffViewerHistory, parseHistoryPageRequest, sliceHistoryPage } from "../conversations/session-history-page.js";
import { isConversationSubCwd, readSessionCwdFromHeader } from "../conversations/session-paths.js";
import { listSessionHistory } from "../conversations/session-query-service.js";
import { slimSessionEventForIpc } from "../conversations/slim-session-event-for-ipc.js";
import { getDesktopUserQuestionBroker } from "../conversations/user-question-broker.js";
import { type DebugRequestData, writeDebugRequest } from "../debug-writer.js";
import { getAppLogger } from "../logger.js";
import { getDesktopMcpAppRegistry } from "../mcp/mcp-app-runtime.js";
import { getDesktopMcpTaskCoordinator, getDesktopMcpTaskRegistry } from "../mcp/mcp-task-runtime.js";
import { forgetMessageAnnotations } from "../message-annotations/host.js";
import { notify } from "../notifications/index.js";
import { SessionTurnNotificationController } from "../notifications/session-turn-notification-controller.js";
import { createPetBubbleCommand } from "../pet/pet-bubble-command.js";
import { mapSessionEventToPetPresentation } from "../pet/session-event-action-policy.js";
import { sendPetCommandToWindow } from "../pet-window.js";
import { setDesktopPluginHookInvoker } from "../plugins/coding-agent-hook-invocation.js";
import { listPlugins, pluginAgentContributionService } from "../plugins/plugin-catalog.js";
import { createPluginHookRendererDispatcher } from "../plugins/plugin-hook-renderer-dispatcher.js";
import { summarizeAgentPluginRuntimeConfig } from "../plugins/plugin-runtime-config-builder.js";
import { getDesktopCodingAgentPluginRuntimeSource } from "../plugins/plugin-runtime-service.js";
import { PluginToolRendererHostLifecycle } from "../plugins/plugin-tool-renderer-host-lifecycle.js";
import { attachPluginToolRendererHostNavigation } from "../plugins/plugin-tool-renderer-host-navigation.js";
import {
	filterSystemPromptInvocationForPlugin,
	tryNormalizeDynamicSystemPromptOperations,
} from "../plugins/system-prompt-operations.js";
import { getSharedRuntime } from "../runtime.js";
import {
	DEFAULT_CONVERSATION_CWD,
	DEFAULT_CONVERSATION_SESSION_DIR,
	DEFAULT_IM_CONVERSATION_CWD,
	DEFAULT_IM_CONVERSATION_SESSION_DIR,
	readConfigSync,
} from "./fs.js";
import { parseSessionTraceContext } from "./session-trace-context.js";

export { ensureConversationSubCwd, resolveSessionDirForCwd } from "../conversations/session-paths.js";

/** ADR-0007 per-session dir name under conversation roots (UUID). */
function isSessionArtifactDirName(name: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name);
}

/** Wipe files/dirs inside dir but keep dir itself (for session cwd recovery). */
async function clearDirectoryContents(dir: string): Promise<void> {
	let entries: Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	await Promise.all(entries.map((entry) => rm(join(dir, entry.name), { recursive: true, force: true })));
}

/**
 * 递归删除 dir 下内容，但保留 preserve 集合中的文件以及通往它们的祖先目录。
 * 返回 true 表示本目录尚有保留内容（调用方据此判断是否还能整体删除）。
 */
async function rmExceptPreserved(dir: string, preserve: Set<string>): Promise<boolean> {
	let entries: Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return false;
	}
	let kept = false;
	await Promise.all(
		entries.map(async (entry) => {
			const full = join(dir, entry.name);
			const abs = resolve(full);
			if (preserve.has(abs)) {
				kept = true;
				return;
			}
			if (entry.isDirectory()) {
				const childKept = await rmExceptPreserved(full, preserve);
				if (childKept) {
					kept = true;
				} else {
					await rm(full, { recursive: true, force: true });
				}
			} else {
				await rm(full, { force: true });
			}
		}),
	);
	return kept;
}

const sessionLog = getAppLogger("session");
const pluginLog = getAppLogger("plugin");

const CHANNELS = {
	CREATE: "vetta:session:create",
	SESSIONS_CHANGED: "vetta:session:sessions-changed",
	PROMPT: "vetta:session:prompt",
	CONTINUE: "vetta:session:continue",
	ABORT: "vetta:session:abort",
	SUBSCRIBE: "vetta:session:subscribe",
	UNSUBSCRIBE: "vetta:session:unsubscribe",
	/** 默认工作模式已变更；仅用于各窗口新会话页 toggle 的显示同步，不改变任何活跃会话的行为。 */
	AGENT_MODE_CHANGED: "vetta:session:agent-mode-changed",
	GET_STATE: "vetta:session:get-state",
	GET_MESSAGES: "vetta:session:get-messages",
	DELETE: "vetta:session:delete",
	/** 项目硬删除时清空该 cwd 名下的会话存储；会话不在项目目录内，见 project-session-purge。 */
	DELETE_ALL_FOR_CWD: "vetta:session:delete-all-for-cwd",
	DISPOSE: "vetta:session:dispose",
	GET_FULL_HISTORY: "vetta:session:get-full-history",
	EVENT: "vetta:session:event",
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
	RUNNING_CHANGED: "vetta:session:running-changed",
	/** Main → Renderer：中断续接判定结果（notify / auto-retried）。 */
	INTERRUPT_HEALTH: "vetta:session:interrupt-health",
	// 某 session 是否有待回答的 ask_user_question；广播给所有窗口（侧栏 + 快捷面板）。
	PENDING_QUESTION_CHANGED: "vetta:session:pending-question-changed",
	CLEAR_DEFAULT_CONVERSATION: "vetta:session:clear-default-conversation",
	CLEAR_DEFAULT_ARTIFACTS: "vetta:session:clear-default-artifacts",
	// Read-only viewer for sessions we don't want to (or can't) take the
	// write lock on — currently IM sessions, see ADR-0004. The viewer
	// reads the .jsonl directly and tails fs.watch for new entries.
	VIEWER_OPEN: "vetta:session:viewer-open",
	VIEWER_SUBSCRIBE: "vetta:session:viewer-subscribe",
	VIEWER_UNSUBSCRIBE: "vetta:session:viewer-unsubscribe",
	VIEWER_EVENT: "vetta:session:viewer-event",
	PLUGIN_TOOL_REQUEST: PLUGIN_CONTRIBUTION_CHANNELS.TOOL_REQUEST,
	PLUGIN_TOOL_RESPONSE: PLUGIN_CONTRIBUTION_CHANNELS.TOOL_RESPONSE,
	PLUGIN_HOST_READY: PLUGIN_CONTRIBUTION_CHANNELS.HOST_READY,
	PLUGIN_HOOK_REQUEST: PLUGIN_CONTRIBUTION_CHANNELS.HOOK_REQUEST,
	PLUGIN_HOOK_RESPONSE: PLUGIN_CONTRIBUTION_CHANNELS.HOOK_RESPONSE,
	PLUGIN_CONTINUATION_REQUEST: PLUGIN_CONTRIBUTION_CHANNELS.CONTINUATION_REQUEST,
	PLUGIN_CONTINUATION_RESPONSE: PLUGIN_CONTRIBUTION_CHANNELS.CONTINUATION_RESPONSE,
	PLUGIN_SYSTEM_PROMPT_REQUEST: PLUGIN_CONTRIBUTION_CHANNELS.SYSTEM_PROMPT_REQUEST,
	PLUGIN_SYSTEM_PROMPT_RESPONSE: PLUGIN_CONTRIBUTION_CHANNELS.SYSTEM_PROMPT_RESPONSE,
} as const;

/** 向所有存活窗口（含独立的快捷面板窗口）广播一个事件。 */
function broadcastToAllWindows(channel: string, payload: unknown): void {
	for (const win of BrowserWindow.getAllWindows()) {
		if (win.isDestroyed()) continue;
		const wc = win.webContents;
		if (wc.isDestroyed()) continue;
		wc.send(channel, payload);
	}
}

/**
 * 各 session 当前是否有待回答的 ask_user_question。模块级（跨 registerSessionIpc 调用共享），
 * 状态变化时广播给所有窗口——侧栏与快捷面板据此显示「待答」。
 */
const pendingQuestionPaths = new Set<string>();

function setPendingQuestion(sessionPath: string, hasPendingQuestion: boolean): void {
	const had = pendingQuestionPaths.has(sessionPath);
	if (hasPendingQuestion) {
		if (had) return;
		pendingQuestionPaths.add(sessionPath);
	} else {
		if (!had) return;
		pendingQuestionPaths.delete(sessionPath);
	}
	broadcastToAllWindows(CHANNELS.PENDING_QUESTION_CHANGED, { sessionPath, hasPendingQuestion });
}

function assertNonEmptyString(value: unknown, fieldName: string): asserts value is string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`Invalid ${fieldName}`);
	}
}

function assertExecutionMode(value: unknown): void {
	if (value === undefined) return;
	if (value !== "sandbox" && value !== "full-access") {
		throw new Error("Invalid executionMode");
	}
}

function assertSessionKind(value: unknown): asserts value is "conversation" | "other" {
	if (value !== "conversation" && value !== "other") {
		throw new Error("Invalid session kind");
	}
}

/** Sanitize the renderer's ask_user_question reply into the Coding Agent product result. */
function normalizeQuestionResult(value: unknown): CodingAgentQuestionResult {
	if (typeof value !== "object" || value === null) return { cancelled: true, answers: [] };
	const v = value as Record<string, unknown>;
	if (v.cancelled === true || !Array.isArray(v.answers)) return { cancelled: true, answers: [] };
	const answers = (v.answers as Array<Record<string, unknown>>)
		.filter((a) => a && typeof a.question === "string" && Array.isArray(a.answers))
		.map((a) => ({
			question: a.question as string,
			answers: (a.answers as unknown[]).filter((x): x is string => typeof x === "string"),
		}));
	return { cancelled: false, answers };
}

function normalizeMcpElicitationResponse(value: unknown): DesktopMcpElicitationResponse {
	if (!value || typeof value !== "object") return { action: "cancel" };
	const record = value as Record<string, unknown>;
	if (record.action !== "accept" && record.action !== "decline" && record.action !== "cancel") {
		return { action: "cancel" };
	}
	if (record.action !== "accept") return { action: record.action };
	if (!record.content || typeof record.content !== "object" || Array.isArray(record.content)) {
		return { action: "accept" };
	}
	const content: Record<string, DesktopMcpElicitationValue> = {};
	for (const [key, field] of Object.entries(record.content)) {
		if (
			typeof field === "string" ||
			typeof field === "number" ||
			typeof field === "boolean" ||
			(Array.isArray(field) && field.every((item) => typeof item === "string"))
		) {
			content[key] = field as DesktopMcpElicitationValue;
		}
	}
	return { action: "accept", content };
}

function normalizeMcpAppToolCall(value: unknown): DesktopMcpAppToolCall & { readonly arguments?: McpJsonObject } {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid MCP App tool call");
	const record = value as Record<string, unknown>;
	assertNonEmptyString(record.surfaceId, "MCP App surface id");
	assertNonEmptyString(record.name, "MCP App tool name");
	if (record.surfaceId.length > 128 || record.name.length > 256)
		throw new Error("MCP App tool call identifiers are too long");
	if (record.arguments !== undefined && (!isMcpJsonValue(record.arguments) || Array.isArray(record.arguments))) {
		throw new Error("Invalid MCP App tool arguments");
	}
	if (
		record.arguments !== undefined &&
		new TextEncoder().encode(JSON.stringify(record.arguments)).byteLength > 256_000
	) {
		throw new Error("MCP App tool arguments exceed the host limit");
	}
	return {
		surfaceId: record.surfaceId,
		name: record.name,
		...(record.arguments === undefined ? {} : { arguments: record.arguments as McpJsonObject }),
	};
}

function normalizeMcpAppResourceRead(value: unknown): DesktopMcpAppResourceRead {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid MCP App resource read");
	const record = value as Record<string, unknown>;
	assertNonEmptyString(record.surfaceId, "MCP App surface id");
	assertNonEmptyString(record.uri, "MCP App resource URI");
	if (record.surfaceId.length > 128 || record.uri.length > 2048)
		throw new Error("MCP App resource request is too long");
	if (!record.uri.startsWith("ui://")) throw new Error("MCP App resource URI must use ui://");
	return { surfaceId: record.surfaceId, uri: record.uri };
}

function assertMcpAppSender(sender: WebContents, expected: WebContents): void {
	if (sender !== expected || sender.isDestroyed()) throw new Error("Untrusted MCP App IPC sender");
}

export function registerSessionIpc(webContents: WebContents): () => void {
	const runtime = getSharedRuntime();
	const pluginRuntimeSource = getDesktopCodingAgentPluginRuntimeSource();
	const conversationService = getDesktopConversationService();
	const questionBroker = getDesktopUserQuestionBroker();
	const mcpElicitationBroker = getDesktopMcpElicitationBroker();
	const mcpTaskRegistry = getDesktopMcpTaskRegistry();
	const mcpTaskCoordinator = getDesktopMcpTaskCoordinator();
	const mcpAppRegistry = getDesktopMcpAppRegistry();
	const sandboxAuthorizationBroker = getDesktopSandboxAuthorizationBroker();
	const unsubscribeConversationListChanged = onConversationListChanged((event) => {
		broadcastToAllWindows(CHANNELS.SESSIONS_CHANGED, event);
	});
	const subscriptionMap = new Map<string, () => void>();
	const questionMap = new Map<string, (result: CodingAgentQuestionResult) => void>();
	const mcpElicitationMap = new Map<string, (result: DesktopMcpElicitationResponse) => void>();
	const sandboxGrantMap = new Map<string, (decision: CodingAgentSandboxAuthorizationDecision) => void>();
	const pluginToolMap = new Map<string, (result: unknown) => void>();
	const pluginToolRendererHost = new PluginToolRendererHostLifecycle();
	const pluginHookMap = new Map<string, (result: unknown) => void>();
	const pluginContinuationMap = new Map<string, (result: unknown) => void>();
	const pluginSystemPromptMap = new Map<string, (result: unknown) => void>();
	/** Track session cwd for debug file writing */
	const sessionCwdMap = new Map<string, string>();
	/** Track debug request sequence per session */
	const debugSeqMap = new Map<string, number>();
	/** Track turn start time per session for duration calculation */
	const turnStartMap = new Map<string, number>();
	const interactiveResidency = new InteractiveSessionResidencyTracker();
	/**
	 * ADR-0002: 交互式 session 的常驻通知订阅（独立于渲染端视图订阅，不随
	 * 切换 session 销毁）。只有经本 IPC CHANNELS.CREATE 创建的 session 才会挂，
	 * 故天然只覆盖交互式 session（批量/定时任务直接调 runtime.createSession）。
	 */
	const notificationSubs = new Map<string, () => void>();

	/** 给某交互式 session 挂常驻通知订阅；已挂则跳过。 */
	const attachNotificationSub = (sessionId: string, cwd: string): void => {
		if (notificationSubs.has(sessionId)) return;
		// 逐轮跟踪终结状态：message.final 带 stopReason，error 事件、aborted
		// lifecycle 各自独立。agent_end 时按累积状态判定该不该通知。
		let lastPetActionId: string | undefined;
		const hasFinalPetBody = false;
		const notificationController = new SessionTurnNotificationController();
		const unsubscribe = runtime.subscribe(sessionId, (ev: SessionEvent) => {
			const petPresentation = mapSessionEventToPetPresentation(ev);
			const petActionId = petPresentation?.actionId;
			if (petActionId && petActionId !== lastPetActionId) {
				lastPetActionId = petActionId;
				sendPetCommandToWindow({ type: "set-action", actionId: petActionId, source: "app" });
			}
			const petBubble = petPresentation?.bubble;
			const isRedundantGenericCompletion =
				ev.type === "session.lifecycle" && ev.phase === "agent_end" && hasFinalPetBody;
			if (petBubble && !isRedundantGenericCompletion) {
				const command = createPetBubbleCommand(petBubble, sessionId);
				if (command) sendPetCommandToWindow(command);
			}

			const outcome = notificationController.handle(ev);
			const sessionPath = outcome ? runtime.getSessionPath(sessionId) : undefined;
			if (outcome && sessionPath) {
				// 中断不通知；正常完成 / 出错才通知（见 CONTEXT.md「agent 完成通知」）。
				// controller 用 "failed" 描述终态，notify 合同沿用本仓的 "error"。
				void notify({
					type: "agent-turn-complete",
					sessionPath,
					cwd,
					outcome: outcome === "failed" ? "error" : "completed",
				});
			}
		});
		notificationSubs.set(sessionId, unsubscribe);
	};

	/** 释放某 session 的常驻通知订阅。 */
	const detachNotificationSub = (sessionId: string): void => {
		const unsubscribe = notificationSubs.get(sessionId);
		if (unsubscribe) {
			unsubscribe();
			notificationSubs.delete(sessionId);
		}
	};

	const forgetInteractiveSession = (sessionId: string): void => {
		interactiveResidency.forget(sessionId);
		sessionCwdMap.delete(sessionId);
		debugSeqMap.delete(sessionId);
		turnStartMap.delete(sessionId);
		detachNotificationSub(sessionId);
		stopMonitoringRuntimeSession(sessionId);
	};

	const disposeInteractiveSession = async (sessionId: string): Promise<void> => {
		await runtime.disposeSession(sessionId);
		forgetInteractiveSession(sessionId);
	};

	const scheduleIdleInteractiveSessionReconcile = (): void => {
		const runningIds = collectRunningInteractiveSessionIds(
			interactiveResidency.trackedIds(),
			(sessionId) => runtime.getSessionPath(sessionId),
			runtime.getRunningSessionPaths(),
		);
		void reconcileIdleInteractiveSessions({
			tracker: interactiveResidency,
			runningIds,
			dispose: disposeInteractiveSession,
			onDisposeError: (sessionId, error) => {
				sessionLog.warn("idle interactive session dispose failed", sessionId, error);
			},
		});
	};

	const CANCELLED_QUESTION: CodingAgentQuestionResult = { cancelled: true, answers: [] };

	// ask_user_question 后端：把请求送到渲染端「问答面板」，阻塞等用户提交/取消。
	// 镜像 confirm 的 requestId map 模式；abort（中断/窗口销毁）一律视为取消。
	const questionHandler = (
		request: CodingAgentQuestionFunctionRequest,
		signal?: AbortSignal,
	): Promise<CodingAgentQuestionResult> => {
		if (webContents.isDestroyed()) return Promise.resolve(CANCELLED_QUESTION);
		return new Promise<CodingAgentQuestionResult>((resolve) => {
			const sessionPath = runtime.getSessionPath(request.sessionId);
			const finish = (result: CodingAgentQuestionResult): void => {
				questionMap.delete(request.requestId);
				if (signal) signal.removeEventListener("abort", onAbort);
				// 问答结束（提交/取消/中断）后清掉「待答」标记并广播。
				if (sessionPath) setPendingQuestion(sessionPath, false);
				resolve(result);
			};
			const onAbort = (): void => finish(CANCELLED_QUESTION);
			if (signal?.aborted) {
				resolve(CANCELLED_QUESTION);
				return;
			}
			if (signal) signal.addEventListener("abort", onAbort, { once: true });
			questionMap.set(request.requestId, finish);
			webContents.send(CHANNELS.QUESTION_REQUEST, request);
			// 广播「待答」给所有窗口（侧栏 + 快捷面板）。
			if (sessionPath) setPendingQuestion(sessionPath, true);
			// 同时发系统通知「有问题待确认」（点击跳转该 session）；前台看着该 session 时自动抑制。
			const cwd = sessionCwdMap.get(request.sessionId);
			if (sessionPath && cwd) {
				void notify({ type: "agent-question-pending", sessionPath, cwd });
			}
		});
	};

	// 提问用户面板不再是用户开关：问答 handler 恒注入（能力始终在）。是否向 agent 暴露
	// ask_user_question 改由该工具的 scope_use（仅 conversation/project 场景）决定。
	const unregisterInteractiveQuestionHandler = questionBroker.setInteractiveHandler(questionHandler);
	const unregisterQuestionResolved = questionBroker.onQuestionResolved((event) => {
		if (webContents.isDestroyed()) return;
		try {
			webContents.send(CHANNELS.QUESTION_RESOLVED, event);
		} catch {
			// Renderer may be between render-process-gone and reload; snapshot sync will recover.
		}
	});

	// exit_plan_mode 后端：审批的挂起与应答由 broker 拥有，这里只把它接到本窗口。
	// 计划等待审批与「有问题待回答」对用户是同一件事——会话在等你，复用同一个待办标记与通知。
	const planReviewBroker = getDesktopPlanReviewBroker();
	const unregisterPlanReviewPresenter = planReviewBroker.setPresenter({
		present: (request) => {
			if (webContents.isDestroyed()) {
				planReviewBroker.respond(request.requestId, undefined);
				return;
			}
			webContents.send(CHANNELS.PLAN_REVIEW_REQUEST, request);
			const sessionPath = runtime.getSessionPath(request.sessionId);
			const cwd = sessionCwdMap.get(request.sessionId);
			if (sessionPath) setPendingQuestion(sessionPath, true);
			if (sessionPath && cwd) void notify({ type: "agent-question-pending", sessionPath, cwd });
		},
		resolved: (event) => {
			const sessionPath = runtime.getSessionPath(event.sessionId);
			if (sessionPath) setPendingQuestion(sessionPath, false);
			if (!webContents.isDestroyed()) webContents.send(CHANNELS.PLAN_REVIEW_RESOLVED, event);
		},
	});

	const unregisterMcpElicitationHandler = mcpElicitationBroker.setInteractiveHandler((request, signal) => {
		if (webContents.isDestroyed()) return Promise.resolve({ action: "cancel" });
		return new Promise<DesktopMcpElicitationResponse>((resolve) => {
			const finish = (result: DesktopMcpElicitationResponse): void => {
				mcpElicitationMap.delete(request.requestId);
				signal?.removeEventListener("abort", onAbort);
				resolve(result);
			};
			const onAbort = (): void => finish({ action: "cancel" });
			if (signal?.aborted) {
				resolve({ action: "cancel" });
				return;
			}
			signal?.addEventListener("abort", onAbort, { once: true });
			mcpElicitationMap.set(request.requestId, finish);
			webContents.send(CHANNELS.MCP_ELICITATION_REQUEST, request);
		});
	});
	const unregisterMcpElicitationResolved = mcpElicitationBroker.onResolved((event) => {
		if (!webContents.isDestroyed()) webContents.send(CHANNELS.MCP_ELICITATION_RESOLVED, event);
	});
	const unregisterMcpTasksChanged = mcpTaskRegistry.onChanged((event) => {
		if (!webContents.isDestroyed()) webContents.send(CHANNELS.MCP_TASKS_CHANGED, event);
	});

	const sandboxAuthorizationHandler = (
		request: CodingAgentSandboxAuthorizationFunctionRequest,
		signal?: AbortSignal,
	): Promise<CodingAgentSandboxAuthorizationDecision> => {
		if (webContents.isDestroyed()) return Promise.resolve("deny");
		return new Promise<CodingAgentSandboxAuthorizationDecision>((resolve) => {
			const finish = (decision: CodingAgentSandboxAuthorizationDecision): void => {
				sandboxGrantMap.delete(request.requestId);
				if (signal) signal.removeEventListener("abort", onAbort);
				resolve(decision);
			};
			const onAbort = (): void => finish("deny");
			if (signal?.aborted) {
				resolve("deny");
				return;
			}
			if (signal) signal.addEventListener("abort", onAbort, { once: true });
			sandboxGrantMap.set(request.requestId, finish);
			webContents.send(CHANNELS.SANDBOX_GRANT_REQUEST, request);
		});
	};
	const unregisterSandboxAuthorizationHandler =
		sandboxAuthorizationBroker.setInteractiveHandler(sandboxAuthorizationHandler);

	ipcMain.handle(CHANNELS.PLUGIN_HOST_READY, (event) => {
		if (event.sender !== webContents) return;
		pluginToolRendererHost.markReady();
	});

	pluginRuntimeSource.setToolInvoker((request: AgentPluginToolInvocation, signal?: AbortSignal) => {
		if (webContents.isDestroyed()) {
			return Promise.reject(new Error("Plugin host renderer is unavailable"));
		}
		const rejection = pluginAgentContributionService.readHandlerInvocationRejection(
			"tool",
			request.pluginId,
			request.handlerId,
			request.activationId,
		);
		if (rejection) return Promise.reject(new Error(rejection));
		return new Promise<AgentPluginHandlerResult<unknown>>((resolve, reject) => {
			const requestId = randomUUID();
			let releaseRendererLease: (() => void) | undefined;
			const cleanup = (): void => {
				pluginToolMap.delete(requestId);
				releaseRendererLease?.();
				releaseRendererLease = undefined;
				if (signal) signal.removeEventListener("abort", onAbort);
			};
			const rejectInvocation = (error: Error): void => {
				cleanup();
				reject(error);
			};
			const finish = (result: unknown): void => {
				cleanup();
				if (typeof result === "object" && result !== null && "error" in result) {
					reject(new Error(String((result as { error?: unknown }).error ?? "Plugin tool failed")));
					return;
				}
				const currentRejection = pluginAgentContributionService.readHandlerInvocationRejection(
					"tool",
					request.pluginId,
					request.handlerId,
					request.activationId,
				);
				if (currentRejection) {
					reject(new Error(currentRejection));
					return;
				}
				const plugin = listPlugins().find((candidate) => candidate.id === request.pluginId);
				if (!plugin) {
					reject(new Error(`Plugin not found: ${request.pluginId}`));
					return;
				}
				const effects = tryNormalizeDynamicSystemPromptOperations(
					plugin,
					(result as { effects?: unknown }).effects ?? [],
				);
				if (!effects.ok) {
					reject(effects.error);
					return;
				}
				resolve({
					value: (result as { value?: unknown })?.value,
					effects: effects.value,
				});
			};
			const onAbort = (): void => {
				rejectInvocation(
					signal?.reason instanceof Error ? signal.reason : new Error("Plugin tool invocation was aborted"),
				);
			};
			if (signal?.aborted) {
				rejectInvocation(
					signal.reason instanceof Error ? signal.reason : new Error("Plugin tool invocation was aborted"),
				);
				return;
			}
			const rendererLease = pluginToolRendererHost.acquire(rejectInvocation);
			if (!rendererLease.ok) {
				rejectInvocation(rendererLease.error);
				return;
			}
			releaseRendererLease = rendererLease.release;
			if (signal) signal.addEventListener("abort", onAbort, { once: true });
			pluginToolMap.set(requestId, finish);
			try {
				webContents.send(CHANNELS.PLUGIN_TOOL_REQUEST, {
					...request,
					requestId,
				});
			} catch (error) {
				rejectInvocation(error instanceof Error ? error : new Error(String(error)));
			}
		});
	});

	const dispatchHook = createPluginHookRendererDispatcher({
		host: pluginToolRendererHost,
		pending: pluginHookMap,
		readRejection: (request) =>
			pluginAgentContributionService.readHookInvocationRejection(
				request.pluginId,
				request.handlerId,
				request.activationId,
			),
		send: (request) => webContents.send(CHANNELS.PLUGIN_HOOK_REQUEST, request),
		onFailure: (request, message) =>
			pluginLog.warn("hook handler reported failure", {
				pluginId: request.pluginId,
				hookId: request.hookId,
				handlerId: request.handlerId,
				activationId: request.activationId,
				sessionId: request.session.id,
				message,
			}),
	});
	setDesktopPluginHookInvoker((request, signal) => {
		if (webContents.isDestroyed()) return Promise.resolve(undefined);
		pluginLog.debug("hook dispatch", {
			pluginId: request.pluginId,
			hookId: request.hookId,
			handlerId: request.handlerId,
			activationId: request.activationId,
			sessionId: request.session.id,
			rendererHostState: pluginToolRendererHost.readState(),
			...pluginAgentContributionService.readHookLeaseDiagnostics(),
		});
		return dispatchHook(request, signal);
	});

	pluginRuntimeSource.setContinuationInvoker((request: AgentPluginContinuationInvocation, signal?: AbortSignal) => {
		if (webContents.isDestroyed()) return Promise.resolve({ value: null, effects: [] });
		const rejection = pluginAgentContributionService.readHandlerInvocationRejection(
			"continuation",
			request.pluginId,
			request.handlerId,
			request.activationId,
		);
		if (rejection) return Promise.reject(new Error(rejection));
		return new Promise<AgentPluginHandlerResult<AgentPluginContinuationResult | null>>((resolve, reject) => {
			const requestId = randomUUID();
			const finish = (result: unknown): void => {
				pluginContinuationMap.delete(requestId);
				if (signal) signal.removeEventListener("abort", onAbort);
				if (typeof result === "object" && result !== null && "error" in result) {
					reject(new Error(String((result as { error?: unknown }).error ?? "Plugin continuation failed")));
					return;
				}
				const value = (result as { value?: unknown })?.value;
				const currentRejection = pluginAgentContributionService.readHandlerInvocationRejection(
					"continuation",
					request.pluginId,
					request.handlerId,
					request.activationId,
				);
				if (currentRejection) {
					reject(new Error(currentRejection));
					return;
				}
				const plugin = listPlugins().find((item) => item.id === request.pluginId);
				if (!plugin) {
					reject(new Error(`Plugin not found: ${request.pluginId}`));
					return;
				}
				const effects = tryNormalizeDynamicSystemPromptOperations(
					plugin,
					(result as { effects?: unknown }).effects ?? [],
				);
				if (!effects.ok) {
					reject(effects.error);
					return;
				}
				if (value === null || value === undefined) {
					resolve({ value: null, effects: effects.value });
					return;
				}
				if (typeof value !== "object" || typeof (value as { text?: unknown }).text !== "string") {
					reject(new Error("Plugin continuation returned an invalid result"));
					return;
				}
				const candidate = value as { text: string; idempotencyKey?: unknown };
				resolve({
					value: {
						text: candidate.text,
						idempotencyKey: typeof candidate.idempotencyKey === "string" ? candidate.idempotencyKey : undefined,
					},
					effects: effects.value,
				});
			};
			const onAbort = (): void => {
				pluginContinuationMap.delete(requestId);
				resolve({ value: null, effects: [] });
			};
			if (signal?.aborted) {
				resolve({ value: null, effects: [] });
				return;
			}
			if (signal) signal.addEventListener("abort", onAbort, { once: true });
			pluginContinuationMap.set(requestId, finish);
			webContents.send(CHANNELS.PLUGIN_CONTINUATION_REQUEST, {
				...request,
				requestId,
			});
		});
	});

	pluginRuntimeSource.setSystemPromptInvoker((request: AgentPluginSystemPromptInvocation, signal?: AbortSignal) => {
		if (webContents.isDestroyed()) {
			pluginLog.warn("[plugin-system-prompt] invocation skipped: renderer destroyed", {
				pluginId: request.pluginId,
				providerId: request.providerId,
				sessionId: request.session.id,
				runIndex: request.runtime.runIndex,
			});
			return Promise.resolve([]);
		}
		const rejection = pluginAgentContributionService.readHandlerInvocationRejection(
			"system-prompt",
			request.pluginId,
			request.handlerId,
			request.activationId,
		);
		if (rejection) return Promise.reject(new Error(rejection));
		return new Promise((resolve, reject) => {
			const requestId = randomUUID();
			const finish = (result: unknown): void => {
				pluginSystemPromptMap.delete(requestId);
				if (signal) signal.removeEventListener("abort", onAbort);
				if (typeof result === "object" && result !== null && "error" in result) {
					pluginLog.warn("[plugin-system-prompt] renderer handler failed", {
						requestId,
						pluginId: request.pluginId,
						providerId: request.providerId,
						error: String((result as { error?: unknown }).error ?? "Plugin system prompt failed"),
					});
					reject(new Error(String((result as { error?: unknown }).error ?? "Plugin system prompt failed")));
					return;
				}
				const currentRejection = pluginAgentContributionService.readHandlerInvocationRejection(
					"system-prompt",
					request.pluginId,
					request.handlerId,
					request.activationId,
				);
				if (currentRejection) {
					reject(new Error(currentRejection));
					return;
				}
				const plugin = listPlugins().find((candidate) => candidate.id === request.pluginId);
				if (!plugin) {
					reject(new Error(`Plugin not found: ${request.pluginId}`));
					return;
				}
				const operations = tryNormalizeDynamicSystemPromptOperations(
					plugin,
					(result as { value?: unknown })?.value,
				);
				if (!operations.ok) {
					reject(operations.error);
					return;
				}
				pluginLog.debug("[plugin-system-prompt] operations normalized", {
					requestId,
					pluginId: request.pluginId,
					providerId: request.providerId,
					operationTypes: operations.value.map((operation) => operation.type),
				});
				resolve(operations.value);
			};
			const onAbort = (): void => {
				pluginSystemPromptMap.delete(requestId);
				reject(new Error("Plugin system prompt invocation was aborted"));
			};
			if (signal?.aborted) {
				reject(new Error("Plugin system prompt invocation was aborted"));
				return;
			}
			if (signal) signal.addEventListener("abort", onAbort, { once: true });
			pluginSystemPromptMap.set(requestId, finish);
			pluginLog.debug("[plugin-system-prompt] sending renderer request", {
				requestId,
				pluginId: request.pluginId,
				providerId: request.providerId,
				handlerId: request.handlerId,
				sessionId: request.session.id,
				runIndex: request.runtime.runIndex,
				messageCount: request.conversation.messageCount,
			});
			const plugin = listPlugins().find((candidate) => candidate.id === request.pluginId);
			if (!plugin) {
				pluginSystemPromptMap.delete(requestId);
				reject(new Error(`Plugin not found: ${request.pluginId}`));
				return;
			}
			const filteredRequest = filterSystemPromptInvocationForPlugin(plugin, request);
			webContents.send(CHANNELS.PLUGIN_SYSTEM_PROMPT_REQUEST, {
				...filteredRequest,
				requestId,
			});
		});
	});

	ipcMain.handle(
		CHANNELS.CREATE,
		async (_event, config: DesktopCodingAgentSessionConfig | undefined, kind: unknown, rawTraceContext: unknown) => {
			assertSessionKind(kind);
			assertExecutionMode(config?.executionMode);
			const traceContext = parseSessionTraceContext(rawTraceContext);
			const result = await conversationService.createSession(config, kind, "interactive", traceContext);
			const effectiveCwd = result.cwd;
			interactiveResidency.touch(result.sessionId);
			if (effectiveCwd) {
				sessionCwdMap.set(result.sessionId, effectiveCwd);
			}
			// ADR-0002: 经本通道创建的即交互式 session，挂常驻通知订阅。
			attachNotificationSub(result.sessionId, effectiveCwd);
			scheduleIdleInteractiveSessionReconcile();
			// ADR-0007: 把实际 cwd（可能是「对话」per-session 子目录）返回给渲染端，
			// 否则 activeSession.cwd 仍是用户传入的项目根，ActivityPanel 文件树会
			// 落到项目根、看到其他 session 的子目录。
			return {
				sessionId: result.sessionId,
				sessionPath: result.sessionPath,
				cwd: effectiveCwd,
				// 回传生效的 Agent 绑定：新建时是渲染层自己传的，恢复时是主进程读回的，
				// 渲染层据此在消息列表上展示该 Agent 的头像与昵称。
				...(result.agentProfileId ? { agentProfileId: result.agentProfileId } : {}),
				// 会话档位随创建结果透传（BUG-0161）：渲染端 activeSessionAtom 与
				// §11.3 热追踪门控都以它为事实源，缺它时交互式 code 会话会被误判。
				agentMode: result.agentMode,
				capabilityProfile: result.capabilityProfile,
			};
		},
	);

	// 目录四通道（list-projects/list-sessions/list-running/list-running-cwds）
	// 已迁到 Host 合同 session.*（TASK-0474；sessions-changed 推送事件仍走旧 IPC）。

	ipcMain.handle(SESSION_SEARCH_CHANNELS.start, (event, requestId: unknown, request: unknown) => {
		desktopSessionSearch.start(event.sender, requestId, request);
	});
	ipcMain.handle(SESSION_SEARCH_CHANNELS.cancel, (event, requestId: unknown) => {
		desktopSessionSearch.cancel(event.sender, requestId);
	});

	ipcMain.handle(CHANNELS.PROMPT, async (_event, sessionId: unknown, request: unknown, rawTraceContext: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		interactiveResidency.touch(sessionId);
		clearSessionManualStop(sessionId);
		const traceContext = parseSessionTraceContext(rawTraceContext);
		const req = parsePromptRequest(request);
		sessionLog.info(
			`prompt session=${sessionId} textLength=${req.text.length} images=${req.images?.length ?? 0} streamingBehavior=${req.streamingBehavior ?? "default"}`,
			traceContext ? { interactionId: traceContext.interactionId } : undefined,
		);
		pluginLog.debug("session prompt plugin snapshot", {
			sessionId,
			...summarizeAgentPluginRuntimeConfig(pluginAgentContributionService.buildRuntimeConfig()),
		});
		return conversationService.promptInteractiveSession(sessionId, req, sessionCwdMap.get(sessionId));
	});

	ipcMain.handle(CHANNELS.CONTINUE, async (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		clearSessionManualStop(sessionId);
		await runtime.continue(sessionId);
	});

	// 失败/中断后的显式续跑入口（footer「继续」条）：kernel retry 重跑最后一轮并
	// 丢弃失败的助手尝试；忙碌/recovery_required 由 kernel 拒绝并透传给渲染端。
	// retry 与 interrupt-draft 两通道已迁到 Host 合同 session.*（TASK-0473）。

	ipcMain.handle(CHANNELS.ABORT, async (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		markSessionManualStop(sessionId);
		// Stopping is unconditional: the turn comes down together with the work it
		// spawned. Subagents and background commands outlive the turn by design, so
		// cancelling the turn alone would leave workflows running behind the button.
		await Promise.allSettled([runtime.abort(sessionId), stopSessionBackgroundWork(runtime, sessionId)]);
	});

	// interrupt-draft 已迁到 Host 合同 session.setInterruptDraftNonEmpty（TASK-0473）。

	// 输入队列管理（ADR-0060）：薄桥接，能力全部在 RuntimeHost。
	// 输入队列七通道已迁到 Host 合同 session.*（TASK-0467；queue-state 推送事件仍走旧 IPC）。

	// goal 五通道与 clear-todos 已迁到 Host 合同 session.*（TASK-0469；
	// goal 编排保留在 DesktopGoalController，Host 侧经同一编排点桥接）。

	// 执行模式与全局设置六通道（update-settings/set-execution-mode/
	// set-global-{execution-mode,agent-mode,thinking-level}/get-agent-modes）
	// 已迁到 Host 合同 session.*（TASK-0472；sandbox 可用断言与落盘语义随实现
	// 迁移，AGENT_MODE_CHANGED 显示同步广播留旧 IPC 事件面）。

	// 个性化配置（人设 + 自定义指令）。仅写盘；运行中的 session 在下一轮 prompt 经
	// settingsManager.reloadPersonalizationSettings() 懒重建生效，无需重启或广播。
	ipcMain.handle(CHANNELS.GET_STATE, async (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		const state = runtime.getState(sessionId);
		const productState = runtime.invokeSessionExtensionSync(
			sessionId,
			CODING_AGENT_SESSION_PROFILE_STATE_READ,
			undefined,
		);
		return {
			...state,
			scenario: productState.scenario,
			...(productState.agentMode !== undefined ? { agentMode: productState.agentMode } : {}),
		};
	});

	ipcMain.handle(CHANNELS.GET_MESSAGES, async (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		return runtime.getMessages(sessionId);
	});

	ipcMain.handle(CHANNELS.GET_FULL_HISTORY, async (_event, sessionId: unknown, options?: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		if (options === undefined) return runtime.getFullHistory(sessionId);
		// TASK-0050：传分页 options 即返回有界 HistoryPage；无参调用保持全量语义。
		return sliceHistoryPage(runtime.getFullHistory(sessionId), parseHistoryPageRequest(options));
	});

	// 会话历史分支五通道（navigate-for-edit/switch-branch/delete-message/
	// replace-last-user-message/fork-session）已迁到 Host 合同 session.*（TASK-0468）。

	ipcMain.handle(CHANNELS.DELETE, async (_event, sessionPath: unknown) => {
		assertNonEmptyString(sessionPath, "sessionPath");
		await assertOrdinaryConversationPath(sessionPath);
		// ADR-0007: 「对话」项目下的 session cwd 是独立子目录；删除 session 时
		// 连带回收子目录里的产物。读 header 先取 cwd，再 delete，最后 rm 子目录。
		const cwdFromHeader = await readSessionCwdFromHeader(sessionPath);
		await runtime.deleteSession(sessionPath);
		await forgetMessageAnnotations(sessionPath);
		if (cwdFromHeader && isConversationSubCwd(cwdFromHeader)) {
			await rm(resolve(cwdFromHeader), { recursive: true, force: true }).catch((err) => {
				sessionLog.error("failed to remove conversation sub cwd", cwdFromHeader, err);
			});
		}
	});

	ipcMain.handle(CHANNELS.DELETE_ALL_FOR_CWD, async (_event, cwd: unknown) => {
		assertNonEmptyString(cwd, "cwd");
		return purgeProjectSessions(cwd, {
			listSessions: (target) => listSessionHistory(target),
			deleteSession: (sessionPath) => runtime.deleteSession(sessionPath),
			// 分片目录是新会话的落点；`<项目>/.vetta/sessions` 是存量兼容位置，随项目目录
			// 一起消失，这里不重复处理（见 composition.resolveDesktopRuntimeSessionRoots）。
			resolveSessionDirs: (target) => [codingAgentSessionShardPath(target)],
			removeDirectory: (dir) => rm(dir, { recursive: true, force: true }),
			logError: (message, ...args) => sessionLog.error(message, ...args),
		});
	});

	// 标题与建议三通道（rename/auto-title/next-prompt-suggestions）已迁到
	// Host 合同 session.*（TASK-0470；所有权守卫与空输入短路语义随实现迁移）。

	ipcMain.handle(CHANNELS.DISPOSE, async (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		await disposeInteractiveSession(sessionId);
	});

	// get-session-path 已迁到 Host 合同 session.getSessionPath（TASK-0473）。

	ipcMain.handle(CHANNELS.CLEAR_DEFAULT_CONVERSATION, async (_event, scope: unknown) => {
		// 物理分家后（ADR-0005）每个 scope 对应一个独立 cwd，互不干扰：
		// - "conversation"：清桌面「对话」cwd 下 .vetta/sessions 内的全部会话（保留产物）
		// - "claw"：清 IM cwd 下 .vetta/sessions 内的全部会话（保留产物）
		if (scope !== "conversation" && scope !== "claw") {
			throw new Error("Invalid scope for clearDefaultConversation");
		}
		const targetCwd = resolve(scope === "claw" ? DEFAULT_IM_CONVERSATION_CWD : DEFAULT_CONVERSATION_CWD);
		const targetSessionDir = resolve(
			scope === "claw" ? DEFAULT_IM_CONVERSATION_SESSION_DIR : DEFAULT_CONVERSATION_SESSION_DIR,
		);

		const running = runtime.getRunningSessionPaths();
		const sessionDirWithSep = `${targetSessionDir}/`;
		const blocking = running.filter((p) => resolve(p).startsWith(sessionDirWithSep));
		if (blocking.length > 0) {
			throw new Error(
				scope === "claw"
					? "存在运行中的 Claw 会话，请先停止后再清空。"
					: "默认项目存在运行中的会话，请先停止后再清空。",
			);
		}

		const toDispose: string[] = [];
		for (const [sessionId, cwd] of sessionCwdMap.entries()) {
			const absCwd = resolve(cwd);
			// "conversation" 场景下 session cwd 可能是 DEFAULT_CONVERSATION_CWD
			// 本身（老 session）或其 per-session 子目录（ADR-0007 之后的新 session）。
			const matched = absCwd === targetCwd || (scope === "conversation" && isConversationSubCwd(cwd));
			if (!matched) continue;
			toDispose.push(sessionId);
		}
		await Promise.all(
			toDispose.map(async (sessionId) => {
				try {
					await disposeInteractiveSession(sessionId);
				} catch (err) {
					sessionLog.error("clear-default-conversation dispose failed", sessionId, err);
				}
			}),
		);

		try {
			await rmExceptPreserved(targetSessionDir, new Set());
		} catch (err) {
			sessionLog.error("clear-default-conversation failed to clear session dir", err);
			throw err;
		}
		await mkdir(targetSessionDir, { recursive: true });
	});

	ipcMain.handle(CHANNELS.CLEAR_DEFAULT_ARTIFACTS, async (_event, scope: unknown) => {
		// 清空「对话」或 Claw cwd 下的产物文件（保留 .vetta 目录，会话不受影响）。
		// ADR-0007：UUID 子目录 *就是* session 的运行 cwd，不能整目录删除——否则 header
		// 仍指向该路径，重开/编辑后 bash、文件树全部 ENOENT。只清空目录内容并保留壳。
		if (scope !== "conversation" && scope !== "claw") {
			throw new Error("Invalid scope for clearDefaultArtifacts");
		}
		const targetCwd = resolve(scope === "claw" ? DEFAULT_IM_CONVERSATION_CWD : DEFAULT_CONVERSATION_CWD);

		let entries: Dirent[];
		try {
			entries = await readdir(targetCwd, { withFileTypes: true });
		} catch {
			return;
		}
		await Promise.all(
			entries
				.filter((entry) => entry.name !== ".vetta")
				.map(async (entry) => {
					const full = join(targetCwd, entry.name);
					if (entry.isDirectory() && isSessionArtifactDirName(entry.name)) {
						await clearDirectoryContents(full);
						return;
					}
					await rm(full, { recursive: true, force: true });
				}),
		);
	});

	const broadcastRunningChanged = (payload: {
		sessionPath: string;
		running: boolean;
		sessionId?: string;
		reason?: "agent_end" | "aborted" | "error";
	}) => {
		// 主窗口（订阅方）原样投递，保持既有行为。
		if (!webContents.isDestroyed()) {
			webContents.send(CHANNELS.RUNNING_CHANGED, payload);
		}
		// 并行广播给其它窗口（如独立的快捷面板窗口），让它们也能跟随运行态。
		for (const win of BrowserWindow.getAllWindows()) {
			if (win.isDestroyed()) continue;
			const wc = win.webContents;
			if (wc === webContents || wc.isDestroyed()) continue;
			wc.send(CHANNELS.RUNNING_CHANGED, payload);
		}
	};
	const unsubscribeRunning = runtime.onRunningChanged((sessionPath, running, sessionId, reason) => {
		broadcastRunningChanged({ sessionPath, running, sessionId, reason });
		if (sessionId) {
			if (running) {
				clearSessionManualStop(sessionId);
				watchSessionForInterruptContinue(sessionId);
			} else {
				watchSessionForInterruptContinue(sessionId);
			}
		}
		if (!sessionId || !interactiveResidency.has(sessionId)) return;
		interactiveResidency.touch(sessionId);
		if (!running) scheduleIdleInteractiveSessionReconcile();
	});
	const unsubscribeTeamRunning = agentTeamSessionService.onRunningChanged((sessionPath, running, sessionId) =>
		broadcastRunningChanged({ sessionPath, running, sessionId }),
	);
	const stopInterruptMonitor = startSessionInterruptMonitor(
		(channel, payload) => {
			if (!webContents.isDestroyed()) webContents.send(channel, payload);
		},
		(sessionId) => sessionCwdMap.get(sessionId),
	);
	// 启动一次性扫描「上次退出时未正常完成」的会话：只读、异步、失败只记日志。
	void runSessionInterruptStartupScan((channel, payload) => {
		if (!webContents.isDestroyed()) webContents.send(channel, payload);
	});

	ipcMain.handle(CHANNELS.QUESTION_LIST_PENDING, () => questionBroker.listPendingQuestions());
	ipcMain.handle(CHANNELS.MCP_ELICITATION_LIST_PENDING, () => mcpElicitationBroker.listPending());

	ipcMain.handle(CHANNELS.QUESTION_RESPONSE, (_event, requestId: unknown, result: unknown) => {
		assertNonEmptyString(requestId, "requestId");
		const resolve = questionMap.get(requestId);
		if (!resolve) return;
		resolve(normalizeQuestionResult(result));
	});

	ipcMain.handle(CHANNELS.PLAN_REVIEW_LIST_PENDING, () => planReviewBroker.listPending());
	ipcMain.handle(CHANNELS.PLAN_REVIEW_RESPONSE, (_event, requestId: unknown, result: unknown) => {
		assertNonEmptyString(requestId, "requestId");
		planReviewBroker.respond(requestId, result);
	});
	// plan-mode 两通道（get-state/set-permission-mode）已迁到 Host 合同
	// session.*（TASK-0471；plan-review request/response 随事件原语另片）。

	ipcMain.handle(CHANNELS.MCP_ELICITATION_RESPONSE, (_event, requestId: unknown, result: unknown) => {
		assertNonEmptyString(requestId, "requestId");
		mcpElicitationMap.get(requestId)?.(normalizeMcpElicitationResponse(result));
	});
	ipcMain.handle(CHANNELS.MCP_TASKS_LIST, (_event, sessionId: unknown) => {
		if (sessionId === undefined) return mcpTaskRegistry.listPublic();
		assertNonEmptyString(sessionId, "sessionId");
		return mcpTaskRegistry.listPublic(sessionId);
	});
	ipcMain.handle(CHANNELS.MCP_TASKS_CANCEL, (_event, id: unknown) => {
		assertNonEmptyString(id, "MCP task id");
		return mcpTaskCoordinator.cancel(id);
	});
	ipcMain.handle(CHANNELS.MCP_TASKS_CLEAR_FINISHED, (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		return mcpTaskRegistry.clearTerminal(sessionId);
	});
	ipcMain.handle(CHANNELS.MCP_APP_SURFACE_GET, (event, id: unknown) => {
		assertMcpAppSender(event.sender, webContents);
		assertNonEmptyString(id, "MCP App surface id");
		return mcpAppRegistry.getSurface(id);
	});
	ipcMain.handle(CHANNELS.MCP_APP_CALL_TOOL, async (event, input: unknown) => {
		assertMcpAppSender(event.sender, webContents);
		const request = normalizeMcpAppToolCall(input);
		return await mcpAppRegistry.callTool(request.surfaceId, request.name, request.arguments);
	});
	ipcMain.handle(CHANNELS.MCP_APP_READ_RESOURCE, async (event, input: unknown) => {
		assertMcpAppSender(event.sender, webContents);
		const request = normalizeMcpAppResourceRead(input);
		return await mcpAppRegistry.readResource(request.surfaceId, request.uri);
	});
	ipcMain.handle(CHANNELS.MCP_APP_RELEASE, (event, id: unknown) => {
		assertMcpAppSender(event.sender, webContents);
		assertNonEmptyString(id, "MCP App surface id");
		return mcpAppRegistry.release(id);
	});

	ipcMain.handle(CHANNELS.SANDBOX_GRANT_RESPONSE, (_event, requestId: unknown, decision: unknown) => {
		assertNonEmptyString(requestId, "requestId");
		const resolve = sandboxGrantMap.get(requestId);
		if (!resolve) return;
		const value: CodingAgentSandboxAuthorizationDecision =
			decision === "allow_once" || decision === "allow_session" ? decision : "deny";
		resolve(value);
	});

	ipcMain.handle(CHANNELS.PLUGIN_TOOL_RESPONSE, (_event, requestId: unknown, result: unknown) => {
		assertNonEmptyString(requestId, "requestId");
		const resolve = pluginToolMap.get(requestId);
		if (!resolve) return;
		resolve(result);
	});
	ipcMain.handle(CHANNELS.PLUGIN_HOOK_RESPONSE, (_event, requestId: unknown, result: unknown) => {
		assertNonEmptyString(requestId, "requestId");
		pluginHookMap.get(requestId)?.(result);
	});

	ipcMain.handle(CHANNELS.PLUGIN_CONTINUATION_RESPONSE, (_event, requestId: unknown, result: unknown) => {
		assertNonEmptyString(requestId, "requestId");
		const resolve = pluginContinuationMap.get(requestId);
		if (resolve) resolve(result);
	});
	ipcMain.handle(CHANNELS.PLUGIN_SYSTEM_PROMPT_RESPONSE, (_event, requestId: unknown, result: unknown) => {
		assertNonEmptyString(requestId, "plugin system prompt request id");
		const resolve = pluginSystemPromptMap.get(requestId);
		pluginLog.debug("[plugin-system-prompt] renderer response received", {
			requestId,
			hasPendingRequest: Boolean(resolve),
			operationCount:
				typeof result === "object" &&
				result !== null &&
				"value" in result &&
				Array.isArray((result as { value?: unknown }).value)
					? (result as { value: unknown[] }).value.length
					: undefined,
		});
		if (resolve) resolve(result);
	});

	ipcMain.handle(CHANNELS.SANDBOX_GRANTS_LIST, (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		return runtime.listSandboxGrants(sessionId);
	});

	ipcMain.handle(CHANNELS.SANDBOX_GRANTS_REVOKE, (_event, sessionId: unknown, grantId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		assertNonEmptyString(grantId, "grantId");
		return runtime.revokeSandboxGrant(sessionId, grantId);
	});

	ipcMain.handle(CHANNELS.SANDBOX_GRANTS_REVOKE_ALL, (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		return runtime.revokeAllSandboxGrants(sessionId);
	});

	// 后台任务三通道（clear-finished/kill/subagent-interrupt）已迁到 Host 合同
	// session.*（TASK-0473）。

	ipcMain.handle(CHANNELS.SUBSCRIBE, async (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		const subscriptionId = `${sessionId}:${randomUUID()}`;
		const unsubscribe = runtime.subscribe(sessionId, (runtimeEvent: SessionEvent) => {
			// Debug mode: intercept events for request history recording
			try {
				if (runtimeEvent.type === "session.lifecycle" && runtimeEvent.phase === "turn_start") {
					turnStartMap.set(sessionId, Date.now());
				}
				const assistantMessage =
					runtimeEvent.channel === "assistant" && runtimeEvent.type === "done"
						? runtimeEvent.message
						: runtimeEvent.channel === "assistant" && runtimeEvent.type === "error"
							? runtimeEvent.error
							: undefined;
				if (assistantMessage && readConfigSync().debugMode) {
					const cwd = sessionCwdMap.get(sessionId);
					if (cwd) {
						const projectName = basename(cwd);
						const seq = (debugSeqMap.get(sessionId) ?? 0) + 1;
						debugSeqMap.set(sessionId, seq);
						const msg = assistantMessage as unknown as Record<string, unknown>;
						const usage = (msg.usage ?? {}) as DebugRequestData["usage"];
						const turnStart = turnStartMap.get(sessionId) ?? Date.now();
						const now = Date.now();
						const data: DebugRequestData = {
							timestamp: now,
							sessionId,
							model: (msg.model as string) ?? "unknown",
							provider: (msg.provider as string) ?? "unknown",
							api: (msg.api as string) ?? "unknown",
							usage,
							stopReason: (msg.stopReason as string) ?? "unknown",
							durationMs: now - turnStart,
							message: msg,
						};
						void writeDebugRequest(projectName, sessionId, data, seq);
					}
				}
			} catch {
				// Debug recording should never break the event pipeline
			}
			// 渲染进程崩溃后 webContents 短暂处于"frame 已 disposed"状态——
			// runtime 这边 agent 还在跑，每个事件都尝试 send 就会刷屏
			// "Render frame was disposed before WebFrameMain could be accessed"。
			// 此处提前 bail，避免把事件 buffer 灌进死掉的渲染端。
			if (webContents.isDestroyed()) return;
			webContents.send(CHANNELS.EVENT, subscriptionId, slimSessionEventForIpc(runtimeEvent));
		});
		subscriptionMap.set(subscriptionId, unsubscribe);

		// 回放后台任务快照：注册表在主进程内存中跨 renderer 重载存活，但
		// 后台任务扩展观察只在状态变化时推送——renderer 刷新后 atom
		// 清空，若不回放，无输出的运行中任务（如 sleep）要等到结束才再现。
		const backgroundTasks = await runtime.invokeSessionExtension(
			sessionId,
			CODING_AGENT_BACKGROUND_TASKS_READ,
			undefined,
		);
		if (backgroundTasks.length > 0 && !webContents.isDestroyed()) {
			webContents.send(CHANNELS.EVENT, subscriptionId, {
				schemaVersion: 1,
				channel: "runtime",
				sessionId,
				eventId: randomUUID(),
				timestamp: Date.now(),
				source: "extension",
				...sessionExtensionObservation(CODING_AGENT_BACKGROUND_TASKS_OBSERVATION, backgroundTasks),
			});
		}

		// 回放激活工具集：renderer 的 getState 快照取于 subscribe 之前，插件若恰好在这两步
		// 之间才 activate，那次 active_tools_update 就没人接。补一次当前快照堵住这个窗口。
		if (!webContents.isDestroyed()) {
			try {
				webContents.send(CHANNELS.EVENT, subscriptionId, {
					schemaVersion: 1,
					channel: "runtime",
					sessionId,
					eventId: randomUUID(),
					timestamp: Date.now(),
					source: "runtime-core",
					type: "active_tools_update",
					activeToolNames: runtime.getState(sessionId).activeToolNames,
				});
			} catch {
				// session 可能已被销毁，回放失败不影响订阅本身。
			}
		}

		const subagents = await runtime.invokeSessionExtension(sessionId, CODING_AGENT_SUBAGENTS_READ, undefined);
		if (subagents.length > 0 && !webContents.isDestroyed()) {
			webContents.send(CHANNELS.EVENT, subscriptionId, {
				schemaVersion: 1,
				channel: "runtime",
				sessionId,
				eventId: randomUUID(),
				timestamp: Date.now(),
				source: "extension",
				...sessionExtensionObservation(CODING_AGENT_SUBAGENTS_OBSERVATION, subagents),
			});
		}

		return { subscriptionId };
	});

	ipcMain.handle(CHANNELS.UNSUBSCRIBE, async (_event, subscriptionId: unknown) => {
		assertNonEmptyString(subscriptionId, "subscriptionId");
		sessionLog.debug(`unsubscribe subscription=${subscriptionId}`);
		const unsubscribe = subscriptionMap.get(subscriptionId);
		if (unsubscribe) {
			unsubscribe();
			subscriptionMap.delete(subscriptionId);
		}
	});

	const detachPluginHostNavigation = attachPluginToolRendererHostNavigation(
		webContents,
		pluginToolRendererHost,
		() => {
			pluginAgentContributionService.invalidateHookRendererDocument("Plugin host renderer document was replaced");
		},
	);

	// 渲染进程崩溃 / 重新加载时，旧 subscription 永远不会等到 UNSUBSCRIBE IPC
	// 调用——它们的回调还挂在 runtime 上、继续接收 agent 事件、继续往 dead
	// frame 上 send（哪怕有 isDestroyed 守卫，事件流仍在 runtime 端继续）。
	// 这里集中清理一次：渲染端恢复后会重新 SUBSCRIBE，生成新的 subscriptionId。
	const onRenderGone = (): void => {
		sessionLog.warn(`render-process-gone; clearing ${subscriptionMap.size} subscription(s)`);
		pluginToolRendererHost.markUnavailable();
		pluginAgentContributionService.invalidateHookRendererDocument("Plugin host renderer is unavailable");
		for (const unsubscribe of subscriptionMap.values()) {
			unsubscribe();
		}
		subscriptionMap.clear();
		for (const resolve of questionMap.values()) {
			resolve(CANCELLED_QUESTION);
		}
		questionMap.clear();
		planReviewBroker.cancelAll();
		for (const resolve of mcpElicitationMap.values()) resolve({ action: "cancel" });
		mcpElicitationMap.clear();
		for (const resolve of sandboxGrantMap.values()) {
			resolve("deny");
		}
		sandboxGrantMap.clear();
		for (const resolve of pluginToolMap.values()) {
			resolve({ error: "Plugin host renderer is unavailable" });
		}
		pluginToolMap.clear();
		for (const resolve of pluginHookMap.values()) {
			resolve({ error: "Plugin host renderer is unavailable" });
		}
		pluginHookMap.clear();
		for (const resolve of pluginContinuationMap.values()) {
			resolve({ value: null });
		}
		pluginContinuationMap.clear();
		for (const resolve of pluginSystemPromptMap.values()) {
			resolve({ error: "Plugin host renderer disposed" });
		}
		pluginSystemPromptMap.clear();
	};
	webContents.on("render-process-gone", onRenderGone);

	// ----- read-only viewer (no lock) -----------------------------------
	// Tracks live fs watchers per subscription id so the renderer can
	// open/close many concurrent viewers (e.g. preview hover) without
	// leaking watchers.
	interface ViewerSub {
		watcher: FSWatcher;
		path: string;
		/** 上一轮已下发的历史，用于 append-only 增量差分（TASK-0050）。 */
		lastEntries?: HistoryEntry[];
	}
	const viewerSubs = new Map<string, ViewerSub>();
	let viewerSeq = 0;

	ipcMain.handle(CHANNELS.VIEWER_OPEN, async (_event, path: unknown, options?: unknown) => {
		assertNonEmptyString(path, "path");
		const snapshot = runtime.readSessionHistoryFromFile(resolve(path));
		if (options === undefined) return snapshot;
		// TASK-0050：分页 options（含兼容的 tailTurns）返回有界 HistoryPage；
		// 空对象 {} 等效旧行为返回全量快照，避免 {} 语义悄悄改变。
		const request = parseHistoryPageRequest(options);
		if (request.limit === undefined && request.beforeEntry === undefined && request.tailTurns === undefined) {
			return snapshot;
		}
		return sliceHistoryPage(snapshot.history, request);
	});

	ipcMain.handle(CHANNELS.VIEWER_SUBSCRIBE, async (_event, path: unknown) => {
		assertNonEmptyString(path, "path");
		const abs = resolve(path);
		viewerSeq += 1;
		const subscriptionId = `viewer-${viewerSeq}`;
		// Debounce flurries of write events (jsonl is append-only but
		// editors/fs sometimes fire multiple change events per write).
		let pending: NodeJS.Timeout | undefined;
		const emit = () => {
			pending = undefined;
			if (webContents.isDestroyed()) return;
			const sub = viewerSubs.get(subscriptionId);
			// 已退订后仍在 debounce 窗口内触发的残留事件不再读取与下发。
			if (!sub) return;
			try {
				const snapshot = runtime.readSessionHistoryFromFile(abs);
				const update = diffViewerHistory(sub.lastEntries ?? null, snapshot.history);
				sub.lastEntries = snapshot.history;
				// 无变化的写事件（编辑器 flush/fs 抖动）不再发送。
				if (update === null) return;
				webContents.send(CHANNELS.VIEWER_EVENT, subscriptionId, update);
			} catch {
				// File may have been deleted between events; ignore.
			}
		};
		const watcher = watch(abs, { persistent: false }, () => {
			if (pending) return;
			pending = setTimeout(emit, 80);
		});
		viewerSubs.set(subscriptionId, { watcher, path: abs });
		return { subscriptionId };
	});

	ipcMain.handle(CHANNELS.VIEWER_UNSUBSCRIBE, (_event, subscriptionId: unknown) => {
		if (typeof subscriptionId !== "string") return;
		const sub = viewerSubs.get(subscriptionId);
		if (sub) {
			try {
				sub.watcher.close();
			} catch {
				// already closed
			}
			viewerSubs.delete(subscriptionId);
		}
	});

	return () => {
		stopInterruptMonitor();
		unsubscribeConversationListChanged();
		detachPluginHostNavigation();
		webContents.removeListener("render-process-gone", onRenderGone);
		pluginToolRendererHost.dispose();
		pluginAgentContributionService.invalidateHookRendererDocument("Plugin host renderer was disposed");
		for (const sub of viewerSubs.values()) {
			try {
				sub.watcher.close();
			} catch {
				// ignore
			}
		}
		viewerSubs.clear();
		unsubscribeRunning();
		unsubscribeTeamRunning();
		for (const unsubscribe of notificationSubs.values()) {
			unsubscribe();
		}
		notificationSubs.clear();
		for (const unsubscribe of subscriptionMap.values()) {
			unsubscribe();
		}
		subscriptionMap.clear();
		for (const resolve of questionMap.values()) {
			resolve(CANCELLED_QUESTION);
		}
		questionMap.clear();
		planReviewBroker.cancelAll();
		for (const resolve of mcpElicitationMap.values()) resolve({ action: "cancel" });
		mcpElicitationMap.clear();
		for (const resolve of sandboxGrantMap.values()) {
			resolve("deny");
		}
		sandboxGrantMap.clear();
		for (const resolve of pluginToolMap.values()) {
			resolve({ error: "Plugin host renderer disposed" });
		}
		pluginToolMap.clear();
		for (const resolve of pluginHookMap.values()) {
			resolve({ error: "Plugin host renderer disposed" });
		}
		pluginHookMap.clear();
		for (const resolve of pluginContinuationMap.values()) {
			resolve({ value: null });
		}
		pluginContinuationMap.clear();
		unregisterInteractiveQuestionHandler();
		unregisterPlanReviewPresenter();
		unregisterQuestionResolved();
		unregisterMcpElicitationHandler();
		unregisterMcpElicitationResolved();
		unregisterMcpTasksChanged();
		unregisterSandboxAuthorizationHandler();
		pluginRuntimeSource.setToolInvoker(undefined);
		setDesktopPluginHookInvoker(undefined);
		pluginRuntimeSource.setContinuationInvoker(undefined);
		pluginRuntimeSource.setSystemPromptInvoker(undefined);
		// 不在此处 disposeAllSessions：共享 runtime 的 session 可能正被
		// scheduler/batch-tasks 在后台使用。全进程 session 释放由 main.ts
		// 的 before-quit 负责（见 disposeSharedRuntime）。
	};
}
