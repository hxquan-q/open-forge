// Copyright The Open Forge contributors.
/**
 * 会话级中断续接：从 Runtime 消息与宿主旁路信号装配纯判定证据。
 */
import type { Message } from "@vetta/ai";
import type { SessionInterruptEvidence, SessionInterruptStopReason } from "@vetta/coding-agent/runtime";

export interface SessionInterruptEvidenceParts {
	readonly isStreaming: boolean;
	readonly messages: readonly Message[];
	readonly nowMs: number;
	readonly manualStop: boolean;
	readonly draftNonEmpty: boolean;
	readonly hasPendingAction: boolean;
	readonly continueAttemptCount: number;
	readonly maxContinueAttempts: number;
	/**
	 * 逐事件活动证据（宿主中继观察到的最近事件时间戳）。streaming 会话必须走
	 * 该证据：消息时间戳无法区分「健康长回合」与「零事件悬挂」（turn 进行中
	 * 助手消息尚未落盘，健康长回合的消息 idle 同样会持续增大）。缺省时退回
	 * 消息时间戳（仅对非 streaming 判定足够）。
	 */
	readonly activityAtMs?: number;
}

export function buildSessionInterruptEvidence(parts: SessionInterruptEvidenceParts): SessionInterruptEvidence {
	const lastAssistant = findLastAssistant(parts.messages);
	const stopReason = normalizeStopReason(lastAssistant?.stopReason);
	const errorMessage = lastAssistant?.errorMessage ?? lastAssistant?.failure?.message ?? null;
	const lastActivityAt = parts.activityAtMs ?? lastActivityTimestamp(parts.messages);
	const idleMs = Math.max(0, parts.nowMs - lastActivityAt);
	const hasCompletionMarker =
		stopReason === "stop" && lastAssistant !== undefined && assistantLooksComplete(lastAssistant);

	return {
		isStreaming: parts.isStreaming,
		idleMs,
		stopReason,
		errorMessage,
		manualStop: parts.manualStop,
		draftNonEmpty: parts.draftNonEmpty,
		hasPendingAction: parts.hasPendingAction,
		hasCompletionMarker,
		continueAttemptCount: parts.continueAttemptCount,
		maxContinueAttempts: parts.maxContinueAttempts,
	};
}

function findLastAssistant(messages: readonly Message[]) {
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		const message = messages[i];
		if (message?.role === "assistant") return message;
	}
	return undefined;
}

function normalizeStopReason(reason: string | undefined): SessionInterruptStopReason | null {
	if (reason === "stop" || reason === "length" || reason === "toolUse" || reason === "error" || reason === "aborted") {
		return reason;
	}
	return null;
}

function assistantLooksComplete(message: Extract<Message, { role: "assistant" }>): boolean {
	return message.content.some((part) => {
		if (part.type === "text") return part.text.trim().length > 0;
		if (part.type === "toolCall") return true;
		return false;
	});
}

function lastActivityTimestamp(messages: readonly Message[]): number {
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		const message = messages[i];
		if (message && typeof message.timestamp === "number" && Number.isFinite(message.timestamp)) {
			return message.timestamp;
		}
	}
	return 0;
}
