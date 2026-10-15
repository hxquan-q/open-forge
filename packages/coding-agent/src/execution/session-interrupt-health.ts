// Copyright The Open Forge contributors.
/**
 * 会话级异常中断续接：纯判定矩阵（与 turn 内 silent-turn 互补）。
 *
 * 仅三因触发自动续：error / networkFailure / truncated。
 * 否决：manualStop、非空草稿、完成标记、待审动作区、置信度不足（suspected）。
 * 绑定闸门与续跑决策共用本函数，避免「监视绑定」与「实际续跑」规则错位。
 */
import { isRetryableRuntimeError } from "./failure-classification.js";

export type SessionInterruptHealthState =
	| "blocked"
	| "error"
	| "running"
	| "stopped"
	| "settling"
	| "completed"
	| "suspected";

export type SessionInterruptTrigger = "error" | "networkFailure" | "truncated";

export type SessionInterruptVeto =
	| "manualStop"
	| "nonEmptyDraft"
	| "completionMarker"
	| "pendingAction"
	| "insufficientConfidence"
	| "attemptBudgetExhausted";

export type SessionInterruptConfidence = "high" | "medium" | "low";

export type SessionInterruptStopReason = "stop" | "length" | "toolUse" | "error" | "aborted";

/** 巡检器从宿主装配的证据；判定层不读 I/O。 */
export interface SessionInterruptEvidence {
	readonly isStreaming: boolean;
	/** 距最近一次消息/流活动的空闲毫秒（单调时钟差）。 */
	readonly idleMs: number;
	readonly stopReason: SessionInterruptStopReason | null;
	readonly errorMessage: string | null;
	/** 用户主动中止（IPC abort / stopReason aborted）。 */
	readonly manualStop: boolean;
	readonly draftNonEmpty: boolean;
	/** 待审：用户提问、计划审批、MCP elicitation、沙箱授权等。 */
	readonly hasPendingAction: boolean;
	/** 末轮助手已正常 stop 且带完成证据（可见正文或工具结果已收齐）。 */
	readonly hasCompletionMarker: boolean;
	readonly continueAttemptCount: number;
	readonly maxContinueAttempts: number;
}

export interface SessionInterruptClassification {
	readonly state: SessionInterruptHealthState;
	readonly confidence: SessionInterruptConfidence;
	readonly trigger: SessionInterruptTrigger | null;
	readonly vetoes: readonly SessionInterruptVeto[];
	/** 命中触发且无否决、置信度足够时为 true（模式无关；宿主再看 notify/auto）。 */
	readonly shouldAutoContinue: boolean;
	/** suspected 或硬否决以外的可观察中断，供宿主提示。 */
	readonly shouldNotify: boolean;
	/**
	 * 绑定闸门：与「会被纳入续接处理」的会话一致。
	 * 有 trigger 或 suspected、且无硬否决（manualStop / draft / pending / completion）即可绑定。
	 */
	readonly eligibleForBinding: boolean;
}

/** 短空闲：仍可能在 settling（流结束后 UI/索引滞后）。 */
export const SESSION_INTERRUPT_SETTLING_IDLE_MS = 2_500;
/** 长空闲：若无完成证据则进入 suspected，不自动发。 */
export const SESSION_INTERRUPT_SUSPECT_IDLE_MS = 8_000;
/**
 * 流式悬挂：streaming 期间零事件活动超过该窗口即视为异常。
 * 必须大于 provider 零事件看门狗窗口（180s）与重试退避的和——停滞恢复循环
 * 本身会周期发射 retry 事件（活动证据），只有恢复循环之外/已死的悬挂才会
 * 跨越该阈值。
 */
export const SESSION_INTERRUPT_STREAM_STALL_IDLE_MS = 240_000;

