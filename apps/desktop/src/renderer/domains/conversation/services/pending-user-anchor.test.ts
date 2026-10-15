// Modified by The Open Forge contributors.
import { createConversationAgentMessage, createConversationUserMessage } from "@shared/conversation";
import type { ChatTimelineItem } from "@shared/store/atoms";
import { describe, expect, it } from "vitest";
import { mergeWithCausalAnchors } from "./pending-user-anchor";

function user(id: string, text: string): ChatTimelineItem {
	return createConversationUserMessage({ id, text });
}

function pending(id: string, text: string): ChatTimelineItem {
	return createConversationUserMessage({ id, text, deliveryPhase: "pending" });
}

function reply(id: string, text: string): ChatTimelineItem {
	return createConversationAgentMessage({ id, text, blocks: [{ id: `${id}-t`, type: "text", text }] });
}

describe("mergeWithCausalAnchors", () => {
	it("(a) order 中有已落 base 后继的 pending 锚到后继之前", () => {
		const first = pending("opt-1", "跟进");
		const landedUser = user("u-1", "q1");
		const landedReply = reply("a-1", "答");

		const result = mergeWithCausalAnchors({
			base: [landedUser, landedReply],
			order: [first, landedUser, landedReply],
			isPendingIndex: (i) => i === 0,
			landedBaseIndex: (i) => (i === 1 ? 0 : i === 2 ? 1 : undefined),
		});

		expect(result.items.map((item) => item.id)).toEqual(["opt-1", "u-1", "a-1"]);
		expect(result.baseIndexes).toEqual([1, 2]);
	});

	it("(b) 槽位 user 文本一致才锚定孪生槽，不一致维持尾部", () => {
		const mirror = pending("opt-m", "followup");
		const ghost = pending("opt-ghost", "还在排队");
		const landedUser = user("u-1", "q1");
		const twin = user("u-10", "followup");
		const landedReply = reply("a-10", "答");

		const result = mergeWithCausalAnchors({
			base: [landedUser, twin, landedReply],
			order: [landedUser, mirror, ghost],
			isPendingIndex: (i) => i > 0,
			landedBaseIndex: (i) => (i === 0 ? 0 : undefined),
		});

		// mirror 的孪生槽（u-10）文本一致 → 锚定其前；ghost 文本不一致 → 尾部。
		expect(result.items.map((item) => item.id)).toEqual(["u-1", "opt-m", "u-10", "a-10", "opt-ghost"]);
	});

	it("(c) 无已落 base 邻居的 pending 与非 user pending 一律尾部", () => {
		const streaming = reply("a-stream", "流式二");
		const stranded = pending("opt-x", "无邻居");
		const landedUser = user("u-1", "q1");

		const result = mergeWithCausalAnchors({
			base: [landedUser],
			order: [landedUser, stranded, streaming],
			isPendingIndex: (i) => i === 1 || i === 2,
			landedBaseIndex: (i) => (i === 0 ? 0 : undefined),
		});

		expect(result.items.map((item) => item.id)).toEqual(["u-1", "opt-x", "a-stream"]);
	});

	it("同锚点多个 pending 保持 order 相对顺序；空 base 时全部尾部", () => {
		const first = pending("opt-1", "一");
		const second = pending("opt-2", "二");
		const landedUser = user("u-1", "q1");
		const landedReply = reply("a-1", "答");

		const grouped = mergeWithCausalAnchors({
			base: [landedUser, landedReply],
			order: [landedUser, first, second, landedReply],
			isPendingIndex: (i) => i === 1 || i === 2,
			landedBaseIndex: (i) => (i === 0 ? 0 : i === 3 ? 1 : undefined),
		});
		expect(grouped.items.map((item) => item.id)).toEqual(["u-1", "opt-1", "opt-2", "a-1"]);

		const empty = mergeWithCausalAnchors({
			base: [],
			order: [first, second],
			isPendingIndex: () => true,
			landedBaseIndex: () => undefined,
		});
		expect(empty.items.map((item) => item.id)).toEqual(["opt-1", "opt-2"]);
		expect(empty.baseIndexes).toEqual([]);
	});

	it("两层同形输入产出一致：head missing 落 canonical 首项之前、先于它的保留行之后", () => {
		// BUG-0073 缺陷 4：opener 旧实现把「reconciled 中先于首个 canonical
		// 项」的 missing 气泡放到合并结果绝对头部（先于 preserve 保留行），
		// snapshot 层却尾部兜底。共享助手的落位是唯一事实：保留行之后、
		// canonical 首项之前（(a) 后继锚定）。
		const preservedHead = pending("preserved-opt", "先前的气泡");
		const missing = pending("missing-opt", "回填气泡");
		const canonicalUser = user("u-1", "q1");
		const canonicalReply = reply("a-1", "答");
		const base = [preservedHead, canonicalUser, canonicalReply];

		const result = mergeWithCausalAnchors({
			base,
			order: [missing, canonicalUser, canonicalReply],
			isPendingIndex: (i) => i === 0,
			landedBaseIndex: (i) => (i === 1 ? 1 : i === 2 ? 2 : undefined),
		});

		expect(result.items.map((item) => item.id)).toEqual(["preserved-opt", "missing-opt", "u-1", "a-1"]);
	});
});
