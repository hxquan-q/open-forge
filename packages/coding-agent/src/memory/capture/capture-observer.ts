// Modified by The Open Forge contributors.
import type { StoredSessionEvent } from "@vetta/runtime-core/kernel";

/**
 * 捕获 Observer（TASK-0379）：把合法来源（user 文本 / 助手最终可见正文 /
 * 经许可的 tool outcome 引用）过滤后交给持久队列；排除 thinking、系统/
 * 开发指令、凭据与原始二进制。崩溃对账由高水位补偿，不做全量回扫。
 */

export interface CaptureCandidate {
	readonly sourceId: string;
	readonly cursor: string;
	readonly role: "user-input" | "assistant-output" | "tool-outcome";
	readonly text: string;
}

export interface CaptureObserverOptions {
	readonly extractorVersion: string;
	readonly allowToolOutcomes?: boolean;
}

/** 从已提交会话事件提取捕获候选（纯函数；过滤规则是本模块合同）。 */
export function extractCaptureCandidates(
	events: readonly StoredSessionEvent[],
	options: CaptureObserverOptions,
): readonly CaptureCandidate[] {
	const candidates: CaptureCandidate[] = [];
	for (const event of events) {
		if (event.type === "message.appended") {
			const message = event.message;
			const cursor = `${event.turnId}:${message.role}`;
			if (message.role === "user") {
				const text = messageContentText(message.content);
				if (text !== "") {
					candidates.push({
						sourceId: `session/${event.turnId}/${message.role}`,
						cursor,
						role: "user-input",
						text,
					});
				}
			} else if (message.role === "assistant") {
				const text = messageContentText(message.content);
				if (text !== "") {
					candidates.push({
						sourceId: `session/${event.turnId}/${message.role}`,
						cursor,
						role: "assistant-output",
						text,
					});
				}
			}
			continue;
		}
		if (event.type === "turn.completed") {
			// 工具结果引用只在显式允许时作为候选（证据引用，不复制大段输出）。
			if (options.allowToolOutcomes === true) {
				candidates.push({
					sourceId: `session/turn/${event.turnId}/outcome-ref`,
					cursor: `turn-${event.turnId}`,
					role: "tool-outcome",
					text: "",
				});
			}
		}
	}
	return candidates;
}

function messageContentText(content: unknown): string {
	if (typeof content === "string") return content.trim();
	if (Array.isArray(content)) {
		return content
			.map((part) => {
				if (typeof part === "string") return part;
				if (
					part !== null &&
					typeof part === "object" &&
					(part as { type?: unknown }).type === "text" &&
					typeof (part as { text: unknown }).text === "string"
				) {
					return (part as { text: string }).text;
				}
				return "";
			})
			.join("")
			.trim();
	}
	return "";
}

/** 入队过滤：排除空载荷与超界文本（引用型候选除外）。 */
export function shouldEnqueue(candidate: CaptureCandidate): boolean {
	if (candidate.role === "tool-outcome") return true;
	return candidate.text !== "" && candidate.text.length <= 8_000;
}
