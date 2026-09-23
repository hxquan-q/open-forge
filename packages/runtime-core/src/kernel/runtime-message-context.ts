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
	return left === right || JSON.stringify(normalizeTextContent(left)) === JSON.stringify(normalizeTextContent(right));
}

/** `string` 与单个文本块是等价的 UserMessage 表达，不能因此丢失产品消息身份。 */
function normalizeTextContent(message: Message): Message {
	if (typeof message.content !== "string") return message;
	return { ...message, content: [{ type: "text", text: message.content }] };
}
