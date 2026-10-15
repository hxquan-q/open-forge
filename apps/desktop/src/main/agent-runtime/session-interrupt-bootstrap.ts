// Copyright The Open Forge contributors.
import { assessConversationInterruption } from "@vetta/runtime-node/conversation";
import { nodeRuntimeQueueSidecarStore } from "@vetta/runtime-node/host";
import { readAgentSettingsDocument } from "../agent-settings/settings-document-store.js";
import { DEFAULT_CONVERSATION_CWD, readConfigSync } from "../config/desktop-config-store.js";
import { getDesktopConversationService } from "../conversations/desktop-conversation-service.js";
import { getDesktopMcpElicitationBroker } from "../conversations/mcp-elicitation-broker.js";
import { getDesktopPlanReviewBroker } from "../conversations/plan-review-broker.js";
import { getDesktopUserQuestionBroker } from "../conversations/user-question-broker.js";
import { getAppLogger } from "../logger.js";
import { notify } from "../notifications/index.js";
import { getSharedRuntime } from "../runtime.js";
import { type SessionInterruptContinueMode, SessionInterruptMonitor } from "./session-interrupt-monitor.js";
import {
	type InterruptedStartupCandidate,
	scanInterruptedSessionsOnStartup,
} from "./session-interrupt-startup-scan.js";
import { listInterruptContinueCandidates, wasSessionManualStopped } from "./session-interrupt-watch-registry.js";

const log = getAppLogger("session-interrupt");

let monitor: SessionInterruptMonitor | undefined;

export function readSessionInterruptContinueMode(): SessionInterruptContinueMode {
	const settings = readAgentSettingsDocument();
	const raw = settings.sessionInterruptContinue;
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "notify";
	const mode = (raw as { mode?: unknown }).mode;
	if (mode === "off" || mode === "notify" || mode === "auto") return mode;
	return "notify";
}

export function readSessionInterruptMaxAttempts(): number {
	const settings = readAgentSettingsDocument();
	const raw = settings.sessionInterruptContinue;
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return 1;
	const max = (raw as { maxAttempts?: unknown }).maxAttempts;
	return typeof max === "number" && Number.isFinite(max) && max >= 1 ? Math.floor(max) : 1;
}

function hasPendingAction(sessionId: string): boolean {
	const questions = getDesktopUserQuestionBroker().listPendingQuestions();
	if (questions.some((item) => item.sessionId === sessionId)) return true;
	const plans = getDesktopPlanReviewBroker().listPending();
	if (plans.some((item) => item.sessionId === sessionId)) return true;
	const elicitations = getDesktopMcpElicitationBroker().listPending();
	if (elicitations.some((item) => item.sessionId === sessionId)) return true;
	return false;
}

/** 启动会话级中断续接监视器（默认 notify；settings.sessionInterruptContinue 可调）。 */
export function startSessionInterruptMonitor(
	sendToRenderer: (channel: string, payload: unknown) => void,
	resolveCwd?: (sessionId: string) => string | undefined,
): () => void {
	monitor?.stop();
	monitor = new SessionInterruptMonitor({
		getRuntime: getSharedRuntime,
		listCandidateSessionIds: listInterruptContinueCandidates,
		hasPendingAction,
		wasManualStopped: wasSessionManualStopped,
		readMode: readSessionInterruptContinueMode,
		readMaxAttempts: readSessionInterruptMaxAttempts,
		onDecision: (payload) => {
			const sessionPath = payload.sessionPath;
			const cwd = resolveCwd?.(payload.sessionId);
			sendToRenderer("vetta:session:interrupt-health", {
				sessionId: payload.sessionId,
				sessionPath: payload.sessionPath,
				state: payload.classification.state,
				trigger: payload.classification.trigger,
				action: payload.action,
				shouldAutoContinue: payload.classification.shouldAutoContinue,
				...(typeof cwd === "string" && cwd.length > 0 ? { cwd } : {}),
			});
			if (payload.action === "notify" && sessionPath && typeof cwd === "string" && cwd.length > 0) {
				notify({
					type: "agent-turn-complete",
					sessionPath,
					cwd,
					outcome: "error",
				});
			}
			log.info("Session interrupt decision", {
				sessionId: payload.sessionId,
				action: payload.action,
				state: payload.classification.state,
				trigger: payload.classification.trigger,
			});
		},
	});
	monitor.start();
	return () => {
		monitor?.stop();
		monitor = undefined;
	};
}

export function getSessionInterruptMonitor(): SessionInterruptMonitor | undefined {
	return monitor;
}

/**
 * 启动时扫描「上次退出时回复未正常完成」的会话（未闭合 Turn / 队列有待发条目），
 * 非空结果一次性推给 renderer 提醒。扫描只读且整体 fail-soft：任何环节失败只记
 * 日志，不影响启动路径。候选来自会话目录服务（自带 team 会话过滤），项目清单读
 * 自桌面配置，外加默认「对话」cwd。
 */
export async function runSessionInterruptStartupScan(
	sendToRenderer: (channel: string, payload: unknown) => void,
): Promise<void> {
	try {
		const sessions = await scanInterruptedSessionsOnStartup({
			listCandidates: listStartupScanCandidates,
			assessTurn: assessConversationInterruption,
			readQueueSnapshot: (sessionPath) => nodeRuntimeQueueSidecarStore.read(sessionPath),
			nowMs: () => Date.now(),
		});
		if (sessions.length === 0) return;
		sendToRenderer("vetta:session:interrupted-startup", { sessions });
		log.info("Session interrupt startup scan found unfinished sessions", { count: sessions.length });
	} catch (error) {
		log.warn("Session interrupt startup scan failed", {
			errorName: error instanceof Error ? error.name : "UnknownError",
		});
	}
}

async function listStartupScanCandidates(): Promise<readonly InterruptedStartupCandidate[]> {
	const cwds = new Set<string>([DEFAULT_CONVERSATION_CWD]);
	for (const project of readConfigSync().projects ?? []) {
		if (typeof project?.path === "string" && project.path.trim().length > 0) cwds.add(project.path);
	}
	const service = getDesktopConversationService();
	const candidates: InterruptedStartupCandidate[] = [];
	for (const cwd of cwds) {
		try {
			const sessions = await service.listSessions(cwd);
			for (const session of sessions) {
				candidates.push({
					sessionId: session.id,
					sessionPath: session.path,
					cwd: session.cwd,
					...(session.name !== undefined ? { name: session.name } : {}),
					modifiedAt: session.modifiedAt,
				});
			}
		} catch (error) {
			// 单个项目（如已卸载的 SSH 主机）列举失败不影响其余项目。
			log.warn("Session interrupt startup scan skipped one project", {
				errorName: error instanceof Error ? error.name : "UnknownError",
			});
		}
	}
	return candidates;
}
