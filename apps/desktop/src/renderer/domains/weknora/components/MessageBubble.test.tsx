// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { i18n, initI18n } from "@shared/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { WeKnoraChatMessage } from "../atoms";
import { MessageBubble } from "./MessageBubble";

// Markdown 渲染由共享管线负责（真实实现依赖 activity-panel 上下文）；这里替换成可断言的桩。
vi.mock("@shared/components/RendererMarkdownContent", () => ({
	RendererMarkdownContent: ({ text }: { text: string }) => <div data-testid="weknora-markdown">{text}</div>,
}));

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

function assistant(overrides: Partial<WeKnoraChatMessage>): WeKnoraChatMessage {
	return { id: "a1", role: "assistant", text: "", thinking: "", status: "complete", ...overrides };
}

describe("MessageBubble · AC-25 思考/回答分区", () => {
	it("流式中：思考区可见，文本实时增长（纯文本、未做 Markdown）", () => {
		const { rerender } = render(<MessageBubble message={assistant({ status: "streaming", text: "思考" })} />);
		expect(screen.getByText("思考过程")).toBeTruthy();
		expect(screen.getByText("思考")).toBeTruthy();
		expect(screen.queryByTestId("weknora-markdown")).toBeNull();

		rerender(<MessageBubble message={assistant({ status: "streaming", text: "思考继续增长" })} />);
		expect(screen.getByText("思考继续增长")).toBeTruthy();
	});

	it("complete 后：思考区自动收拢，回答区铺开且为 Markdown", () => {
		render(<MessageBubble message={assistant({ status: "complete", thinking: "思考原文", text: "正式回答" })} />);

		// 思考区标题在，但原文已收拢不可见。
		expect(screen.getByText("思考过程")).toBeTruthy();
		expect(screen.queryByText("思考原文")).toBeNull();
		// 回答区铺开且为 Markdown。
		expect(screen.getByTestId("weknora-markdown").textContent).toBe("正式回答");
	});

	it("手动展开：思考原文可见", async () => {
		const user = userEvent.setup();
		render(<MessageBubble message={assistant({ status: "complete", thinking: "思考原文", text: "正式回答" })} />);
		await user.click(screen.getByRole("button", { name: /思考过程/ }));
		expect(screen.getByText("思考原文")).toBeTruthy();
	});

	it("直答场景：不出现思考区（无空壳）", () => {
		render(<MessageBubble message={assistant({ status: "complete", thinking: "", text: "直答内容" })} />);
		expect(screen.queryByText("思考过程")).toBeNull();
		expect(screen.getByTestId("weknora-markdown").textContent).toBe("直答内容");
	});

	it("按 role 渲染身份标签：user「我」/ assistant「智能客服」（AC-14 消息序列）", () => {
		const { rerender } = render(
			<MessageBubble message={{ id: "u1", role: "user", text: "提问", thinking: "", status: "complete" }} />,
		);
		expect(screen.getByText("我")).toBeTruthy();

		rerender(<MessageBubble message={assistant({ text: "回答" })} />);
		expect(screen.getByText("智能客服")).toBeTruthy();
	});

	it("文案走 i18n：思考区标题取自 catalog（zh）", () => {
		render(<MessageBubble message={assistant({ status: "complete", thinking: "思考", text: "回答" })} />);
		expect(screen.getByText(i18n.t("weknora:message.thinking"))).toBeTruthy();
	});
});

describe("MessageBubble · T02 逐字入场（AC-4/5/6）", () => {
	/** 可见层：逐字 span 的父 span（对 AT aria-hidden）；用它取「屏幕上实际显示的文本」。 */
	function visibleText(container: HTMLElement): string {
		return container.querySelector("p > span[aria-hidden='true']")?.textContent ?? "";
	}

	it("流式增量：新到达的字符逐个带入场动画类，可见文本与源文本逐字节一致（AC-4/AC-5）", () => {
		const { container } = render(<MessageBubble message={assistant({ status: "streaming", text: "你好" })} />);
		const spans = container.querySelectorAll(".weknora-stream-char");
		expect(spans.length).toBe(2);
		// 动画只影响呈现：拼回的字符与源文本逐字节一致。
		expect(Array.from(spans, (span) => span.textContent).join("")).toBe("你好");
		expect(visibleText(container)).toBe("你好");
	});

	it("追加 delta：旧字符的 span 节点被复用（不重建、不重播），只给新字符挂动画（R1 性能）", () => {
		const { container, rerender } = render(
			<MessageBubble message={assistant({ status: "streaming", text: "你好" })} />,
		);
		const before = Array.from(container.querySelectorAll(".weknora-stream-char"));

		rerender(<MessageBubble message={assistant({ status: "streaming", text: "你好世界" })} />);
		const after = Array.from(container.querySelectorAll(".weknora-stream-char"));

		expect(after.length).toBe(4);
		// 已在屏幕上的字符仍是同一个 DOM 节点（React 按绝对下标复用），动画不会重播。
		expect(after[0]).toBe(before[0]);
		expect(after[1]).toBe(before[1]);
		expect(visibleText(container)).toBe("你好世界");
	});

	it("长回答：挂动画的字符 span 数量有界（尾部窗口），可见文本仍是全文（AC-5/性能）", () => {
		const long = "字".repeat(200);
		const { container } = render(<MessageBubble message={assistant({ status: "streaming", text: long })} />);
		// 尾部窗口大小（ThinkingBlock.STREAM_CHAR_WINDOW = 64）：不随回答长度线性增长。
		expect(container.querySelectorAll(".weknora-stream-char").length).toBeLessThanOrEqual(64);
		expect(visibleText(container)).toBe(long);
	});

	it("历史载入的完整消息不挂动画（AC-6）", async () => {
		const user = userEvent.setup();
		const { container } = render(
			<MessageBubble message={assistant({ status: "complete", thinking: "历史思考", text: "历史回答" })} />,
		);
		expect(container.querySelectorAll(".weknora-stream-char").length).toBe(0);

		await user.click(screen.getByRole("button", { name: /思考过程/ }));
		expect(screen.getByText("历史思考")).toBeTruthy();
		expect(container.querySelectorAll(".weknora-stream-char").length).toBe(0);
	});

	it("用户消息不挂动画（AC-6）", () => {
		const { container } = render(
			<MessageBubble message={{ id: "u1", role: "user", text: "提问", thinking: "", status: "complete" }} />,
		);
		expect(container.querySelectorAll(".weknora-stream-char").length).toBe(0);
	});

	it("终态：动画类消失，回答走 Markdown 渲染路径（AC-5）", () => {
		const { container, rerender } = render(
			<MessageBubble message={assistant({ status: "streaming", text: "回答" })} />,
		);
		expect(container.querySelectorAll(".weknora-stream-char").length).toBeGreaterThan(0);

		rerender(<MessageBubble message={assistant({ status: "complete", thinking: "", text: "回答" })} />);
		expect(container.querySelectorAll(".weknora-stream-char").length).toBe(0);
		expect(screen.getByTestId("weknora-markdown").textContent).toBe("回答");
	});
});
