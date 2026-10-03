// Copyright The Open Forge contributors.
import { createConversationAgentMessage, createConversationUserMessage } from "@shared/conversation";
import type { ChatTimelineItem } from "@shared/store/atoms";
import type { AssistantSessionEvent } from "@vetta/runtime-core";
import { describe, expect, it } from "vitest";
import { ConversationProjection } from "./conversation-projection";

function textDelta(sequence: number, delta: string): AssistantSessionEvent {
	return {
		type: "text_delta",
		sessionId: "session-1",
		turnId: "turn-9",
		sequence,
		delta,
		timestamp: 0,
	} as unknown as AssistantSessionEvent;
}

describe("ConversationProjection 重开续流", () => {
	it("尾部流式草稿接收增量，折叠换 id 后增量继续落在同一条消息", () => {
		const projection = new ConversationProjection();
		const user = createConversationUserMessage({ id: "u-2", text: "question" });
		const draft = createConversationAgentMessage({
			id: "draft-3",
			text: "",
			blocks: [],
			phase: "streaming",
			startedAt: 1234,
		});

		projection.enqueue(textDelta(1, "hel"));
		projection.enqueue(textDelta(2, "lo"));
		const streamed = projection.flush([user, draft]);
		expect(streamed.filter((item) => item.kind === "agent")).toHaveLength(1);
		const draftAfter = streamed.at(-1);
		expect(draftAfter?.id).toBe("draft-3");

		// 历史回填把运行回合的部分内容以 canonical entry id 合入，草稿被折叠换名（TASK-0152）。
		projection.retargetMessageId("draft-3", "entry-9");
		const relabeled: ChatTimelineItem[] = streamed.map((item) =>
			item.id === "draft-3" ? { ...item, id: "entry-9", entryId: "entry-9" } : item,
		);

		projection.enqueue(textDelta(3, " world"));
		const continued = projection.flush(relabeled);

		const agents = continued.filter((item) => item.kind === "agent");
		expect(agents).toHaveLength(1);
		expect(agents[0]?.id).toBe("entry-9");
		const text = agents[0]?.blocks
			?.filter((block) => block.type === "text")
			.map((block) => (block.type === "text" ? block.text : ""))
			.join("");
		expect(text).toContain("hello world");
	});

	it("retarget 只迁移匹配的当前目标，不影响其他身份", () => {
		const projection = new ConversationProjection();
		projection.retargetMessageId("draft-3", "entry-9");
		const user = createConversationUserMessage({ id: "u-1", text: "q" });
		const draft = createConversationAgentMessage({ id: "other-draft", text: "", blocks: [], phase: "streaming" });

		projection.enqueue(textDelta(1, "x"));
		const items = projection.flush([user, draft]);

		expect(items.at(-1)?.id).toBe("other-draft");
	});
});
