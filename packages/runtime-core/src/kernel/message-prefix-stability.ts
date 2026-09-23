// Copyright The Open Forge contributors.

import type { Message } from "@vetta/ai";
import { messagesEqual } from "./runtime-message-context.js";

/**
 * 相邻两次模型调用投影的前缀稳定性分类。
 *
 * - `first`：本 Turn 首次观测，无前序投影可比较。
 * - `append_only`：前序投影完整保留，仅在尾部追加（Provider 前缀缓存的健康态）。
 * - `prefix_rewrite`：稳定前缀中间出现内容分歧（衰减翻转、扩展改写或意外漂移）。
 * - `prefix_shrink`：当前投影是前序投影的截短（重试回退等尾部收缩）。
 */
export type MessagePrefixStabilityKind = "first" | "append_only" | "prefix_rewrite" | "prefix_shrink";

export interface MessagePrefixComparison {
	readonly kind: MessagePrefixStabilityKind;
	readonly previousMessageCount: number;
	readonly currentMessageCount: number;
	/** 内容级稳定前缀的消息条数；`first` 时为 0。 */
	readonly stablePrefixMessageCount: number;
	/** 第一个内容分歧的消息下标；仅 `prefix_rewrite` 时提供。 */
	readonly firstDivergenceIndex?: number;
	/** `===` 未命中但内容一致的消息数——transformer 引用保持合同违约（身份抖动）的可观测信号。 */
	readonly contentFallbackCount: number;
}

export interface MessagePrefixStabilityTracker {
	/** 以本次模型调用的最终消息投影推进状态；每次模型调用恰好调用一次。 */
	observe(messages: readonly Message[]): MessagePrefixComparison;
}

/**
 * Turn 级前缀稳定性追踪器：持有上一次观测的投影引用，只保留最近一次快照，不随调用数增长。
 * 生命周期随引擎 Turn 闭包结束自然释放；内核不持有跨 Turn 状态。
 */
export function createMessagePrefixStabilityTracker(): MessagePrefixStabilityTracker {
	let previous: readonly Message[] | undefined;
	return {
		observe(messages) {
			const comparison = compareMessagePrefixes(previous, messages);
			previous = messages;
			return comparison;
		},
	};
}

/**
 * 计算相邻两次模型调用投影的最长稳定前缀。
 *
 * 相等性与 `reconcileRuntimeMessageEnvelopes` 共用 `messagesEqual`（对象身份快路径 +
 * 归一化内容比较回退），保证跨投影的对象重建（custom/context 记录转换、思考块剪枝重建）
 * 不被误报为前缀改写。比较在首个分歧处停止，成本为 O(分歧点) 而非 O(历史)。
 */
export function compareMessagePrefixes(
	previous: readonly Message[] | undefined,
	current: readonly Message[],
): MessagePrefixComparison {
	const currentMessageCount = current.length;
	if (!previous) {
		return {
			kind: "first",
			previousMessageCount: 0,
			currentMessageCount,
			stablePrefixMessageCount: 0,
			contentFallbackCount: 0,
		};
	}
	const previousMessageCount = previous.length;
	const sharedLength = Math.min(previousMessageCount, currentMessageCount);
	let stablePrefixMessageCount = 0;
	let contentFallbackCount = 0;
	let firstDivergenceIndex: number | undefined;
	for (let index = 0; index < sharedLength; index += 1) {
		if (previous[index] === current[index]) {
			stablePrefixMessageCount = index + 1;
			continue;
		}
		if (messagesEqual(previous[index], current[index])) {
			stablePrefixMessageCount = index + 1;
			contentFallbackCount += 1;
			continue;
		}
		firstDivergenceIndex = index;
		break;
	}
	if (firstDivergenceIndex !== undefined) {
		return {
			kind: "prefix_rewrite",
			previousMessageCount,
			currentMessageCount,
			stablePrefixMessageCount,
			firstDivergenceIndex,
			contentFallbackCount,
		};
	}
	if (currentMessageCount < previousMessageCount) {
		return {
			kind: "prefix_shrink",
			previousMessageCount,
			currentMessageCount,
			stablePrefixMessageCount: currentMessageCount,
			contentFallbackCount,
		};
	}
	return {
		kind: "append_only",
		previousMessageCount,
		currentMessageCount,
		stablePrefixMessageCount: previousMessageCount,
		contentFallbackCount,
	};
}
