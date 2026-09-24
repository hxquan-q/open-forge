/**
 * Layer 1: Microcompact — lightweight context pruning.
 *
 * Clears old tool result / bash execution content and strips thinking blocks
 * from old assistant messages to reduce context size without calling the LLM.
 * Runs as a pure function on every LLM call via transformContext.
 */

import type { AgentMessage } from "@vetta/agent-core";
import type { AssistantMessage, ToolResultMessage } from "@vetta/ai";
import type { BashExecutionMessage } from "../model-context/index.js";

export interface MicrocompactOptions {
	/** Always keep the N most recent compactable results intact. */
	keepRecent: number;
	/** Only clear results older than this (ms). 0 = skip time check, prune by count only. */
	maxAgeMs: number;
	/** Disable count-based ToolResult pruning when a pressure-aware policy owns that responsibility. */
	pruneToolResults?: boolean;
	/** Fixed evaluation time used to keep every model call in one Turn deterministic. */
	now?: number;
	/**
	 * Turn 冻结的 thinking 清除判定：提供时跳过滑动计数尾窗，只清除判定命中的
	 * assistant 消息（判定命中即清，keepRecent 让位）。判定集合由调用方在 Turn
	 * 准入时按 `selectDecayedThinkingIndices` 的同一计数规则一次性算定，Turn 内
	 * append-only——已见消息的剪枝决策不随消息追加滑动。
	 */
	frozenThinkingClear?: (message: AssistantMessage) => boolean;
}

export const DEFAULT_MICROCOMPACT_OPTIONS: MicrocompactOptions = {
	keepRecent: 8,
	maxAgeMs: 30 * 1000, // 30 seconds
};

const CLEARED_MESSAGE = "[tool result cleared — old context]";

/** Roles whose content can be pruned. */
const COMPACTABLE_ROLES = new Set(["toolResult", "bashExecution"]);

/**
 * Microcompact: prune old tool results, bash outputs, and thinking blocks.
 *
 * Algorithm:
 * 1. Prune tool results / bash outputs:
 *    a. Collect indices of compactable messages (toolResult / bashExecution).
 *    b. The last `keepRecent` are always protected.
 *    c. For unprotected messages, if `maxAgeMs > 0`, only clear those older
 *       than `now - maxAgeMs`. If `maxAgeMs === 0`, clear all unprotected.
 * 2. Prune thinking blocks from old assistant messages:
 *    a. Collect indices of assistant messages that contain thinking blocks.
 *    b. The last `keepRecent` are protected (same parameter).
 *    c. For unprotected: if thinking has a signature, keep signature but clear
 *       text (Anthropic can reconstruct from signature). Otherwise remove the
 *       thinking block entirely.
 * 3. Return a new array with cleared messages (shallow copy; only touched
 *    messages are new objects). Already-cleared messages reuse their original
 *    object identity, so rerunning on pruned output is a no-op (pure & idempotent).
 */
export function microcompact(
	messages: AgentMessage[],
	options: MicrocompactOptions = DEFAULT_MICROCOMPACT_OPTIONS,
): AgentMessage[] {
	let result = messages;
	if (options.pruneToolResults !== false) result = pruneToolResults(result, options);
	result = pruneThinkingBlocks(result, options);
	return result;
}

/**
 * Prune old tool result and bash execution content.
 */
function pruneToolResults(messages: AgentMessage[], options: MicrocompactOptions): AgentMessage[] {
	const compactableIndices: number[] = [];
	for (let i = 0; i < messages.length; i++) {
		if (COMPACTABLE_ROLES.has(messages[i].role)) {
			compactableIndices.push(i);
		}
	}

	if (compactableIndices.length <= options.keepRecent) {
		return messages;
	}

	const clearCandidates = compactableIndices.slice(0, -options.keepRecent);
	const now = options.now ?? Date.now();
	const clearSet = new Set<number>();

	for (const idx of clearCandidates) {
		const msg = messages[idx];
		if (options.maxAgeMs > 0) {
			const ts = (msg as ToolResultMessage | BashExecutionMessage).timestamp;
			if (ts && now - ts >= options.maxAgeMs) {
				clearSet.add(idx);
			}
		} else {
			clearSet.add(idx);
		}
	}

	if (clearSet.size === 0) {
		return messages;
	}

	const result = new Array<AgentMessage>(messages.length);
	for (let i = 0; i < messages.length; i++) {
		if (!clearSet.has(i)) {
			result[i] = messages[i];
			continue;
		}

		const msg = messages[i];
		if (msg.role === "toolResult") {
			const tr = msg as ToolResultMessage;
			if (tr.content.length === 1 && tr.content[0].type === "text" && tr.content[0].text === CLEARED_MESSAGE) {
				result[i] = msg;
				continue;
			}
			result[i] = {
				...tr,
				content: [{ type: "text", text: CLEARED_MESSAGE }],
			};
		} else if (msg.role === "bashExecution") {
			const bash = msg as BashExecutionMessage;
			if (bash.output === CLEARED_MESSAGE) {
				result[i] = msg;
				continue;
			}
			result[i] = { ...bash, output: CLEARED_MESSAGE };
		} else {
			result[i] = msg;
		}
	}
	return result;
}

