import { createConversationAgentMessage, createConversationUserMessage } from "@shared/conversation";
import type { AssistantMessage, AssistantMessageEvent } from "@vetta/ai";
import type { AssistantSessionEvent } from "@vetta/runtime-core";
import { describe, expect, it } from "vitest";
import { ConversationProjection, projectConversationAgentMessage } from "./conversation-projection";

function envelope(event: AssistantMessageEvent, sequence: number): AssistantSessionEvent {
	return {
		schemaVersion: 1,
		sessionId: "session-1",
		eventId: `event-${sequence}`,
		timestamp: sequence,
		source: "agent",
		sequence,
		channel: "assistant",
		turnId: "turn-1",
		modelCallIndex: 0,
		...event,
	};
}

describe("ConversationProjection", () => {
	it("projects persisted assistant content and execution metadata through the shared block model", () => {
		const message = {
			role: "assistant",
			content: [
				{ type: "text", text: "before" },
				{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "README.md" } },
				{ type: "text", text: "after" },
			],
		} as unknown as AssistantMessage;
		const projected = projectConversationAgentMessage({
			message,
			messageId: "message-1",
			executions: [
				{
					messageId: "message-1",
					toolCallId: "call-1",
					toolName: "read",
					args: { path: "README.md" },
					result: { content: [{ type: "text", text: "contents" }] },
					isError: false,
				},
			],
		});

		expect(projected.kind).toBe("agent");
		if (projected.kind !== "agent") return;
		expect(projected.blocks.map((block) => block.type)).toEqual(["text", "tool_call", "text"]);
		expect(projected.blocks[1]).toMatchObject({
			type: "tool_call",
			toolCallId: "call-1",
			status: "success",
			result: "contents",
		});
	});

	it("projects a failed persisted assistant and settles unfinished tools as errors", () => {
		const message = {
			...({ role: "assistant" } as AssistantMessage),
			stopReason: "error",
			content: [
				{ type: "text", text: "partial" },
				{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "README.md" } },
			],
		} as AssistantMessage;

		const projected = projectConversationAgentMessage({ message, messageId: "failed-message" });

		expect(projected).toMatchObject({
			kind: "agent",
			phase: "failed",
			text: "partial",
			blocks: expect.arrayContaining([
				expect.objectContaining({ type: "tool_call", toolCallId: "call-1", status: "error" }),
			]),
		});
	});

	it("keeps interleaved thinking, text, and tool events in wire order", () => {
		const projection = new ConversationProjection();
		const partial = {
			role: "assistant",
			content: [
				{ type: "thinking", thinking: "r" },
				{ type: "text", text: "a" },
				{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "README.md" } },
			],
		} as unknown as AssistantMessage;
		const events: AssistantMessageEvent[] = [
			{ type: "thinking_delta", contentIndex: 0, delta: "r", partial },
			{ type: "text_delta", contentIndex: 1, delta: "a", partial },
			{ type: "toolcall_start", contentIndex: 2, partial },
			{ type: "text_delta", contentIndex: 1, delta: "b", partial },
		];
		for (let index = 0; index < events.length; index += 1) projection.enqueue(envelope(events[index], index + 1));

		const messages = projection.flush([]);

		expect(messages).toHaveLength(1);
		expect(messages[0]).toMatchObject({
			kind: "agent",
			text: "ab",
			blocks: [
				expect.objectContaining({ type: "thinking" }),
				expect.objectContaining({ type: "text" }),
				expect.objectContaining({ type: "tool_call" }),
				expect.objectContaining({ type: "text" }),
			],
		});
	});

	it("deduplicates replayed events by the host sequence", () => {
		const projection = new ConversationProjection();
		const partial = { role: "assistant", content: [{ type: "text", text: "a" }] } as unknown as AssistantMessage;
		const event = envelope({ type: "text_delta", contentIndex: 0, delta: "a", partial }, 1);
		projection.enqueue(event);
		projection.enqueue(event);

		expect(projection.flush([])[0]).toMatchObject({ kind: "agent", text: "a" });
	});

	it("merges same-index deltas losslessly instead of replacing payloads", () => {
		const projection = new ConversationProjection();
		const partial = { role: "assistant", content: [{ type: "text", text: "abc" }] } as unknown as AssistantMessage;
		projection.enqueue(envelope({ type: "text_delta", contentIndex: 0, delta: "a", partial }, 1));
		projection.enqueue(envelope({ type: "text_delta", contentIndex: 0, delta: "b", partial }, 2));
		projection.enqueue(envelope({ type: "text_delta", contentIndex: 0, delta: "c", partial }, 3));

		expect(projection.readStats().droppedAssistantEvents).toBe(0);
		expect(projection.flush([])[0]).toMatchObject({ kind: "agent", text: "abc" });
	});

	it("drops only marker events under pressure and exposes the drop count", () => {
		const projection = new ConversationProjection();
		const partial = { role: "assistant", content: [] } as unknown as AssistantMessage;
		for (let index = 0; index < 4096; index += 1) {
			projection.enqueue(envelope({ type: "text_start", contentIndex: index, partial }, index + 1));
		}
		projection.enqueue(envelope({ type: "text_start", contentIndex: 4096, partial }, 4097));

		const stats = projection.readStats();
		expect(stats.droppedAssistantEvents).toBe(1);
		expect(stats.pendingAssistantEvents).toBe(4096);
	});

	it("never drops delta-bearing or terminal events beyond the pending limit", () => {
		const projection = new ConversationProjection();
		const partial = { role: "assistant", content: [{ type: "text", text: "x" }] } as unknown as AssistantMessage;
		for (let index = 0; index < 4096; index += 1) {
			projection.enqueue(
				envelope({ type: "text_delta", contentIndex: index, delta: `d${index}`, partial }, index + 1),
			);
		}
		projection.enqueue(
			envelope(
				{
					type: "done",
					reason: "stop",
					message: { role: "assistant", content: [{ type: "text", text: "done" }] } as unknown as AssistantMessage,
				},
				4097,
			),
		);

		const stats = projection.readStats();
		expect(stats.droppedAssistantEvents).toBe(0);
		expect(stats.pendingAssistantEvents).toBe(4097);
	});

	it("reset 后确定性 assistant id 已被占用时派生新消息，不原位替换消费前回复", () => {
		// 队列消费时调用方 flush+reset 并把镜像用户气泡追加到尾部
		// （useSessionEventController）。此后同 turnId 的事件若沿用
		// assistant:{sid}:{turnId}，会命中消费前的消息原位替换——回复内容
		// 落回用户气泡之前，气泡被孤立在列表末尾（BUG-0068）。
		const projection = new ConversationProjection();
		const partial = { role: "assistant", content: [{ type: "text", text: "x" }] } as unknown as AssistantMessage;
		projection.enqueue(envelope({ type: "text_delta", contentIndex: 0, delta: "上半", partial }, 1));
		const first = projection.flush([]);
		projection.reset();
		const mirror = createConversationUserMessage({ id: "mirror-u", text: "插队" });

		projection.enqueue(envelope({ type: "text_delta", contentIndex: 0, delta: "下半", partial }, 2));
		const messages = projection.flush([...first, mirror]);

		expect(messages).toHaveLength(3);
		expect(messages[0]).toMatchObject({ kind: "agent", text: "上半" });
		expect(messages[1]).toBe(mirror);
		expect(messages[2]).toMatchObject({ kind: "agent", text: "下半" });
	});

	it("历史回填折叠换 id 后，流式增量继续落在同一条消息", () => {
		// TASK-0152：重开的运行回合里，canonical 历史含部分落盘内容（entry id），
		// live 草稿（draft id）被折叠换名；投影目标迁移后增量不得另起新消息。
		const projection = new ConversationProjection();
		const partial = { role: "assistant", content: [{ type: "text", text: "x" }] } as unknown as AssistantMessage;
		const user = createConversationUserMessage({ id: "u-2", text: "question" });
		const draft = createConversationAgentMessage({
			id: "draft-3",
			text: "",
			blocks: [],
			phase: "streaming",
			startedAt: 1234,
		});

		projection.enqueue(envelope({ type: "text_delta", contentIndex: 0, delta: "hel", partial }, 1));
		projection.enqueue(envelope({ type: "text_delta", contentIndex: 0, delta: "lo", partial }, 2));
		const streamed = projection.flush([user, draft]);
		expect(streamed.at(-1)?.id).toBe("draft-3");

		projection.retargetMessageId("draft-3", "entry-9");
		const relabeled = streamed.map((item) =>
			item.id === "draft-3" ? { ...item, id: "entry-9", entryId: "entry-9" } : item,
		);

		projection.enqueue(envelope({ type: "text_delta", contentIndex: 0, delta: " world", partial }, 3));
		const continued = projection.flush(relabeled);

		const agents = continued.filter((item) => item.kind === "agent");
		expect(agents).toHaveLength(1);
		expect(agents[0]?.id).toBe("entry-9");
		expect(agents[0]).toMatchObject({ kind: "agent", text: "hello world" });
	});

	it("retarget 只迁移匹配的当前目标，不影响其他草稿身份", () => {
		const projection = new ConversationProjection();
		projection.retargetMessageId("draft-3", "entry-9");
		const partial = { role: "assistant", content: [{ type: "text", text: "x" }] } as unknown as AssistantMessage;
		const user = createConversationUserMessage({ id: "u-1", text: "q" });
		const otherDraft = createConversationAgentMessage({
			id: "other-draft",
			text: "",
			blocks: [],
			phase: "streaming",
		});

		projection.enqueue(envelope({ type: "text_delta", contentIndex: 0, delta: "x", partial }, 1));
		const items = projection.flush([user, otherDraft]);

		expect(items.at(-1)?.id).toBe("other-draft");
	});
});
