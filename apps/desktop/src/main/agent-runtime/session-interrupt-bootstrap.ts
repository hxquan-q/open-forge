// Copyright The Open Forge contributors.
import { readAgentSettingsDocument } from "../agent-settings/settings-document-store.js";
import { getDesktopMcpElicitationBroker } from "../conversations/mcp-elicitation-broker.js";
import { getDesktopPlanReviewBroker } from "../conversations/plan-review-broker.js";
import { getDesktopUserQuestionBroker } from "../conversations/user-question-broker.js";
import { getAppLogger } from "../logger.js";
import { notify } from "../notifications/index.js";
import { getSharedRuntime } from "../runtime.js";
import { type SessionInterruptContinueMode, SessionInterruptMonitor } from "./session-interrupt-monitor.js";
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
			sendToRenderer("vetta:session:interrupt-health", {
				sessionId: payload.sessionId,
				sessionPath: payload.sessionPath,
				state: payload.classification.state,
				trigger: payload.classification.trigger,
				action: payload.action,
				shouldAutoContinue: payload.classification.shouldAutoContinue,
			});
			const sessionPath = payload.sessionPath;
			const cwd = resolveCwd?.(payload.sessionId);
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
