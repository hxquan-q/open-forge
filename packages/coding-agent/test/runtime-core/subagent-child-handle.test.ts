// Modified by The Open Forge contributors.
import type { RuntimeSession, SessionEvent } from "@vetta/runtime-core";
import type { SubagentChildEvent } from "@vetta/runtime-subagents";
import { describe, expect, it, vi } from "vitest";
import { createCodingAgentSubagentChildHandle } from "../../src/composition/subagent/child-handle.js";
import { CODING_AGENT_TODO_OBSERVATION } from "../../src/features/todo/todo-session-extension-contract.js";

function baseEvent(type: SessionEvent["type"], extra: Partial<SessionEvent> = {}): SessionEvent {
	return {
		type,
		schemaVersion: 1,
		sessionId: "child-1",
		eventId: `event-${Math.random().toString(36).slice(2)}`,
		timestamp: 1,
		source: "runtime-core",
		...extra,
	} as SessionEvent;
}

describe("Coding Agent Subagent child handle", () => {
	it("publishes live todo progress from the child Session Extension observation", () => {
		const listeners = new Set<(event: SessionEvent) => void>();
		const session = {
			sessionId: "child-1",
			hasExtension: () => true,
			invokeExtensionSync: () => [
				{ id: 1, content: "inspect", status: "done" },
				{ id: 2, content: "change", status: "pending" },
			],
			subscribe: (listener: (event: SessionEvent) => void) => {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
			readState: () => ({ isStreaming: false }),
			readMessages: () => [],
			prompt: async () => {},
			abort: async () => {},
			dispose: async () => {},
		} as unknown as RuntimeSession;
		const onTodoItemsChanged = vi.fn();
		const handle = createCodingAgentSubagentChildHandle({
			session,
			appendContext: () => {},
			deliverContext: async () => {},
			disposeComposition: async () => {},
			onTodoItemsChanged,
		});

		expect(onTodoItemsChanged).toHaveBeenCalledWith([
			{ id: 1, content: "inspect", status: "done" },
			{ id: 2, content: "change", status: "pending" },
		]);
		for (const listener of listeners) {
			listener({
				type: "session.extension",
				schemaVersion: 1,
				sessionId: "child-1",
				eventId: "event-1",
				timestamp: 1,
				source: "agent",
				extensionId: CODING_AGENT_TODO_OBSERVATION.extensionId,
				event: CODING_AGENT_TODO_OBSERVATION.event,
				payload: [
					{ id: 1, content: "inspect", status: "done" },
					{ id: 2, content: "change", status: "done" },
				],
			});
		}

		expect(onTodoItemsChanged).toHaveBeenLastCalledWith([
			{ id: 1, content: "inspect", status: "done" },
			{ id: 2, content: "change", status: "done" },
		]);
		void handle.dispose();
		expect(listeners).toHaveLength(0);
	});

	function createEventHarness(promptOutcome?: { status: string; error?: { message: string } }) {
		const listeners = new Set<(event: SessionEvent) => void>();
		const session = {
			sessionId: "child-1",
			subscribe: (listener: (event: SessionEvent) => void) => {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
			readState: () => ({ isStreaming: false }),
			readMessages: () => [],
			prompt: async () => promptOutcome ?? { status: "completed" },
			abort: async () => {},
			dispose: async () => {},
		} as unknown as RuntimeSession;
		const handle = createCodingAgentSubagentChildHandle({
			session,
			appendContext: () => {},
			deliverContext: async () => {},
			disposeComposition: async () => {},
		});
		const events: SubagentChildEvent[] = [];
		handle.subscribe((event) => events.push(event));
		const emit = (event: SessionEvent) => {
			for (const listener of listeners) listener(event);
		};
		return { handle, events, emit };
	}

	it("projects a terminal turn failure onto agent_end instead of completed (BUG-0002)", () => {
		const { events, emit } = createEventHarness();

		emit(
			baseEvent("error", {
				error: {
					code: "AI_STREAM_PROTOCOL_FAILED",
					message: "response.content_part.added targeted the wrong output item",
					retryable: false,
					origin: "provider",
				},
				turnId: "turn-1",
			} as Partial<SessionEvent>),
		);
		emit(baseEvent("session.lifecycle", { phase: "agent_end" } as Partial<SessionEvent>));

		expect(events).toEqual([
			{
				type: "agent_end",
				reason: "failed",
				errorMessage: "response.content_part.added targeted the wrong output item",
				errorCode: "AI_STREAM_PROTOCOL_FAILED",
			},
		]);
	});

	it("does not treat a retried assistant-channel error as the member terminal", () => {
		const { events, emit } = createEventHarness();

		emit(
			baseEvent("error", {
				channel: "assistant",
				error: { code: "PROVIDER_BUSY", message: "busy", retryable: true, origin: "provider" },
			} as Partial<SessionEvent>),
		);
		emit(baseEvent("session.lifecycle", { phase: "agent_end" } as Partial<SessionEvent>));

		expect(events).toEqual([{ type: "agent_end", reason: "completed" }]);
	});

	it("maps the aborted lifecycle phase to an interrupted member end", () => {
		const { events, emit } = createEventHarness();

		emit(baseEvent("session.lifecycle", { phase: "aborted" } as Partial<SessionEvent>));

		expect(events).toEqual([{ type: "agent_end", reason: "interrupted" }]);
	});

	it("rejects prompt when the turn outcome reports failure", async () => {
		const { handle } = createEventHarness({
			status: "failed",
			error: { message: "response.content_part.added targeted the wrong output item" },
		});

		await expect(handle.prompt("work")).rejects.toThrow("response.content_part.added targeted the wrong output item");
	});
});
