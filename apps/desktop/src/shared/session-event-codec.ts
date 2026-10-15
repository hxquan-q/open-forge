// Modified by The Open Forge contributors.
import type { SessionEvent } from "@vetta/runtime-core";

const SESSION_EVENT_TYPES = new Set([
	"session.lifecycle",
	"session.path_changed",
	"message.delta",
	"thinking.delta",
	"toolcall.start",
	"tool.start",
	"tool.update",
	"tool.phase",
	"tool.end",
	"usage.update",
	"error",
	"session.extension",
	"task.lifecycle",
	"artifact.descriptor",
	"active_tools_update",
	"compaction.start",
	"compaction.end",
	"retry.start",
	"retry.end",
	"queue.changed",
	"session.context.state",
]);

const ASSISTANT_EVENT_TYPES = new Set([
	"start",
	"text_start",
	"text_delta",
	"text_end",
	"thinking_start",
	"thinking_delta",
	"thinking_end",
	"toolcall_start",
	"toolcall_delta",
	"toolcall_end",
	"retry",
	"done",
	"error",
]);

function record(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function fail(reason: string): never {
	throw new TypeError(`Invalid SessionEvent IPC payload: ${reason}`);
}

function validateAssistantEvent(value: unknown): void {
	const event = record(value);
	if (!event || typeof event.type !== "string" || !ASSISTANT_EVENT_TYPES.has(event.type)) {
		fail("unknown assistant event type");
	}
	if (event.type === "done") {
		if (!record(event.message) || typeof event.reason !== "string") fail("invalid assistant done event");
		return;
	}
	if (event.type === "error") {
		if (!record(event.error) || typeof event.reason !== "string") fail("invalid assistant error event");
		if (event.failure !== undefined && !record(event.failure)) fail("invalid assistant failure");
		return;
	}
	if (event.type === "retry") {
		// 重连活动没有 `partial`：它描述的是同一次调用内的等待，不是新的消息行。
		// `reason` 与 done / error 的 `reason` 同样只校验形态：provider 侧新增一条
		// 重试轨道时，不该因为这里的枚举白名单把整条会话流拒掉。
		if (typeof event.reason !== "string") fail("assistant retry reason is invalid");
		if (!Number.isInteger(event.attempt) || Number(event.attempt) < 1) fail("assistant retry attempt is invalid");
		if (!Number.isInteger(event.maxAttempts) || Number(event.maxAttempts) < 0) {
			fail("assistant retry maxAttempts is invalid");
		}
		if (typeof event.delayMs !== "number" || !Number.isFinite(event.delayMs) || event.delayMs < 0) {
			fail("assistant retry delayMs is invalid");
		}
		if (typeof event.errorMessage !== "string") fail("assistant retry errorMessage is invalid");
		if (event.failure !== undefined && !record(event.failure)) fail("invalid assistant failure");
		return;
	}
	if (!record(event.partial)) fail("assistant partial is missing");
	if (event.type === "start") return;
	if (!Number.isInteger(event.contentIndex) || Number(event.contentIndex) < 0) fail("invalid assistant contentIndex");
	if (
		(event.type === "text_delta" || event.type === "thinking_delta" || event.type === "toolcall_delta") &&
		typeof event.delta !== "string"
	) {
		fail("assistant delta is missing");
	}
	if ((event.type === "text_end" || event.type === "thinking_end") && typeof event.content !== "string") {
		fail("assistant final content is missing");
	}
	if (event.type === "toolcall_end" && !record(event.toolCall)) fail("assistant toolCall is missing");
}

/** Runtime validation for the untrusted main → preload → renderer boundary. */
export function decodeSessionEvent(value: unknown): SessionEvent {
	const event = record(value);
	if (!event) fail("payload is not an object");
	if (event.schemaVersion !== 1) fail("unsupported schemaVersion");
	if (typeof event.sessionId !== "string" || event.sessionId.length === 0) fail("sessionId is missing");
	if (typeof event.eventId !== "string" || event.eventId.length === 0) fail("eventId is missing");
	if (typeof event.timestamp !== "number" || !Number.isFinite(event.timestamp)) fail("timestamp is invalid");
	if (typeof event.source !== "string") fail("source is missing");
	if (event.sequence !== undefined && (!Number.isInteger(event.sequence) || Number(event.sequence) < 1)) {
		fail("sequence is invalid");
	}
	if (event.channel === "assistant") {
		if (event.source !== "agent") fail("assistant source is invalid");
		if (!Number.isInteger(event.modelCallIndex) || Number(event.modelCallIndex) < 0) {
			fail("modelCallIndex is invalid");
		}
		if (event.turnId !== undefined && typeof event.turnId !== "string") fail("turnId is invalid");
		validateAssistantEvent(event);
		return event as unknown as SessionEvent;
	}
	if (event.channel !== undefined && event.channel !== "runtime") fail("runtime channel is invalid");
	if (typeof event.type !== "string" || !SESSION_EVENT_TYPES.has(event.type)) fail("unknown event type");
	if (event.type === "session.context.state") {
		const state = record(event.state);
		if (!state || state.sessionId !== event.sessionId || !Number.isInteger(state.revision)) {
			fail("invalid session context state");
		}
		const usage = record(state.usage);
		const compaction = record(state.compaction);
		if (!usage || !compaction || typeof compaction.status !== "string" || !record(compaction.eligibility)) {
			fail("invalid session context state payload");
		}
	}
	if (event.type === "task.lifecycle") {
		const task = record(event.task);
		if (
			!task ||
			typeof task.type !== "string" ||
			typeof task.taskId !== "string" ||
			typeof task.eventId !== "string"
		) {
			fail("invalid task lifecycle payload");
		}
	}
	if (event.type === "artifact.descriptor") {
		const artifact = record(event.artifact);
		if (!artifact || typeof artifact.artifactId !== "string" || typeof artifact.kind !== "string") {
			fail("invalid artifact descriptor payload");
		}
	}
	return event as unknown as SessionEvent;
}
