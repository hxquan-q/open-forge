// Modified by The Open Forge contributors.
import { createConversationAgentMessage, createConversationUserMessage } from "@shared/conversation";
import type { ChatConversationItem } from "@shared/store/atoms";
import { describe, expect, it } from "vitest";
import { preserveMessagesAddedAfterSnapshot, shareChatMessageSnapshot } from "./chat-message-snapshot";

function message(id: string, text: string): ChatConversationItem {
	return createConversationAgentMessage({ id, text, blocks: [{ id: `${id}-text`, type: "text", text }] });
}

describe("shareChatMessageSnapshot", () => {
	it("完整等价时保留预览数组与所有消息引用", () => {
		const preview = [message("a", "first"), message("b", "second")];
		const canonical = [message("a", "first"), message("b", "second")];

		const result = shareChatMessageSnapshot(preview, canonical);

		expect(result.messages).toBe(preview);
		expect(result.reusedCount).toBe(2);
	});

	it("只替换 Runtime 中真正变化的消息", () => {
		const preview = [message("a", "first"), message("b", "preview")];
		const canonical = [message("a", "first"), message("b", "canonical"), message("c", "new")];

		const result = shareChatMessageSnapshot(preview, canonical);

		expect(result.messages).not.toBe(preview);
		expect(result.messages[0]).toBe(preview[0]);
		expect(result.messages[1]).toBe(canonical[1]);
		expect(result.messages[2]).toBe(canonical[2]);
		expect(result.reusedCount).toBe(1);
	});

	it("顺序改变时按稳定消息 id 复用，而不错误沿用旧位置", () => {
		const first = message("a", "first");
		const second = message("b", "second");

		const result = shareChatMessageSnapshot([first, second], [message("b", "second"), message("a", "first")]);

		expect(result.messages).toEqual([second, first]);
		expect(result.reusedCount).toBe(2);
	});

	it("Runtime 水合替换预览基线时保留其后接受的乐观消息", () => {
		const preview = [message("a", "preview")];
		const canonical = [message("a", "canonical")];
		const optimistic = createConversationUserMessage({ id: "user-pending", text: "accepted" });

		const result = preserveMessagesAddedAfterSnapshot(preview, canonical, [...preview, optimistic]);

		expect(result).toEqual([...canonical, optimistic]);
	});

	it("延迟回填时不重复追加已被 canonical 对账吸收的消息", () => {
		const queued = createConversationUserMessage({ id: "queued-user", text: "next" });

		const result = preserveMessagesAddedAfterSnapshot([], [queued], [queued]);

		expect(result).toEqual([queued]);
	});

	it("current 中夹在持久化项之间的 live-only 项保持因果位置，不平铺到末尾", () => {
		// 乐观/镜像用户气泡在 current 里排在它触发的回复之前；回填合并若把
		// canonical 之外的项一律追加尾部，气泡会跑到回复之后（BUG-0068）。
		const persistedUser = createConversationUserMessage({ id: "u-1", text: "q1" });
		const bubble = createConversationUserMessage({ id: "opt-m", text: "followup", deliveryPhase: "pending" });
		const persistedReply = message("a-1", "reply");

		const result = preserveMessagesAddedAfterSnapshot(
			[],
			[persistedUser, persistedReply],
			[persistedUser, bubble, persistedReply],
		);

		expect(result.map((item) => item.id)).toEqual(["u-1", "opt-m", "a-1"]);
	});

	it("live-only 项没有持久化前驱时锚定到最近持久化后继之前", () => {
		const bubble = createConversationUserMessage({ id: "opt-m", text: "followup", deliveryPhase: "pending" });
		const persistedUser = createConversationUserMessage({ id: "u-1", text: "q1" });

		const result = preserveMessagesAddedAfterSnapshot([], [persistedUser], [bubble, persistedUser]);

		expect(result.map((item) => item.id)).toEqual(["opt-m", "u-1"]);
	});

	it("(b) 槽位文本不匹配的排队幽灵保持尾部，镜像气泡仍锚到孪生槽前", () => {
		// 与 transcript-window 同一规则：锚定槽 user 文本须与气泡一致；
		// 孪生永不入模的排队幽灵留在尾部（BUG-0073）。
		const persistedUser = createConversationUserMessage({ id: "u-1", text: "q1" });
		const mirror = createConversationUserMessage({ id: "opt-m", text: "followup", deliveryPhase: "pending" });
		const ghost = createConversationUserMessage({ id: "opt-ghost", text: "还在排队", deliveryPhase: "pending" });
		const twin = createConversationUserMessage({ id: "u-10", text: "followup" });
		const reply = message("a-10", "reply");

		const result = preserveMessagesAddedAfterSnapshot(
			[],
			[persistedUser, twin, reply],
			[persistedUser, mirror, ghost],
		);

		expect(result.map((item) => item.id)).toEqual(["u-1", "opt-m", "u-10", "a-10", "opt-ghost"]);
	});

	it("current 不含任何持久化项时 live-only 项仍追加尾部", () => {
		const draft = message("a-live", "streaming");
		const persistedUser = createConversationUserMessage({ id: "u-1", text: "q1" });

		const result = preserveMessagesAddedAfterSnapshot([], [persistedUser], [draft]);

		expect(result.map((item) => item.id)).toEqual(["u-1", "a-live"]);
	});
});

