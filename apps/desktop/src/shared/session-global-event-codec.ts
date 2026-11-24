// Copyright The Open Forge contributors.

/**
 * 进程级会话推送的解码（TASK-0479）：`session.subscribeGlobal` 的 payload 以 `kind` 区分
 * 会话列表变化与运行态变化。Host 合同的事件 payload 是 `unknown`，preload 在边界收窄；
 * 形状与旧 `vetta:session:{sessions-changed,running-changed}` 推送保持一致，renderer 签名不变。
 */

export interface SessionsChangedEvent {
	cwd: string;
	sessionPath: string;
	session?: {
		id: string;
		cwd: string;
		firstMessage: string;
		modifiedAt: number;
		/** 会话创建时固化的档位（ADR-0151 决策 6）：渲染端增量插入据此过滤普通侧栏（BUG-0156）。 */
		agentMode?: string;
	};
}

export type RunningChangedReason = "agent_end" | "aborted" | "error";

export interface RunningChangedEvent {
	sessionPath: string;
	running: boolean;
	sessionId?: string;
	reason?: RunningChangedReason;
}

export type SessionGlobalEvent =
	| { kind: "sessions-changed"; event: SessionsChangedEvent }
	| { kind: "running-changed"; event: RunningChangedEvent };

const RUNNING_CHANGED_REASONS = new Set(["agent_end", "aborted", "error"]);

function record(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function fail(reason: string): never {
	throw new TypeError(`Invalid SessionGlobalEvent IPC payload: ${reason}`);
}

function isRunningChangedReason(value: unknown): value is RunningChangedReason {
	return typeof value === "string" && RUNNING_CHANGED_REASONS.has(value);
}

function decodeSessionsChanged(value: unknown): SessionsChangedEvent {
	const event = record(value);
	if (!event) fail("sessions-changed event is not an object");
	if (typeof event.cwd !== "string" || typeof event.sessionPath !== "string") {
		fail("invalid sessions-changed fields");
	}
	if (event.session === undefined) {
		return { cwd: event.cwd, sessionPath: event.sessionPath };
	}
	const session = record(event.session);
	if (!session) fail("invalid sessions-changed session");
	if (
		typeof session.id !== "string" ||
		typeof session.cwd !== "string" ||
		typeof session.firstMessage !== "string" ||
		typeof session.modifiedAt !== "number"
	) {
		fail("invalid sessions-changed session fields");
	}
	const agentMode = session.agentMode;
	if (agentMode !== undefined && typeof agentMode !== "string") fail("invalid sessions-changed agentMode");
	return {
		cwd: event.cwd,
		sessionPath: event.sessionPath,
		session: {
			id: session.id,
			cwd: session.cwd,
			firstMessage: session.firstMessage,
			modifiedAt: session.modifiedAt,
			...(agentMode !== undefined ? { agentMode } : {}),
		},
	};
}

function decodeRunningChanged(value: unknown): RunningChangedEvent {
	const event = record(value);
	if (!event) fail("running-changed event is not an object");
	if (typeof event.sessionPath !== "string" || typeof event.running !== "boolean") {
		fail("invalid running-changed fields");
	}
	const sessionId = event.sessionId;
	if (sessionId !== undefined && typeof sessionId !== "string") fail("invalid running-changed sessionId");
	const reason = event.reason;
	if (reason !== undefined && !isRunningChangedReason(reason)) fail("invalid running-changed reason");
	return {
		sessionPath: event.sessionPath,
		running: event.running,
		...(sessionId !== undefined ? { sessionId } : {}),
		...(reason !== undefined ? { reason } : {}),
	};
}

export function decodeSessionGlobalEvent(payload: unknown): SessionGlobalEvent {
	const frame = record(payload);
	if (!frame) fail("payload is not an object");
	if (frame.kind === "sessions-changed") {
		return { kind: "sessions-changed", event: decodeSessionsChanged(frame.event) };
	}
	if (frame.kind === "running-changed") {
		return { kind: "running-changed", event: decodeRunningChanged(frame.event) };
	}
	fail("unknown event kind");
}
