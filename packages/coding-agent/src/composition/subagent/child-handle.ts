// Modified by The Open Forge contributors.
import type { AssistantMessage, Message } from "@vetta/ai";
import type { RuntimeActiveSession, RuntimeTurnPromptOutcome } from "@vetta/runtime-core";
import type { SessionContextRecord } from "@vetta/runtime-core/kernel";
import type { SubagentChildHandle, SubagentUsageSnapshot } from "@vetta/runtime-subagents";
import {
	CODING_AGENT_TODO_READ,
	readCodingAgentTodoObservation,
} from "../../features/todo/todo-session-extension-contract.js";

export interface CodingAgentSubagentChildHandleOptions {
	readonly session: RuntimeActiveSession;
	readonly sessionFile?: string;
	appendContext(records: readonly SessionContextRecord[]): void;
	deliverContext(records: readonly SessionContextRecord[]): Promise<void>;
	disposeComposition(): Promise<void>;
	onTodoItemsChanged?(items: readonly { readonly status: string }[]): void;
}

/** 将 Coding Agent Session 收窄为通用协调器所需的 Child Handle。 */
export function createCodingAgentSubagentChildHandle(
	options: CodingAgentSubagentChildHandleOptions,
): SubagentChildHandle {
	const hasTodoRead = options.session.hasExtension?.(CODING_AGENT_TODO_READ) === true;
	const unsubscribeTodo =
		hasTodoRead && options.onTodoItemsChanged
			? options.session.subscribe((event) => {
					const items = readCodingAgentTodoObservation(event);
					if (items) options.onTodoItemsChanged?.(items);
				})
			: undefined;
	if (hasTodoRead && options.onTodoItemsChanged) {
		options.onTodoItemsChanged(options.session.invokeExtensionSync?.(CODING_AGENT_TODO_READ, undefined) ?? []);
	}
	let disposed = false;
	return {
		sessionId: options.session.sessionId,
		sessionFile: options.sessionFile,
		prompt: async (text) => {
			const outcome = (await options.session.prompt({ text })) as RuntimeTurnPromptOutcome | undefined;
			// Turn 失败时 Runtime 返回 failed 回执而非抛错；转成拒绝让
			// Coordinator 侧得到稳定的成员失败，而不是静默吞掉（BUG-0002）。
			if (outcome?.status === "failed") {
				throw new Error(outcome.error?.message ?? "Subagent turn failed");
			}
		},
		sendMessage: async (text) => {
			options.appendContext([contextRecord("subagent-message", text)]);
		},
		followUp: async (text) => {
			await options.deliverContext([contextRecord("subagent-followup", text)]);
		},
		abort: () => {
			void options.session.abort("Subagent interrupted").catch(() => undefined);
		},
		waitForIdle: () => waitForIdle(options.session),
		isStreaming: () => options.session.readState().isStreaming,
		getLastAssistantText: () => lastAssistantText(options.session.readMessages()),
		readUsage: () => aggregateUsage(options.session.readMessages()),
		dispose: async () => {
			if (disposed) return;
			disposed = true;
			unsubscribeTodo?.();
			try {
				await options.session.dispose();
			} finally {
				await options.disposeComposition();
			}
		},
		subscribe: (listener) => {
			// 非 assistant 通道的 error 事件只在 Turn 终态失败时放行（可重试错误被
			// session-retry 扣留，恢复时清除）；assistant 通道 error 是单次模型调用
			// 失败，可能仍被救回，不能当作成员终态（BUG-0002）。
			let pendingFailure: { code?: string; message: string } | undefined;
			return options.session.subscribe((event) => {
				if (event.type === "error" && event.channel !== "assistant") {
					pendingFailure = { code: event.error.code, message: event.error.message };
					return;
				}
				if (event.type !== "session.lifecycle") return;
				if (event.phase === "agent_start") {
					pendingFailure = undefined;
					listener({ type: "agent_start" });
					return;
				}
				if (event.phase === "aborted") {
					pendingFailure = undefined;
					listener({ type: "agent_end", reason: "interrupted" });
					return;
				}
				if (event.phase === "agent_end") {
					const failure = pendingFailure;
					pendingFailure = undefined;
					listener(
						failure
							? {
									type: "agent_end",
									reason: "failed",
									errorMessage: failure.message,
									...(failure.code ? { errorCode: failure.code } : {}),
								}
							: { type: "agent_end", reason: "completed" },
					);
				}
			});
		},
	};
}

function contextRecord(type: string, text: string): SessionContextRecord {
	return {
		type,
		content: [{ type: "text", text }],
		modelVisible: true,
		display: false,
	};
}

async function waitForIdle(session: RuntimeActiveSession): Promise<void> {
	if (!session.readState().isStreaming) return;
	await new Promise<void>((resolve) => {
		const unsubscribe = session.subscribe((event) => {
			if (event.type !== "session.lifecycle") return;
			if (event.phase !== "agent_end" && event.phase !== "aborted") return;
			unsubscribe();
			resolve();
		});
	});
}

function lastAssistantText(messages: readonly Message[]): string | undefined {
	const message = [...messages].reverse().find((candidate) => candidate.role === "assistant");
	if (!message || message.role !== "assistant") return undefined;
	return message.content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("");
}

function aggregateUsage(messages: readonly Message[]): SubagentUsageSnapshot {
	const usage = {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		costTotal: 0,
	};
	for (const message of messages) {
		if (message.role !== "assistant") continue;
		const assistant = message as AssistantMessage;
		usage.input += assistant.usage.input;
		usage.output += assistant.usage.output;
		usage.cacheRead += assistant.usage.cacheRead;
		usage.cacheWrite += assistant.usage.cacheWrite;
		usage.costTotal += assistant.usage.cost.total;
	}
	return usage;
}
