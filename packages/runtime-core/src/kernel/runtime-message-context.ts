// Modified by The Open Forge contributors.

import type { Message } from "@vetta/ai";
import type { RuntimeMessageEnvelope } from "../runtime-execution-observation.js";

export function toRuntimeMessageEnvelope(message: Message): RuntimeMessageEnvelope {
	return { kind: "message", message };
}

/** 将产品身份候选与 Context Strategy 的最终模型视图重新对齐。 */
export function reconcileRuntimeMessageEnvelopes(
	messages: readonly Message[],
	candidates: readonly RuntimeMessageEnvelope[],
): RuntimeMessageEnvelope[] {
	const result: RuntimeMessageEnvelope[] = [];
	let candidateIndex = 0;
	for (const message of messages) {
		let matchIndex = -1;
		for (let index = candidateIndex; index < candidates.length; index += 1) {
			const projected = projectRuntimeMessageEnvelope(candidates[index]);
			if (projected && messagesEqual(projected, message)) {
				matchIndex = index;
				break;
			}
		}
		if (matchIndex < 0) {
			result.push(toRuntimeMessageEnvelope(message));
			continue;
		}
		for (let index = candidateIndex; index < matchIndex; index += 1) {
			if (!projectRuntimeMessageEnvelope(candidates[index])) result.push(candidates[index]);
		}
		result.push(candidates[matchIndex]);
		candidateIndex = matchIndex + 1;
	}
	for (let index = candidateIndex; index < candidates.length; index += 1) {
		if (!projectRuntimeMessageEnvelope(candidates[index])) result.push(candidates[index]);
	}
	return result;
}

export function projectRuntimeMessageEnvelope(envelope: RuntimeMessageEnvelope): Message | undefined {
	if (envelope.kind === "message") return envelope.message;
	if (envelope.kind === "opaque") return envelope.modelMessage;
	if (!envelope.record.modelVisible) return undefined;
	return {
		role: "user",
		content: envelope.record.content,
		timestamp: envelope.timestamp,
	};
}

/**
 * 内核唯一的模型消息相等性定义：对象身份快路径 + 归一化内容比较回退。
 * `reconcileRuntimeMessageEnvelopes` 与消息前缀稳定性度量（`message-prefix-stability.ts`）
 * 共用本函数，避免两处语义漂移。
 */
export function messagesEqual(left: Message, right: Message): boolean {
	return left === right || serializeMessage(left) === serializeMessage(right);
}

/** 每消息对象的规范化序列化缓存：重复判等（相邻调用的前缀比较）不再重序列化。 */
const messageSerializationCache = new WeakMap<Message, string>();

function serializeMessage(message: Message): string {
	const cached = messageSerializationCache.get(message);
	if (cached !== undefined) return cached;
	const serialized = stableStringify(normalizeTextContent(message));
	messageSerializationCache.set(message, serialized);
	return serialized;
}

/** `string` 与单个文本块是等价的 UserMessage 表达，不能因此丢失产品消息身份。 */
function normalizeTextContent(message: Message): Message {
	if (typeof message.content !== "string") return message;
	return { ...message, content: [{ type: "text", text: message.content }] };
}

/**
 * 键序无关的确定性序列化：对象键按字典序排列后递归序列化，使内容判等对属性
 * 插入序不敏感——投影重建消息的键序漂移不再被误判为内容分歧（false prefix_rewrite
 * 会污染稳定性审计信号）。undefined 与函数值的键按 JSON.stringify 语义省略。
 */
function stableStringify(value: unknown): string {
	if (typeof value !== "object" || value === null) {
		return JSON.stringify(value) ?? "undefined";
	}
	if (Array.isArray(value)) {
		return `[${value.map((element) => stableStringify(element)).join(",")}]`;
	}
	const entries = Object.entries(value).filter(
		([, element]) => element !== undefined && typeof element !== "function",
	);
	entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
	return `{${entries.map(([key, element]) => `${JSON.stringify(key)}:${stableStringify(element)}`).join(",")}}`;
}
