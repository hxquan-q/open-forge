import type { TeamSessionDocument } from "@vetta/agent-team";
import { createAssistantMessage } from "@vetta/ai";
import type { RuntimeHost, RuntimeSessionExecutionObservation, SessionEvent } from "@vetta/runtime-core";
import { describe, expect, it, vi } from "vitest";
import type { DesktopTeamSessionStreamEvent } from "../../preload/api-types/team-conversation-display.js";
import { TeamSessionEventHub } from "./team-session-event-hub.js";

describe("TeamSessionEventHub active replay", () => {
	it("publishes one running transition for the first member turn and one idle transition after the last", () => {
		const runningChanges: Array<{ teamSessionId: string; running: boolean }> = [];
		const hub = new TeamSessionEventHub({
			runtime: () => ({}) as RuntimeHost,
			getSession: () => undefined,
			observe: () => undefined,
			onRunningChanged: (teamSessionId, running) => runningChanges.push({ teamSessionId, running }),
		});
		const activeTurn = (memberId: string, messageId: string) => ({
			teamSessionId: "team-session",
			memberId,
			requestId: "request",
			turnId: `${memberId}-turn`,
			messageId,
			author: { kind: "agent" as const, id: memberId },
			workItemId: `${memberId}-work-item`,
			attemptId: `${memberId}-attempt`,
			startedAt: 1,
			seq: 0,
			text: "",
			rawAssistantStream: false,
			toolExecutionEvents: [],
		});

		hub.beginTurn("leader-runtime", activeTurn("leader", "leader-result"));
		hub.beginTurn("executor-runtime", activeTurn("executor", "executor-result"));
		expect(hub.runningSessionIds()).toEqual(["team-session"]);
		hub.endTurn("leader-runtime");
		expect(runningChanges).toEqual([{ teamSessionId: "team-session", running: true }]);
		hub.endTurn("executor-runtime");

		expect(hub.runningSessionIds()).toEqual([]);
		expect(runningChanges).toEqual([
			{ teamSessionId: "team-session", running: true },
			{ teamSessionId: "team-session", running: false },
		]);
	});

	it("reconstructs the active message and every tool lifecycle event after resubscription", () => {
		let sessionListener: ((event: SessionEvent) => void) | undefined;
		let executionListener: ((event: RuntimeSessionExecutionObservation) => void) | undefined;
		const runtime = {
			subscribe: vi.fn((_sessionId: string, listener: (event: SessionEvent) => void) => {
				sessionListener = listener;
				return () => undefined;
			}),
			subscribeExecutionObservations: vi.fn(
				(_sessionId: string, listener: (event: RuntimeSessionExecutionObservation) => void) => {
					executionListener = listener;
					return () => undefined;
				},
			),
		} as unknown as RuntimeHost;
		const session = {
			id: "team-session",
			teamId: "team",
			memberRuntime: {
				leader: { sessionId: "leader-runtime", sessionPath: "C:/sessions/leader.jsonl" },
			},
		} as unknown as TeamSessionDocument;
		const hub = new TeamSessionEventHub({
			runtime: () => runtime,
			getSession: () => session,
			observe: () => undefined,
		});
		const live: DesktopTeamSessionStreamEvent[] = [];
		hub.addSubscriber(session.id, (event) => live.push(event));
		hub.beginTurn("leader-runtime", {
			teamSessionId: session.id,
			memberId: "leader",
			requestId: "request",
			turnId: "leader-turn",
			messageId: "leader-result",
			author: { kind: "agent", id: "leader" },
			workItemId: "work-item",
			attemptId: "attempt",
			startedAt: 1,
			seq: 0,
			text: "",
			rawAssistantStream: false,
			toolExecutionEvents: [],
		});
		hub.attach(session);

		const result = { content: [{ type: "text" as const, text: "done" }] };
		const observations: RuntimeSessionExecutionObservation[] = [
			{
				turnId: "leader-turn",
				timestamp: 2,
				event: {
					type: "tool.execution.start",
					toolCallId: "read-index",
					toolName: "read",
					args: { path: "index.html" },
					startedAt: 2,
				},
			},
			{
				turnId: "leader-turn",
				timestamp: 3,
				event: {
					type: "tool.execution.update",
					toolCallId: "read-index",
					toolName: "read",
					args: { path: "index.html" },
					partialResult: result,
				},
			},
			{
				turnId: "leader-turn",
				timestamp: 4,
				event: {
					type: "tool.execution.phase",
					toolCallId: "read-index",
					toolName: "read",
					label: "reading",
					atMs: 2,
				},
			},
			{
				turnId: "leader-turn",
				timestamp: 5,
				event: {
					type: "tool.execution.end",
					toolCallId: "read-index",
					toolName: "read",
					result,
					isError: false,
					startedAt: 2,
					durationMs: 3,
					phases: [{ label: "reading", atMs: 2 }],
				},
			},
		];
		executionListener?.(observations[0]!);
		const partial = {
			...createAssistantMessage({ api: "openai-responses", provider: "test", model: "fixture" }, { timestamp: 2 }),
			content: [{ type: "toolCall" as const, id: "read-index", name: "read", arguments: { path: "index.html" } }],
		};
		sessionListener?.({
			schemaVersion: 1,
			channel: "assistant",
			sessionId: "leader-runtime",
			eventId: "assistant-tool",
			timestamp: 2,
			source: "agent",
			sequence: 1,
			turnId: "leader-turn",
			modelCallIndex: 0,
			type: "toolcall_start",
			contentIndex: 0,
			partial,
		} as SessionEvent);
		for (const observation of observations.slice(1)) executionListener?.(observation);

		const toolEvents = live.filter((event) => event.type === "desktop.team-tool-execution");
		expect(toolEvents.map((event) => event.event.type)).toEqual(["start", "update", "phase", "end"]);
		expect(hub.activeStreamEvents(session.id).map((event) => event.type)).toEqual([
			"conversation.agent-message-event",
			"desktop.team-tool-execution",
			"desktop.team-tool-execution",
			"desktop.team-tool-execution",
			"desktop.team-tool-execution",
		]);
		expect(hub.activeStreamEvents(session.id).map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5]);
	});

	it("publishes provider retry activity to the member stream instead of dropping it", () => {
		const { beginLeaderTurn, live, emitSessionEvent } = createActiveMemberHub();
		beginLeaderTurn();

		emitSessionEvent({
			schemaVersion: 1,
			channel: "assistant",
			sessionId: "leader-runtime",
			eventId: "assistant-retry",
			timestamp: 3,
			source: "agent",
			sequence: 2,
			turnId: "leader-turn",
			modelCallIndex: 0,
			type: "retry",
			reason: "transient",
			attempt: 1,
			maxAttempts: 3,
			delayMs: 1500,
			errorMessage: "Provider stream stalled: no events for 180000ms (stream_idle_timeout)",
			failure: {
				code: "AI_TRANSPORT_FAILED",
				message: "Provider stream stalled: no events for 180000ms (stream_idle_timeout)",
				retryable: true,
				phase: "stream",
			},
		} as SessionEvent);

		// 重连活动是活动状态而非消息行：它按 live 事件下发，不参与重放重建。
		const messageEvents = live.filter((event) => event.type === "conversation.agent-message-event");
		expect(messageEvents).toHaveLength(1);
		// 公开面只保留重连进度与可读原因；provider 诊断细节留在本机主进程。
		expect(messageEvents[0]?.event).toEqual({
			type: "retry",
			reason: "transient",
			attempt: 1,
			maxAttempts: 3,
			delayMs: 1500,
			errorMessage: "Provider stream stalled: no events for 180000ms (stream_idle_timeout)",
		});
	});
});

