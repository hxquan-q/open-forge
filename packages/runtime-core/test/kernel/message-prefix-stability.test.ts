import type { Message, UserMessage } from "@vetta/ai";
import { describe, expect, it } from "vitest";
import {
	compareMessagePrefixes,
	createMessagePrefixStabilityTracker,
} from "../../src/kernel/message-prefix-stability.js";

describe("message prefix stability", () => {
	it("classifies the first observation as first without a previous projection", () => {
		expect(compareMessagePrefixes(undefined, [user("a"), user("b")])).toEqual({
			kind: "first",
			previousMessageCount: 0,
			currentMessageCount: 2,
			stablePrefixMessageCount: 0,
			contentFallbackCount: 0,
		});
	});

	it("classifies an appended tail as append-only via object identity", () => {
		const previous = [user("a"), user("b")];
		const current = [...previous, user("c")];

		expect(compareMessagePrefixes(previous, current)).toEqual({
			kind: "append_only",
			previousMessageCount: 2,
			currentMessageCount: 3,
			stablePrefixMessageCount: 2,
			contentFallbackCount: 0,
		});
	});

	it("keeps append-only when rebuilt messages carry equal content", () => {
		const previous = [user("a"), user("b")];
		const current = [user("a"), user("b"), user("c")];

		expect(compareMessagePrefixes(previous, current)).toEqual({
			kind: "append_only",
			previousMessageCount: 2,
			currentMessageCount: 3,
			stablePrefixMessageCount: 2,
			contentFallbackCount: 2,
		});
	});

	it("reports prefix rewrite from the first divergent message", () => {
		const previous = [user("a"), user("b"), user("c")];
		const current = [user("a"), user("changed"), user("c"), user("d")];

		expect(compareMessagePrefixes(previous, current)).toEqual({
			kind: "prefix_rewrite",
			previousMessageCount: 3,
			currentMessageCount: 4,
			stablePrefixMessageCount: 1,
			firstDivergenceIndex: 1,
			// index 0 是同内容的新对象：身份未命中、内容命中，计为回退而非分歧。
			contentFallbackCount: 1,
		});
	});

	it("classifies a truncated history as prefix shrink", () => {
		const previous = [user("a"), user("b"), user("c")];
		const current = [previous[0], previous[1]];

		expect(compareMessagePrefixes(previous, current)).toEqual({
			kind: "prefix_shrink",
			previousMessageCount: 3,
			currentMessageCount: 2,
			stablePrefixMessageCount: 2,
			contentFallbackCount: 0,
		});
	});

	it("treats string content and a single text block as the same message", () => {
		const previous: readonly Message[] = [user("same")];
		const current: readonly Message[] = [{ role: "user", content: [{ type: "text", text: "same" }], timestamp: 1 }];

		expect(compareMessagePrefixes(previous, current)).toMatchObject({
			kind: "append_only",
			stablePrefixMessageCount: 1,
			contentFallbackCount: 1,
		});
	});

	it("keeps append-only when a rebuilt message only differs in key insertion order", () => {
		const previous: readonly Message[] = [{ role: "user", content: [{ type: "text", text: "same" }], timestamp: 1 }];
		const current: readonly Message[] = [{ timestamp: 1, content: [{ text: "same", type: "text" }], role: "user" }];

		// 重建消息的键序漂移是内容判等的规范形差异，不是前缀改写。
		expect(compareMessagePrefixes(previous, current)).toMatchObject({
			kind: "append_only",
			stablePrefixMessageCount: 1,
			contentFallbackCount: 1,
		});
	});

	it("re-observing an unchanged projection stays append-only with zero appended messages", () => {
		const tracker = createMessagePrefixStabilityTracker();
		const projection = [user("a"), user("b")];

		expect(tracker.observe(projection)).toMatchObject({ kind: "first" });
		expect(tracker.observe(projection)).toEqual({
			kind: "append_only",
			previousMessageCount: 2,
			currentMessageCount: 2,
			stablePrefixMessageCount: 2,
			contentFallbackCount: 0,
		});
	});
});

function user(content: string): UserMessage {
	return { role: "user", content, timestamp: 1 };
}
