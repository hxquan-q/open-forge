// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { i18n, initI18n } from "@shared/i18n";
import { RendererMarkdownContent } from "@shared/components/RendererMarkdownContent";
import { RendererMarkdownScope } from "@shared/components/RendererMarkdownScope";
import { useRendererMarkdownModel } from "@shared/hooks/useRendererMarkdownModel";
import type { DesktopApi, WeKnoraChunk } from "@preload/api";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider as JotaiProvider, createStore } from "jotai";
import type { ReactNode } from "react";
import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { WeKnoraMarkdownProvider } from "./WeKnoraMarkdownProvider";

/**
 * kb 角标的行为合同(T04;AC-1/2/8/9):经真实 Markdown 管线渲染 `<kb/>` 标签,
 * 断言角标语义(role/name/title/tabindex)、键盘触发、点击开关弹层、混排互不干扰、
 * 无 raw 残留。弹层三态/互斥/缓存/Escape 细测在 CitationPopover.test.tsx。
 * 走真实 i18n(zh):aria-label 的插值文案是断言对象之一(AC-10)。
 */

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

afterEach(cleanup);

const WORKSPACE = { cwd: "C:/projects/vetta", id: "C:/projects/vetta" } as const;

/** 与浏览器链接先例(WeKnoraMarkdownProvider.test)同款模型接法。 */
function ScopeHarness({ children }: { readonly children: ReactNode }): JSX.Element {
	const model = useRendererMarkdownModel(WORKSPACE.cwd, true, WORKSPACE.id);
	return <RendererMarkdownScope value={model}>{children}</RendererMarkdownScope>;
}

interface Deferred {
	resolve: (value: WeKnoraChunk) => void;
	reject: (reason: Error) => void;
}

/** 装一个可控的 getChunk 假 IPC(chunkClient.test 同款):返回手动推进的 Promise。 */
function installGetChunk(): { getChunk: ReturnType<typeof vi.fn>; pending: Deferred[] } {
	const pending: Deferred[] = [];
	const getChunk = vi.fn(
		() => new Promise<WeKnoraChunk>((resolve, reject) => pending.push({ resolve, reject })),
	);
	Object.defineProperty(window, "vetta", {
		configurable: true,
		writable: true,
		value: { weknora: { getChunk } } as unknown as DesktopApi,
	});
	return { getChunk, pending };
}

/** 经 Provider 包裹的真实管线渲染;jotai store 每次全新,弹层互斥原子不跨用例渗透。 */
function renderCitation(text: string): HTMLElement {
	return render(
		<JotaiProvider store={createStore()}>
			<ScopeHarness>
				<WeKnoraMarkdownProvider>
					<RendererMarkdownContent text={text} />
				</WeKnoraMarkdownProvider>
			</ScopeHarness>
		</JotaiProvider>,
	).container;
}

// 长文档名拷自 T00 实测真实会话夹具(v1-real-messages.json),仅文档名与资源 UUID,无凭据(C2)。
const LONG_DOC = "超值产品资料包等你领 _ 金蝶云社区“邀客户共学习”有奖活动上线！.md";
const KB_LONG = `<kb doc="${LONG_DOC}" chunk_id="c-badge-1" kb_id="78c47382-49f4-41bb-a11a-bc9c6f06f3a9" />`;
const SHORT_DOC = "产品手册.md";
const KB_SHORT = `<kb doc="${SHORT_DOC}" chunk_id="c-badge-4" kb_id="b-4" />`;
const WEB_TAG = '<web url="https://developer.kingdee.com/article/1?productLineId=29&amp;lang=zh" title="单点登录说明" />';

