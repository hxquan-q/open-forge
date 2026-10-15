// Copyright The Open Forge contributors.
import { readFile } from "node:fs/promises";
import { FailInterruptedTurnRecoveryPolicy } from "@vetta/runtime-core/kernel";
import { conversationFromFile, parseConversationFile } from "./conversation-file-codec.js";

/**
 * 会话文件的中断评估结果。
 *
 * - `interrupted`：存在唯一未闭合 Turn（崩溃/强退在 turn 中途）；
 * - `ready`：历史生命周期完整，无需收敛；
 * - `unreadable`：文件缺失、损坏或协议非法——调用方 fail-soft 跳过，
 *   真正的恢复裁决仍由打开会话时的 `resumeSession` 负责。
 */
export type ConversationInterruptionAssessment = "interrupted" | "ready" | "unreadable";

/**
 * 只读判定一个会话 jsonl 是否以未闭合 Turn 收尾。
 *
 * 与 `TurnPipeline.resumeSession` 共用同一个 `FailInterruptedTurnRecoveryPolicy`，
 * 保证「启动扫描的报告口径」与「重开时的收敛口径」永远一致；本函数不追加任何
 * 事件、不取文件锁，可以在会话未被打开时安全调用。
 */
export async function assessConversationInterruption(
	sessionId: string,
	sessionPath: string,
): Promise<ConversationInterruptionAssessment> {
	try {
		const text = await readFile(sessionPath, "utf8");
		const conversation = conversationFromFile(sessionId, parseConversationFile(text, sessionId));
		return new FailInterruptedTurnRecoveryPolicy().plan(conversation).status === "interrupt"
			? "interrupted"
			: "ready";
	} catch {
		return "unreadable";
	}
}