function createActiveMemberHub(): {
	readonly beginLeaderTurn: () => void;
	readonly live: DesktopTeamSessionStreamEvent[];
	readonly emitSessionEvent: (event: SessionEvent) => void;
} {
	let sessionListener: ((event: SessionEvent) => void) | undefined;
	const runtime = {
		subscribe: vi.fn((_sessionId: string, listener: (event: SessionEvent) => void) => {
			sessionListener = listener;
			return () => undefined;
		}),
		subscribeExecutionObservations: vi.fn(() => () => undefined),
	} as unknown as RuntimeHost;
	const session = {
		id: "team-session",
		teamId: "team",
		memberRuntime: {
			leader: { sessionId: "leader-runtime", sessionPath: "C:/sessions/leader.jsonl" },
		},
	} as unknown as TeamSessionDocument;
	const hub = new TeamSessionEventHub({
		runtime: () => runtime,
		getSession: () => session,
		observe: () => undefined,
	});
	const live: DesktopTeamSessionStreamEvent[] = [];
	hub.addSubscriber(session.id, (event) => live.push(event));
	hub.attach(session);
	return {
		beginLeaderTurn: () =>
			hub.beginTurn("leader-runtime", {
				teamSessionId: session.id,
				memberId: "leader",
				requestId: "request",
				turnId: "leader-turn",
				messageId: "leader-result",
				author: { kind: "agent", id: "leader" },
				workItemId: "work-item",
				attemptId: "attempt",
				startedAt: 1,
				seq: 0,
				text: "",
				rawAssistantStream: false,
				toolExecutionEvents: [],
			}),
		live,
		emitSessionEvent: (event) => sessionListener?.(event),
	};
}