export function classifySessionInterruptHealth(evidence: SessionInterruptEvidence): SessionInterruptClassification {
	const vetoes: SessionInterruptVeto[] = [];

	if (evidence.manualStop || evidence.stopReason === "aborted") {
		vetoes.push("manualStop");
	}
	if (evidence.draftNonEmpty) vetoes.push("nonEmptyDraft");
	if (evidence.hasPendingAction) vetoes.push("pendingAction");
	if (evidence.hasCompletionMarker && evidence.stopReason === "stop") {
		vetoes.push("completionMarker");
	}
	if (evidence.continueAttemptCount >= evidence.maxContinueAttempts) {
		vetoes.push("attemptBudgetExhausted");
	}

	if (evidence.isStreaming) {
		if (evidence.idleMs < SESSION_INTERRUPT_STREAM_STALL_IDLE_MS) {
			return buildResult({
				state: "running",
				confidence: "high",
				trigger: null,
				vetoes,
			});
		}
		// 零事件悬挂：streaming 期间远超 provider 看门狗窗口仍无任何事件活动，
		// 只剩「turn 悬挂」与「活动证据失修」两种解释——两者都必须浮出水面。
		// 手动停止/待审交互是合法安静，保持否决；置信度不足故只提示不自动续。
		if (vetoes.includes("manualStop")) {
			return buildResult({ state: "stopped", confidence: "high", trigger: null, vetoes });
		}
		if (vetoes.includes("pendingAction")) {
			return buildResult({ state: "blocked", confidence: "high", trigger: null, vetoes });
		}
		if (!vetoes.includes("insufficientConfidence")) vetoes.push("insufficientConfidence");
		return buildResult({
			state: "suspected",
			confidence: "low",
			trigger: null,
			vetoes,
		});
	}

	if (evidence.idleMs < SESSION_INTERRUPT_SETTLING_IDLE_MS) {
		return buildResult({
			state: "settling",
			confidence: "medium",
			trigger: null,
			vetoes,
		});
	}

	if (vetoes.includes("manualStop")) {
		return buildResult({
			state: "stopped",
			confidence: "high",
			trigger: null,
			vetoes,
		});
	}
	if (vetoes.includes("pendingAction")) {
		return buildResult({
			state: "blocked",
			confidence: "high",
			trigger: null,
			vetoes,
		});
	}
	if (vetoes.includes("completionMarker")) {
		return buildResult({
			state: "completed",
			confidence: "high",
			trigger: null,
			vetoes,
		});
	}

	const trigger = resolveTrigger(evidence);
	if (!trigger) {
		if (evidence.idleMs >= SESSION_INTERRUPT_SUSPECT_IDLE_MS && !evidence.hasCompletionMarker) {
			if (!vetoes.includes("insufficientConfidence")) vetoes.push("insufficientConfidence");
			return buildResult({
				state: "suspected",
				confidence: "low",
				trigger: null,
				vetoes,
			});
		}
		return buildResult({
			state: "stopped",
			confidence: "medium",
			trigger: null,
			vetoes,
		});
	}

	const confidence = confidenceForTrigger(trigger, evidence);
	if (confidence === "low") {
		if (!vetoes.includes("insufficientConfidence")) vetoes.push("insufficientConfidence");
		return buildResult({
			state: "suspected",
			confidence: "low",
			trigger,
			vetoes,
		});
	}

	return buildResult({
		state: "error",
		confidence,
		trigger,
		vetoes,
	});
}

/** 绑定闸门：与 classify 同源，避免第二套规则。 */
export function isSessionInterruptEligibleForBinding(classification: SessionInterruptClassification): boolean {
	return classification.eligibleForBinding;
}

function resolveTrigger(evidence: SessionInterruptEvidence): SessionInterruptTrigger | null {
	if (evidence.stopReason === "length") return "truncated";
	if (evidence.stopReason !== "error") return null;
	const message = evidence.errorMessage ?? "";
	if (isNetworkFailureMessage(message)) return "networkFailure";
	return "error";
}

function isNetworkFailureMessage(message: string): boolean {
	if (!message) return false;
	return (
		isRetryableRuntimeError(message) &&
		/network|connection|ECONN|ENOTFOUND|ETIMEDOUT|fetch failed|other side closed|socket|TLS|DNS|offline|unreachable/i.test(
			message,
		)
	);
}

function confidenceForTrigger(
	trigger: SessionInterruptTrigger,
	evidence: SessionInterruptEvidence,
): SessionInterruptConfidence {
	if (trigger === "truncated" && evidence.stopReason === "length") return "high";
	if (trigger === "networkFailure" && (evidence.errorMessage?.length ?? 0) > 0) return "high";
	if (trigger === "error" && (evidence.errorMessage?.length ?? 0) > 0) return "high";
	if (evidence.idleMs >= SESSION_INTERRUPT_SUSPECT_IDLE_MS) return "low";
	return "medium";
}

function hasHardVeto(vetoes: readonly SessionInterruptVeto[]): boolean {
	return vetoes.some(
		(v) =>
			v === "manualStop" ||
			v === "nonEmptyDraft" ||
			v === "pendingAction" ||
			v === "completionMarker" ||
			v === "attemptBudgetExhausted" ||
			v === "insufficientConfidence",
	);
}

function buildResult(input: {
	readonly state: SessionInterruptHealthState;
	readonly confidence: SessionInterruptConfidence;
	readonly trigger: SessionInterruptTrigger | null;
	readonly vetoes: readonly SessionInterruptVeto[];
}): SessionInterruptClassification {
	const hard = hasHardVeto(input.vetoes);
	const shouldAutoContinue =
		Boolean(input.trigger) && !hard && input.confidence !== "low" && input.state !== "suspected";
	const shouldNotify =
		input.state === "suspected" ||
		(Boolean(input.trigger) && !input.vetoes.includes("manualStop") && !shouldAutoContinue);
	const eligibleForBinding =
		!input.vetoes.includes("manualStop") &&
		!input.vetoes.includes("nonEmptyDraft") &&
		!input.vetoes.includes("pendingAction") &&
		!input.vetoes.includes("completionMarker") &&
		(Boolean(input.trigger) || input.state === "suspected");

	return {
		state: input.state,
		confidence: input.confidence,
		trigger: input.trigger,
		vetoes: Object.freeze([...input.vetoes]),
		shouldAutoContinue,
		shouldNotify,
		eligibleForBinding,
	};
}
