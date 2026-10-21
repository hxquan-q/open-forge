// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { i18n, initI18n } from "@shared/i18n";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { WeKnoraChatMessage } from "../atoms";
import { MessageBubble } from "./MessageBubble";

/**
 * flow-tester 独立验收测试(weknora-kb-citation,AC-5 思考区剥标签)。
 *
 * 实现者的思考区用例挂在 MessageList.citation.test.tsx(整列表 + toContain 点查);本文件
 * 直接测 MessageBubble,角度换成**精确期望串**:思考区展示文本必须逐字符等于"手工去掉标签
 * 后的正文"(空格归属逐字核对),终态与流式两形态分别锁定。store 原文零改动的一体两面
 * (展示剥、库存原文)由 weknoraCitationStore.acceptance.test.ts 从引擎侧背书。
 */

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

afterEach(cleanup);

function assistant(overrides: Partial<WeKnoraChatMessage>): WeKnoraChatMessage {
	return { id: "a1", role: "assistant", text: "", thinking: "", status: "complete", ...overrides };
}

/** 终态思考块展开后的思考段(ThinkingBlock 的 p)。 */
function thinkingParagraph(container: HTMLElement): HTMLElement {
	const paragraph = container.querySelector<HTMLElement>("p.whitespace-pre-wrap");
	if (!paragraph) throw new Error("thinking paragraph not rendered");
	return paragraph;
}

const KB = '<kb doc="a.md" chunk_id="c1" kb_id="b1" />';
const WEB = '<web url="https://e.com/x" title="t" />';

describe("MessageBubble 验收 · 思考区剥标签(AC-5)", () => {
	it("终态思考:完整 kb/web 与残缺尾部全部剥除,展示文本逐字符等于期望串", async () => {
		const user = userEvent.setup();
		const thinking = `先想 ${KB} 再想 ${WEB} 最后 <web url=`;
		const { container } = render(
			// text 无标签:MessageBubble 单测不在 MessageList 的 Provider 内,正文管道与本文件无关。
			<MessageBubble message={assistant({ thinking, text: "正式回答" })} />,
		);

		// 终态思考默认收拢,展开后断言。
		await user.click(screen.getByRole("button", { name: /思考过程/ }));
		const paragraph = thinkingParagraph(container);
		expect(paragraph.textContent).toBe("先想  再想  最后 ");
		expect(paragraph.textContent).not.toContain("<kb");
		expect(paragraph.textContent).not.toContain("<web");
		expect(paragraph.textContent).not.toContain("url=");
	});

	it("流式期间(全文暂存思考):同一剥离立即生效,不走 Markdown 不产链接", () => {
		const { container } = render(
			<MessageBubble
				message={assistant({
					status: "streaming",
					text: `思考中 ${KB} 继续 ${WEB} 尾巴 <kb doc="x" chunk`,
				})}
			/>,
		);

		// 流式思考默认展开。ThinkingBlock 的流式分支除逐字 span 外,还留一份视觉隐藏的连续
		// 全文锚点(sr-only,辅助技术与整串查询的规范来源)——精确期望串断言落在这里;
		// 逐字可见层(aria-hidden)同样不得含标签。
		const paragraph = thinkingParagraph(container);
		const fullTextAnchor = paragraph.querySelector<HTMLElement>(".sr-only");
		if (!fullTextAnchor) throw new Error("streaming sr-only full-text anchor not rendered");
		expect(fullTextAnchor.textContent).toBe("思考中  继续  尾巴 ");
		expect(paragraph.textContent).not.toContain("<kb");
		expect(paragraph.textContent).not.toContain("<web");
		expect(screen.queryByRole("link")).toBeNull();
		// 已有可见思考时,「思考中」三点不再叠显。
		expect(screen.queryByText(i18n.t("weknora:message.thinkingPending"))).toBeNull();
	});

	it("思考只剩标签(含残缺):视为空,不渲染思考块,三点补位", () => {
		render(<MessageBubble message={assistant({ status: "streaming", text: `${KB}${WEB}<kb doc=` })} />);

		expect(screen.queryByRole("button", { name: /思考过程/ })).toBeNull();
		expect(screen.getByText(i18n.t("weknora:message.thinkingPending"))).toBeTruthy();
	});
});