describe("CitationBadge · 角标语义(AC-1/2/9)", () => {
	it("kb 标签渲染为角标按钮:显示名截断加省略号、title 为全名、aria-label 含完整文档名、可聚焦、无 raw 残留", () => {
		const { getChunk } = installGetChunk();
		const view = renderCitation(`金蝶拥有**六大核心产品线**${KB_LONG}:`);

		const badge = screen.getByRole("button", { name: i18n.t("weknora:citation.badgeLabel", { doc: LONG_DOC }) });
		// 显示截断:约 13 字符量级,尾部省略号,绝不出全名(AC-1)。
		expect(badge.textContent?.length).toBeLessThanOrEqual(13);
		expect(badge.textContent?.endsWith("…")).toBe(true);
		expect(badge.textContent).not.toBe(LONG_DOC);
		// hover 全名走原生 title(AC-2)。
		expect(badge.getAttribute("title")).toBe(LONG_DOC);
		// 可聚焦(AC-9):原生 button,programmatic focus 直接落位。
		badge.focus();
		expect(document.activeElement).toBe(badge);
		// 正文无任何 raw 标签文本残留(AC-1)。
		expect(view.textContent).not.toContain("<kb");
		expect(view.textContent).not.toContain("chunk_id");
		// 悬停/渲染不取数:点击才发请求(不做项:悬停只看名)。
		expect(getChunk).not.toHaveBeenCalled();
	});
});

describe("CitationBadge · 键盘与点击(AC-9/AC-14)", () => {
	it("原生 button 语义:Enter/Space 激活走原生 click 通道,打开弹层;Escape 关闭后可再打开", async () => {
		const user = userEvent.setup();
		installGetChunk();
		renderCitation(`参见${KB_SHORT}说明`);

		const badge = screen.getByRole("button");
		// AC-9 的键盘契约:元素是原生 <button>(Enter/Space 激活是 UA 保证,组件不自写
		// keydown),jsdom 不模拟该 UA 默认行为,故按浏览器实际序列回放(keydown→click)
		// 锁定「激活最终走原生 click 通道」。
		expect(badge.tagName).toBe("BUTTON");
		expect(badge.getAttribute("role")).toBeNull();
		expect(badge.getAttribute("tabindex")).toBeNull();
		badge.focus();
		expect(document.activeElement).toBe(badge);

		fireEvent.keyDown(badge, { key: "Enter" });
		fireEvent.click(badge);
		expect(screen.getByRole("dialog")).toBeTruthy();

		// 焦点已在弹层卡体上,Escape 走统一快捷键作用域栈关闭。
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("dialog")).toBeNull();

		badge.focus();
		fireEvent.keyDown(badge, { key: " " });
		fireEvent.click(badge);
		expect(screen.getByRole("dialog")).toBeTruthy();
	});

	it("点击角标打开弹层;再次点击同一角标关闭(开关同一枚)", () => {
		installGetChunk();
		renderCitation(`参见${KB_SHORT}说明`);
		const badge = screen.getByRole("button");

		fireEvent.click(badge);
		expect(screen.getByRole("dialog")).toBeTruthy();

		fireEvent.click(badge);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("无 chunk_id 的退化标签:角标仍显示文档名,点击进失败态且不发 IPC(fail-open)", async () => {
		const { getChunk } = installGetChunk();
		renderCitation(`参见 <kb doc="${SHORT_DOC}" /> 说明`);

		fireEvent.click(screen.getByRole("button"));
		expect(await screen.findByText(i18n.t("weknora:citation.loadFailed"))).toBeTruthy();
		expect(getChunk).not.toHaveBeenCalled();
	});
});

describe("CitationBadge · 混排(AC-8)", () => {
	it("同段 kb+web 互不干扰:角标与链接并存,前后空格与标点不吞", () => {
		const view = renderCitation(`参照 ${KB_SHORT} 与 ${WEB_TAG} 以及句尾。`);

		expect(screen.getByRole("button")).toBeTruthy();
		expect(screen.getByRole("link", { name: "developer.kingdee.com" })).toBeTruthy();
		expect(view.textContent).toContain("参照 ");
		expect(view.textContent).toContain(" 与 ");
		expect(view.textContent).toContain(" 以及句尾。");
		expect(view.textContent).not.toContain("<kb");
		expect(view.textContent).not.toContain("<web");
	});
});
