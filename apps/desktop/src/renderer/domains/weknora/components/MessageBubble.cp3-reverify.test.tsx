// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { i18n, initI18n } from "@shared/i18n";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { WeKnoraChatMessage } from "../atoms";
import { stripCitationTags } from "../services/citationTag";
import { MessageBubble } from "./MessageBubble";

/**
 * flow-tester CP3 复验(weknora-kb-citation,06-review-fixes §②)。
 *
 * 修复单:`displayThinking` 由「每次渲染重算」改为 `useMemo([isUser, thinkingText])`。
 * 本文件从**独立角度**钉住两件事:
 *   A. 行为等价——同一输入(完整/残缺/无标签 × isUser 两态)渲染输出与既有验收口径逐字符一致。
 *   B. memo 真实收益——用 spy 包住真实 `stripCitationTags`,构造「依赖未变但组件确已重渲染」的
 *      场景(改 message.status 改变 DOM 却不触碰 memo 依赖),证明该函数**不再被重复调用**;
 *      再构造依赖变化场景证明**会重算**。B 是本次修复的实质,必须有用例。
 *
 * spy 只数调用次数、实现仍委托真函数(行为不变);断言基于渲染输出与调用计数,不碰实现文件。
 */

// CP3 复验:spy 包住真实实现,只统计调用次数(保留原语义)。
vi.mock("../services/citationTag", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../services/citationTag")>();
	return { ...actual, stripCitationTags: vi.fn(actual.stripCitationTags) };
});

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

beforeEach(() => {
	vi.mocked(stripCitationTags).mockClear();
});

afterEach(cleanup);

function assistant(overrides: Partial<WeKnoraChatMessage>): WeKnoraChatMessage {
	return { id: "a1", role: "assistant", text: "", thinking: "", status: "complete", ...overrides };
}

function user(overrides: Partial<WeKnoraChatMessage>): WeKnoraChatMessage {
	return { id: "u1", role: "user", text: "", thinking: "", status: "complete", ...overrides };
}

/** 终态思考块展开后的思考段(ThinkingBlock 的 p)。 */
function thinkingParagraph(container: HTMLElement): HTMLElement {
	const paragraph = container.querySelector<HTMLElement>("p.whitespace-pre-wrap");
	if (!paragraph) throw new Error("thinking paragraph not rendered");
	return paragraph;
}

/** stripCitationTags 的累计调用次数。 */
function stripCalls(): number {
	return vi.mocked(stripCitationTags).mock.calls.length;
}

const KB = '<kb doc="a.md" chunk_id="c1" kb_id="b1" />';
const WEB = '<web url="https://e.com/x" title="t" />';

describe("CP3 复验 A · 行为等价(isUser 两态 × 完整/残缺/无标签)", () => {
	it("A1 assistant 终态:完整 kb+web 剥除,展示串逐字符等于期望", async () => {
		const user1 = userEvent.setup();
		const { container } = render(
			<MessageBubble message={assistant({ thinking: `先想 ${KB} 再想 ${WEB} 最后`, text: "正式回答" })} />,
		);
		await user1.click(screen.getByRole("button", { name: /思考过程/ }));
		const paragraph = thinkingParagraph(container);
		expect(paragraph.textContent).toBe("先想  再想  最后");
		expect(paragraph.textContent).not.toContain("<kb");
		expect(paragraph.textContent).not.toContain("<web");
	});

	it("A2 assistant 终态:残缺尾部剥除,前文标点逐字保留", async () => {
		const user1 = userEvent.setup();
		const { container } = render(
			<MessageBubble message={assistant({ thinking: `结论见 ${KB} 与 ${WEB},尾 <web url=`, text: "答" })} />,
		);
		await user1.click(screen.getByRole("button", { name: /思考过程/ }));
		const paragraph = thinkingParagraph(container);
		expect(paragraph.textContent).toBe("结论见  与 ,尾 ");
		expect(paragraph.textContent).not.toContain("url=");
	});

	it("A3 assistant 终态:无标签文本输出与输入逐字符一致(零回归)", async () => {
		const user1 = userEvent.setup();
		const plain = "普通思考:包含标点,与 空格、< 字面量 < 5 也应保留。";
		const { container } = render(<MessageBubble message={assistant({ thinking: plain, text: "答" })} />);
		await user1.click(screen.getByRole("button", { name: /思考过程/ }));
		expect(thinkingParagraph(container).textContent).toBe(plain);
	});

	it("A4 user 态:用户消息思考不剥标签(尊重原文),且不进入剥离分支", async () => {
		const user1 = userEvent.setup();
		const raw = `用户原文 ${KB}`;
		const { container } = render(<MessageBubble message={user({ thinking: raw, text: "提问" })} />);
		await user1.click(screen.getByRole("button", { name: /思考过程/ }));
		expect(thinkingParagraph(container).textContent).toBe(raw);
		// isUser 分支短路:stripCitationTags 从未被调用。
		expect(stripCalls()).toBe(0);
	});

	it("A5 assistant 流式:完整+残缺同点剥除,可见层无标签", () => {
		const { container } = render(
			<MessageBubble
				message={assistant({ status: "streaming", text: `思考中 ${KB} 继续 ${WEB} 尾巴 <kb doc=` })}
			/>,
		);
		const paragraph = thinkingParagraph(container);
		const fullTextAnchor = paragraph.querySelector<HTMLElement>(".sr-only");
		if (!fullTextAnchor) throw new Error("streaming sr-only anchor not rendered");
		expect(fullTextAnchor.textContent).toBe("思考中  继续  尾巴 ");
		expect(paragraph.textContent).not.toContain("<kb");
		expect(paragraph.textContent).not.toContain("<web");
	});
});

