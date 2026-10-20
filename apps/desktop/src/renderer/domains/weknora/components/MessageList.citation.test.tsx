// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { i18n, initI18n } from "@shared/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import type { WeKnoraChatMessage } from "../atoms";
import { MessageList } from "./MessageList";

// 本文件走**真实** Markdown 管线(不 mock RendererMarkdownContent):验证 Provider 在
// MessageList 的接线让历史回看与终态消息共用同一条引用渲染管道(AC-6)。
// web 外链点击通道的原子验证在 WeKnoraMarkdownProvider.test.tsx(带 jotai store)。

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

function assistant(overrides: Partial<WeKnoraChatMessage>): WeKnoraChatMessage {
	return { id: "a1", role: "assistant", text: "", thinking: "", status: "complete", ...overrides };
}

/** 当前挂载树里的思考段(ThinkingBlock 展开后的 p);终态回答走 Markdown,不会撞类。 */
function thinkingParagraph(container: HTMLElement): HTMLElement {
	const paragraph = container.querySelector<HTMLElement>("p.whitespace-pre-wrap");
	if (!paragraph) throw new Error("thinking paragraph not rendered");
	return paragraph;
}

describe("MessageList · T03 引用管道接线", () => {
	it("历史回看(AC-6):web 标签转链接、kb 维持现状文本、残缺剥除、思考区无标签", async () => {
		const user = userEvent.setup();
		const KB = '<kb doc="三分钟了解金蝶客户认证服务.md" chunk_id="c1" kb_id="b1" />';
		const WEB = '<web url="https://developer.kingdee.com/article/1" title="单点登录说明" />';
		const { container } = render(
			<MessageList
				messages={[
					assistant({
						thinking: `思考开始 ${KB} 中段 ${WEB} 结尾 <kb doc="截断`,
						text: `正文引用 ${WEB} 与 ${KB} 收尾。`,
					}),
				]}
			/>,
		);

		// 思考区默认收拢,先展开再断言。
		await user.click(screen.getByRole("button", { name: /思考过程/ }));
		const thinking = thinkingParagraph(container);
		expect(thinking.textContent).toContain("思考开始");
		expect(thinking.textContent).toContain("中段");
		expect(thinking.textContent).toContain("结尾");
		// 完整与残缺标签在思考区均不可见(AC-5/AC-7)。
		expect(thinking.textContent).not.toContain("<kb");
		expect(thinking.textContent).not.toContain("<web");
		expect(thinking.textContent).not.toContain('doc="截断');

		// 正文:web → 既有链接(显示域名);kb → 维持现状明文;残缺尾部不显示。
		const link = screen.getByRole("link", { name: "developer.kingdee.com" });
		expect(link.getAttribute("href")).toBe("https://developer.kingdee.com/article/1");
		expect(container.textContent).toContain("三分钟了解金蝶客户认证服务.md");
		expect(container.textContent).toContain("正文引用");
		expect(container.textContent).not.toContain('doc="截断');
	});

	it("流式期间(AC-5):全文暂存思考区,标签同样剥掉;纯文本暂存不走 Markdown 不产链接", () => {
		const { container } = render(
			<MessageList
				messages={[
					assistant({
						status: "streaming",
						text: `思考中 <kb doc="x" chunk_id="c1" /> 继续 <web url="https://e.com/a" title="t" />`,
					}),
				]}
			/>,
		);

		const thinking = thinkingParagraph(container);
		expect(thinking.textContent).toContain("思考中");
		expect(thinking.textContent).toContain("继续");
		expect(thinking.textContent).not.toContain("<kb");
		expect(thinking.textContent).not.toContain("<web");
		// 思考区是纯文本:web 标签剥除而非转链接;已有内容时也不再显示「思考中」三点。
		expect(screen.queryByRole("link")).toBeNull();
		expect(screen.queryByText(i18n.t("weknora:message.thinkingPending"))).toBeNull();
	});

	it("思考只剩标签:视为空,不渲染空壳思考块,等待首字的三点补位", () => {
		render(
			<MessageList
				messages={[
					assistant({ status: "streaming", text: '<kb doc="a" chunk_id="c1" kb_id="b1" /><web url="ht' }),
				]}
			/>,
		);

		expect(screen.queryByText(i18n.t("weknora:message.thinking"))).toBeNull();
		expect(screen.getByText(i18n.t("weknora:message.thinkingPending"))).toBeTruthy();
	});

	it("用户消息分支显式不动:粘贴的标签原样可见(不做项)", () => {
		const pasted = '我看不懂 <kb doc="a.md" chunk_id="c1" kb_id="b1" /> 这个';
		const { container } = render(
			<MessageList messages={[{ id: "u1", role: "user", text: pasted, thinking: "", status: "complete" }]} />,
		);

		expect(container.textContent).toContain(pasted);
	});
});
