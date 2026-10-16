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

	it("文案走 i18n：思考区标题取自 catalog（zh）", () => {
		render(<MessageBubble message={assistant({ status: "complete", thinking: "思考", text: "回答" })} />);
		expect(screen.getByText(i18n.t("weknora:message.thinking"))).toBeTruthy();
	});
});