describe("CP3 复验 B · memo 真实收益(spy 计数)", () => {
	it("B1 依赖未变的重渲染:DOM 确实更新,但 stripCitationTags 不再被调用", () => {
		const { rerender } = render(
			<MessageBubble message={assistant({ status: "complete", thinking: `想 ${KB}`, text: "答" })} />,
		);
		expect(stripCalls()).toBe(1);
		expect(screen.queryByText(i18n.t("weknora:message.cancelled"))).toBeNull();

		// status 变化 → 组件必须重渲染(终态状态标签出现),但 isUser/thinkingText 未变 ⇒ memo 命中。
		rerender(<MessageBubble message={assistant({ status: "cancelled", thinking: `想 ${KB}`, text: "答" })} />);
		// DOM 确实变了(重渲染铁证),否则本用例证明不了 memo 生效。
		expect(screen.getByText(i18n.t("weknora:message.cancelled"))).toBeTruthy();
		expect(stripCalls()).toBe(1);
	});

	it("B2 连续多次同依赖重渲染:调用计数恒定为 1(累计 O(n²) 已消除)", () => {
		const { rerender } = render(
			<MessageBubble message={assistant({ status: "complete", thinking: `想 ${KB}`, text: "答" })} />,
		);
		expect(stripCalls()).toBe(1);
		for (const status of ["cancelled", "interrupted", "complete", "cancelled"] as const) {
			rerender(<MessageBubble message={assistant({ status, thinking: `想 ${KB}`, text: "答" })} />);
		}
		expect(stripCalls()).toBe(1);
	});

	it("B3 思考文本变化:依赖命中,stripCitationTags 重算(计数 +1)且输出更新", async () => {
		const user1 = userEvent.setup();
		const { container, rerender } = render(
			<MessageBubble message={assistant({ thinking: `旧 ${KB}`, text: "答" })} />,
		);
		expect(stripCalls()).toBe(1);

		rerender(<MessageBubble message={assistant({ thinking: `新 ${KB} ${WEB}`, text: "答" })} />);
		expect(stripCalls()).toBe(2);

		await user1.click(screen.getByRole("button", { name: /思考过程/ }));
		expect(thinkingParagraph(container).textContent).toBe("新  ");
	});

	it("B4 isUser 切换:依赖命中,剥离分支正确重算(user 不计,assistant 计)", () => {
		const { rerender } = render(<MessageBubble message={user({ thinking: `原文 ${KB}`, text: "问" })} />);
		expect(stripCalls()).toBe(0);

		// 同一 thinkingText 但 isUser 由 true→false ⇒ 依赖变化 ⇒ 必须重算一次。
		rerender(<MessageBubble message={assistant({ thinking: `原文 ${KB}`, text: "问" })} />);
		expect(stripCalls()).toBe(1);
	});

	it("B5 负向对照:同款表达式若不加 memo,同场景下会重复调用(spy 能辨别 memo 与否)", () => {
		// 测试局部组件:与 MessageBubble 同款表达式但**故意不加 useMemo**,证明本文件的 spy 计数
		// 对「有无 memo」是敏感的 —— 否则 B1 的恒定 1 可能只是计数没生效。
		function NonMemoBubble({ msg }: { readonly msg: WeKnoraChatMessage }): JSX.Element {
			const display = msg.role === "user" ? msg.thinking : stripCitationTags(msg.thinking);
			return <span>{display}</span>;
		}

		const { rerender } = render(<NonMemoBubble msg={assistant({ thinking: `想 ${KB}`, text: "答" })} />);
		expect(stripCalls()).toBe(1);
		// 与 B1 完全相同的重渲染(仅 status 变、依赖值不变)。
		rerender(<NonMemoBubble msg={assistant({ status: "cancelled", thinking: `想 ${KB}`, text: "答" })} />);
		expect(stripCalls()).toBe(2);
	});
});

describe("CP3 复验 C · showThinkingDots 空壳判定未变", () => {
	it("C1 流式且思考只剩标签:无思考块,三点补位", () => {
		render(<MessageBubble message={assistant({ status: "streaming", text: `${KB}${WEB}<kb doc=` })} />);
		expect(screen.queryByRole("button", { name: /思考过程/ })).toBeNull();
		expect(screen.getByText(i18n.t("weknora:message.thinkingPending"))).toBeTruthy();
	});

	it("C2 流式且有可见思考:思考块在,三点不叠显", () => {
		render(<MessageBubble message={assistant({ status: "streaming", text: `可见 ${KB}` })} />);
		expect(screen.getByRole("button", { name: /思考过程/ })).toBeTruthy();
		expect(screen.queryByText(i18n.t("weknora:message.thinkingPending"))).toBeNull();
	});

	it("C3 流式且思考为空串:无思考块,三点补位", () => {
		render(<MessageBubble message={assistant({ status: "streaming", text: "" })} />);
		expect(screen.queryByRole("button", { name: /思考过程/ })).toBeNull();
		expect(screen.getByText(i18n.t("weknora:message.thinkingPending"))).toBeTruthy();
	});

	it("C4 终态且思考只剩标签:空壳判定只在流式,三点不显示", () => {
		render(<MessageBubble message={assistant({ status: "complete", thinking: `${KB}${WEB}`, text: "答" })} />);
		expect(screen.queryByRole("button", { name: /思考过程/ })).toBeNull();
		expect(screen.queryByText(i18n.t("weknora:message.thinkingPending"))).toBeNull();
	});
});