/**
 * Collect indices of assistant messages that still carry thinking blocks.
 */
function thinkingMessageIndices(messages: readonly AgentMessage[]): number[] {
	const thinkingIndices: number[] = [];
	for (let i = 0; i < messages.length; i++) {
		const msg = messages[i];
		if (msg.role === "assistant") {
			const asst = msg as AssistantMessage;
			if (asst.content.some((b) => b.type === "thinking")) {
				thinkingIndices.push(i);
			}
		}
	}
	return thinkingIndices;
}

/**
 * 滑动计数尾窗（keepRecent）之外、将被衰减清除的 assistant 消息下标。
 * 纯计数坐标（出窗即清），与 `pruneThinkingBlocks` 的默认选择共用同一规则；
 * Turn 冻结剪枝边界（model-call-context-projection）据此在 Turn 准入时一次性冻结清除集合。
 */
export function selectDecayedThinkingIndices(messages: readonly AgentMessage[], keepRecent: number): number[] {
	const thinkingIndices = thinkingMessageIndices(messages);
	return thinkingIndices.slice(0, Math.max(0, thinkingIndices.length - keepRecent));
}

/**
 * Strip thinking blocks from old assistant messages.
 *
 * - With thinkingSignature (Anthropic): keep signature, clear text (API reconstructs)
 * - Without signature (other providers): remove thinking block entirely
 * - Already cleared messages keep their object identity (idempotent rerun)
 */
function pruneThinkingBlocks(messages: AgentMessage[], options: MicrocompactOptions): AgentMessage[] {
	// 清除候选：默认滑动计数尾窗（出窗即清）；Turn 冻结判定命中优先——
	// 集合在 Turn 准入时已按 keepRecent 算定，这里只做成员判定，不再看窗口。
	const frozenClear = options.frozenThinkingClear;
	const clearCandidates = frozenClear
		? thinkingMessageIndices(messages).filter((idx) => frozenClear(messages[idx] as AssistantMessage))
		: selectDecayedThinkingIndices(messages, options.keepRecent);

	if (clearCandidates.length === 0) {
		return messages;
	}

	const now = options.now ?? Date.now();
	const clearSet = new Set<number>();

	for (const idx of clearCandidates) {
		const msg = messages[idx] as AssistantMessage;
		if (options.maxAgeMs > 0) {
			if (msg.timestamp && now - msg.timestamp >= options.maxAgeMs) {
				clearSet.add(idx);
			}
		} else {
			clearSet.add(idx);
		}
	}

	if (clearSet.size === 0) {
		return messages;
	}

	let changed = false;
	const result = new Array<AgentMessage>(messages.length);
	for (let i = 0; i < messages.length; i++) {
		if (!clearSet.has(i)) {
			result[i] = messages[i];
			continue;
		}

		const pruned = pruneThinkingMessage(messages[i] as AssistantMessage);
		if (pruned !== messages[i]) {
			changed = true;
		}
		result[i] = pruned;
	}
	// 幂等早退：候选已全部清空时保持原数组与原消息身份，镜像 pruneToolResults
	// 的 CLEARED_MESSAGE 复用——否则每次调用重建对象，身份churn击穿
	// prefix-stability 观察器的全等快路径。
	return changed ? result : messages;
}

/**
 * 清除单条 assistant 消息的 thinking 内容：返回原对象表示无需改写（已清空）。
 *
 * - 带签名的 thinking 块：文本为空时保留原块引用；否则保留签名、清空文本
 * - 无签名的 thinking 块：整块移除
 */
function pruneThinkingMessage(asst: AssistantMessage): AssistantMessage {
	// 清除结果的 WeakMap 备忘：清除是消息值的纯函数，同一源消息在相邻模型调用间
	// 重复投影时复用同一对象——身份稳定直达 prefix-stability 观察器的全等快路径。
	const cached = prunedThinkingFormCache.get(asst);
	if (cached) return cached;

	let changed = false;
	const newContent: AssistantMessage["content"] = [];
	for (const block of asst.content) {
		if (block.type !== "thinking") {
			newContent.push(block);
			continue;
		}
		// Has signature: keep it, API can reconstruct thinking content
		if (block.thinkingSignature) {
			if (block.thinking === "") {
				newContent.push(block);
				continue;
			}
			changed = true;
			newContent.push({ ...block, thinking: "" });
			continue;
		}
		// No signature: remove entirely
		changed = true;
	}

	if (!changed) {
		return asst;
	}
	const pruned = { ...asst, content: newContent };
	prunedThinkingFormCache.set(asst, pruned);
	return pruned;
}

/** 已清空形态备忘：WeakMap 以源消息为键，不延长消息生命周期。 */
const prunedThinkingFormCache = new WeakMap<AssistantMessage, AssistantMessage>();