describe("reconcileRunningTurnDraft", () => {
	// 动态 import 让红测在实现缺失时以可读的方式失败，而不是收集期解析错误。
	const load = () => import("./chat-message-snapshot");

	function streamingDraft(id: string, text: string): ChatConversationItem {
		return createConversationAgentMessage({
			id,
			text,
			blocks: [{ id: `${id}-text`, type: "text", text }],
			phase: "streaming",
			startedAt: 1234,
		});
	}

	it("canonical 已含运行回合的部分内容时，草稿折叠进 canonical 身份（不分裂）", async () => {
		const { reconcileRunningTurnDraft } = await load();
		const user = createConversationUserMessage({ id: "u-2", text: "question" });
		const canonical = [message("entry-1", "old turn"), user, message("entry-9", "partial from disk")];
		const draft = streamingDraft("draft-3", "partial from disk + live delta");

		const result = reconcileRunningTurnDraft(canonical, [message("entry-1", "old turn"), user, draft]);

		expect(result.items.map((item) => item.id)).toEqual(["entry-1", "u-2", "entry-9"]);
		const folded = result.items[2];
		expect(folded?.kind).toBe("agent");
		if (folded?.kind !== "agent") return;
		expect(folded.phase).toBe("streaming");
		expect(folded.startedAt).toBe(1234);
		expect(folded.blocks?.some((block) => block.type === "text" && block.text.includes("live delta"))).toBe(true);
		expect(result.retarget).toEqual({ from: "draft-3", to: "entry-9" });
	});

	it("canonical 尾部还没有本回合内容时不折叠，草稿交由 preserve 步处理", async () => {
		const { reconcileRunningTurnDraft } = await load();
		const user = createConversationUserMessage({ id: "u-2", text: "question" });
		const draft = streamingDraft("draft-3", "live only");

		const result = reconcileRunningTurnDraft(
			[message("entry-1", "old"), user],
			[message("entry-1", "old"), user, draft],
		);

		// 折叠未发生：返回 canonical 原样；draft-3 的存活性由 preserveMessagesAddedAfterSnapshot 负责。
		expect(result.items.map((item) => item.id)).toEqual(["entry-1", "u-2"]);
		expect(result.retarget).toBeUndefined();
	});

	it("最后的 user 消息不一致（不同回合边界）时不折叠", async () => {
		const { reconcileRunningTurnDraft } = await load();
		const canonical = [
			message("entry-1", "old"),
			createConversationUserMessage({ id: "u-1", text: "first" }),
			message("entry-2", "completed turn"),
		];
		const current = [
			message("entry-1", "old"),
			createConversationUserMessage({ id: "u-2", text: "second" }),
			streamingDraft("draft-3", "new turn live"),
		];

		const result = reconcileRunningTurnDraft(canonical, current);

		// 回合边界不同：不折叠，canonical 原样返回，draft 由 preserve 按 pending 归位。
		expect(result.items.map((item) => item.id)).toEqual(["entry-1", "u-1", "entry-2"]);
		expect(result.retarget).toBeUndefined();
	});

	it("current 尾部不是流式草稿（普通历史重放）时不折叠", async () => {
		const { reconcileRunningTurnDraft } = await load();
		const user = createConversationUserMessage({ id: "u-1", text: "q" });
		const items = [message("entry-1", "done"), user, message("entry-2", "assistant done")];

		const result = reconcileRunningTurnDraft(items, items);

		expect(result.retarget).toBeUndefined();
		expect(result.items).toHaveLength(3);
	});
});
