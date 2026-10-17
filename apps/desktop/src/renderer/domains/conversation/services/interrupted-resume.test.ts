// Copyright The Open Forge contributors.
import type { ChatTimelineItem } from "@shared/store/atoms";
import { describe, expect, it } from "vitest";
import { resolveInterruptedErrorKind } from "./interrupted-resume";

function agentWithBlocks(blocks: Array<Record<string, unknown>>): ChatTimelineItem {
	return { kind: "agent", blocks } as unknown as ChatTimelineItem;
}

function userMessage(): ChatTimelineItem {
	return { kind: "user", text: "继续" } as unknown as ChatTimelineItem;
}

const errorBlock = (kind: string) => ({ type: "error", id: "e1", kind, text: "boom" });
const textBlock = { type: "text", id: "t1", text: "完成" };

const idle = { isStreaming: false, isCompacting: false, hasPendingQueue: false };

describe("resolveInterruptedErrorKind", () => {
	it.each([
		["network", "network"],
		["server", "server"],
		["rate_limit", "rate_limit"],
		["stream_idle", "stream_idle"],
		["unknown", "unknown"],
	])("末尾助手消息以 %s 错误收尾且空闲 → 显示继续条", (kind, expected) => {
		expect(resolveInterruptedErrorKind([agentWithBlocks([textBlock, errorBlock(kind)])], idle)).toBe(expected);
	});

	it.each(["quota", "auth"])("末尾为 %s 错误 → 不显示（保持设置引导）", (kind) => {
		expect(resolveInterruptedErrorKind([agentWithBlocks([errorBlock(kind)])], idle)).toBeUndefined();
	});

	it("末尾助手消息正常结束 → 不显示", () => {
		expect(
			resolveInterruptedErrorKind([agentWithBlocks([errorBlock("network")]), agentWithBlocks([textBlock])], idle),
		).toBeUndefined();
	});

	it("早期轮次的失败被后续正常回复盖过 → 不显示", () => {
		expect(
			resolveInterruptedErrorKind(
				[agentWithBlocks([errorBlock("network")]), userMessage(), agentWithBlocks([textBlock])],
				idle,
			),
		).toBeUndefined();
	});

	it.each([
		["streaming", { isStreaming: true, isCompacting: false, hasPendingQueue: false }],
		["compacting", { isStreaming: false, isCompacting: true, hasPendingQueue: false }],
		["待派发排队输入", { isStreaming: false, isCompacting: false, hasPendingQueue: true }],
	])("会话忙碌（%s）→ 不显示", (_name, context) => {
		expect(resolveInterruptedErrorKind([agentWithBlocks([errorBlock("network")])], context)).toBeUndefined();
	});

	it("空消息列表 → 不显示", () => {
		expect(resolveInterruptedErrorKind([], idle)).toBeUndefined();
	});
});
