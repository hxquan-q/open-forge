// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { RendererMarkdownContent } from "@shared/components/RendererMarkdownContent";
import { RendererMarkdownScope } from "@shared/components/RendererMarkdownScope";
import { useRendererMarkdownModel } from "@shared/hooks/useRendererMarkdownModel";
import { i18n, initI18n } from "@shared/i18n";
import type { DesktopApi, WeKnoraChunk } from "@preload/api";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider as JotaiProvider, createStore } from "jotai";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { WeKnoraMarkdownProvider } from "./WeKnoraMarkdownProvider";

/**
 * flow-tester 独立验收测试(weknora-kb-citation,AC-14/15/16 弹层侧)。
 *
 * 与实现者用例(CitationPopover.test.tsx)的角度差异:
 * - 成功态断言"content 按纯文本渲染"(markdown 记号/HTML 标签一律字面展示,不进 Markdown)——弹层
 *   契约里没写但用户可见且安全相关(原文含 <> 时绝不能变成真元素);
 * - 失败拒绝用**非 Error 裸对象**(IPC 边界最不利形态),不只测 Error;
 * - 窄窗口/贴底锚点的定位收敛数值断言(长文档名+极窄窗口真空区);
 * - 缓存与失败重试全部按 UI 时序推进(在途重开不重发、失败重开重发、同 chunk 双角标互切)。
 * 测试一律假 IPC + 假通道,无任何 Key(C1/C2)。
 */

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

afterEach(() => {
	vi.restoreAllMocks();
	cleanup();
});

const WORKSPACE = { cwd: "C:/projects/vetta", id: "C:/projects/vetta" } as const;

function ScopeHarness({ children }: { readonly children: ReactNode }): JSX.Element {
	const model = useRendererMarkdownModel(WORKSPACE.cwd, true, WORKSPACE.id);
	return <RendererMarkdownScope value={model}>{children}</RendererMarkdownScope>;
}

interface Deferred {
	resolve: (value: WeKnoraChunk) => void;
	reject: (reason: unknown) => void;
}

function installGetChunk(): { getChunk: ReturnType<typeof vi.fn>; pending: Deferred[] } {
	const pending: Deferred[] = [];
	const getChunk = vi.fn(
		() =>
			new Promise<WeKnoraChunk>((resolve, reject) => {
				pending.push({ resolve, reject });
			}),
	);
	Object.defineProperty(window, "vetta", {
		configurable: true,
		writable: true,
		value: { weknora: { getChunk } } as unknown as DesktopApi,
	});
	return { getChunk, pending };
}

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

function kbTag(doc: string, chunkId: string): string {
	return `<kb doc="${doc}" chunk_id="${chunkId}" kb_id="b" />`;
}

/**
 * F2 授权契约演进:弹层内唯一的 button 必须是显式关闭按钮(无其他操作/编辑按钮)。
 * 断言数量恰为 1 并返回其 aria-label 供逐字比对——把 AC-15「无编辑入口」的意图钉得更准。
 */
function singleButtonLabel(dialog: HTMLElement): string | null {
	const buttons = dialog.querySelectorAll("button");
	expect(buttons).toHaveLength(1);
	return buttons[0]?.getAttribute("aria-label") ?? null;
}

const LONG_DOC = "超值产品资料包等你领 _ 金蝶云社区“邀客户共学习”有奖活动上线！.md";

describe("CitationPopover 验收 · 打开/聚焦/取数(AC-14)", () => {
	it("点击角标即按 chunkId 取数;弹层 portal+dialog 语义;打开即聚焦卡体;加载态文案", async () => {
		const { getChunk } = installGetChunk();
		renderCitation(`参见${kbTag("文档甲.md", "apop-1")}`);

		const badge = screen.getByRole("button");
		fireEvent.click(badge);

		const dialog = screen.getByRole("dialog", { name: "引用原文" });
		// portal 到 body(浮层范式,不嵌在消息 DOM 里)。
		expect(dialog.parentElement).toBe(document.body);
		// 打开即聚焦:键盘用户立刻处于 Escape 作用域。
		expect(document.activeElement).toBe(dialog);
		expect(dialog.getAttribute("tabindex")).toBe("-1");
		// 点击即取数,参数就是 chunkId。
		expect(getChunk).toHaveBeenCalledTimes(1);
		expect(getChunk).toHaveBeenCalledWith({ chunkId: "apop-1" });
		// 加载态:i18n 文案在场。
		expect(screen.getByText("正在加载引用原文…")).toBeTruthy();
	});
});

describe("CitationPopover 验收 · 成功态纯文本渲染(AC-14)", () => {
	it("content 原文按字面展示:markdown 记号与尖括号标签都不解析成元素;文档名同屏", async () => {
		const { pending } = installGetChunk();
		renderCitation(`参见${kbTag("文档乙.md", "apop-2")}`);
		const content = "第一行 **不是加粗** <b>不是标签</b>\n第二行 <kb 也不是标签";
		fireEvent.click(screen.getByRole("button"));
		await act(async () => {
			pending[0]?.resolve({ content, knowledgeId: "k", kbId: "b" });
		});

		const dialog = screen.getByRole("dialog");
		// 原文逐字可见(含换行),且所在节点是纯文本段落(whitespace-pre-wrap),不是 Markdown 产物。
		const contentNode = within(dialog).getByText("第一行 **不是加粗** <b>不是标签</b> 第二行 <kb 也不是标签");
		expect(contentNode.tagName).toBe("P");
		expect(contentNode.getAttribute("class")).toContain("whitespace-pre-wrap");
		expect(contentNode.textContent).toBe(content);
		// 原文里的标记不产生任何真实元素(只读展示,不执行内容)。
		expect(dialog.querySelectorAll("strong,b,i,em,a,code,weknora-citation")).toHaveLength(0);
		// 文档名在弹层标题区(title 行)。
		expect(within(dialog).getByText("文档乙.md")).toBeTruthy();
		// 加载态退场。
		expect(screen.queryByText("正在加载引用原文…")).toBeNull();
	});
});

describe("CitationPopover 验收 · 失败态(AC-14)", () => {
	it("非 Error 裸对象拒绝(IPC 最不利形态)同样降级为 i18n 文案,不透出 raw,弹层不崩", async () => {
		const { pending } = installGetChunk();
		renderCitation(`参见${kbTag("文档丙.md", "apop-3")}`);
		fireEvent.click(screen.getByRole("button"));
		await act(async () => {
			pending[0]?.reject({ code: "unauthorized", detail: "raw-secret-detail" });
		});

		expect(await screen.findByText("引用原文暂时无法加载,请稍后重试。")).toBeTruthy();
		expect(document.body.textContent).not.toContain("raw-secret-detail");
		expect(document.body.textContent).not.toContain("unauthorized");
		// 弹层仍在(失败可读,关闭走 Escape/点外)。
		expect(screen.getByRole("dialog")).toBeTruthy();
	});
});

describe("CitationPopover 验收 · 关闭(AC-14)", () => {
	it("Escape 经快捷键作用域栈关闭(user.keyboard 真实键序)", async () => {
		const user = userEvent.setup();
		installGetChunk();
		renderCitation(`参见${kbTag("文档丁.md", "apop-4")}`);
		fireEvent.click(screen.getByRole("button"));
		expect(screen.getByRole("dialog")).toBeTruthy();

		await user.keyboard("{Escape}");
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});

describe("CitationPopover 验收 · 窄窗口与贴边定位(AC-14 定位契约)", () => {
	function mockViewport(width: number, height: number, popoverWidth: number, popoverHeight: number): void {
		Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
		Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
		vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(popoverWidth);
		vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(popoverHeight);
	}

	afterEach(() => {
		// 还原视口,不影响后续用例的定位计算。
		Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1024 });
		Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: 768 });
	});

	function mockAnchorRect(badge: HTMLElement, left: number, top: number, bottom: number): void {
		vi.spyOn(badge, "getBoundingClientRect").mockReturnValue({
			left,
			top,
			right: left + 40,
			bottom,
			width: 40,
			height: 20,
			x: left,
			y: top,
			toJSON: () => ({}),
		} as DOMRect);
	}

	it("极窄视口(360px)放 320px 弹层:左缘收敛不越界;锚点贴底时翻到上方", () => {
		installGetChunk();
		renderCitation(`参见${kbTag("文档戊.md", "apop-5")}`);
		// 视口 360x700,弹层量得 320x200;锚点右伸(300)且贴底(bottom 680)。
		mockViewport(360, 700, 320, 200);
		const badge = screen.getByRole("button");
		mockAnchorRect(badge, 300, 660, 680);
		fireEvent.click(badge);

		const dialog = screen.getByRole("dialog");
		// 期望:left = max(8, min(300, 360-320-8=32)) = 32;下方放不下(686>492)翻上:
		// top = max(8, 660-200-6=454) = 454。
		expect(dialog.style.left).toBe("32px");
		expect(dialog.style.top).toBe("454px");
	});

	it("锚点远离边缘且下方放得下:贴锚点下方原位,不翻上", () => {
		installGetChunk();
		renderCitation(`参见${kbTag("文档己.md", "apop-6")}`);
		mockViewport(360, 700, 320, 200);
		const badge = screen.getByRole("button");
		mockAnchorRect(badge, 20, 100, 120);
		fireEvent.click(badge);

		const dialog = screen.getByRole("dialog");
		expect(dialog.style.left).toBe("20px");
		expect(dialog.style.top).toBe("126px");
	});
});

describe("CitationPopover 验收 · 长文档名标题行(真空区)", () => {
	it("标题行按截断类收窄,title 提供完整文档名;标题区不产生横向破版元素", async () => {
		const { pending } = installGetChunk();
		renderCitation(`参见${kbTag(LONG_DOC, "apop-7")}`);
		fireEvent.click(screen.getByRole("button"));
		await act(async () => {
			pending[0]?.resolve({ content: "原文", knowledgeId: "k", kbId: "b" });
		});

		const dialog = screen.getByRole("dialog");
		const docRow = within(dialog).getByText(LONG_DOC);
		expect(docRow.getAttribute("class")).toContain("truncate");
		expect(docRow.getAttribute("title")).toBe(LONG_DOC);
	});
});

describe("CitationPopover 验收 · 只读(AC-15)", () => {
	it("加载态与成功态:弹层内无任何编辑入口与表单控件", async () => {
		const { pending } = installGetChunk();
		renderCitation(`参见${kbTag("文档庚.md", "apop-8")}`);

		// 加载态。F2 授权契约演进:关闭按钮不是编辑入口,从「禁止」名单移出;
		// 单独钉「弹层内唯一 button 是关闭按钮」(把 AC-15 意图钉得更准)。
		fireEvent.click(screen.getByRole("button"));
		let dialog = screen.getByRole("dialog");
		expect(dialog.querySelectorAll("input,textarea,select,form,[contenteditable]")).toHaveLength(0);
		expect(singleButtonLabel(dialog)).toBe(i18n.t("weknora:citation.close"));

		// 成功态。
		await act(async () => {
			pending[0]?.resolve({ content: "原文", knowledgeId: "k", kbId: "b" });
		});
		dialog = screen.getByRole("dialog");
		expect(dialog.querySelectorAll("input,textarea,select,form,[contenteditable]")).toHaveLength(0);
		expect(singleButtonLabel(dialog)).toBe(i18n.t("weknora:citation.close"));
	});

	it("失败态:同样零编辑入口", async () => {
		const { pending } = installGetChunk();
		renderCitation(`参见${kbTag("文档辛.md", "apop-9")}`);
		fireEvent.click(screen.getByRole("button"));
		await act(async () => {
			pending[0]?.reject(new Error("x"));
		});
		const dialog = await screen.findByRole("dialog");
		expect(dialog.querySelectorAll("input,textarea,select,form,[contenteditable]")).toHaveLength(0);
		expect(singleButtonLabel(dialog)).toBe(i18n.t("weknora:citation.close"));
	});
});

describe("CitationPopover 验收 · 缓存与失败重试时序(AC-16)", () => {
	it("在途重开:加载未完成时关掉再开,共享同一在途请求(invoke 恰 1 次),resolve 后回放", async () => {
		const { getChunk, pending } = installGetChunk();
		renderCitation(`参见${kbTag("文档壬.md", "apop-10")}`);
		const badge = screen.getByRole("button");

		fireEvent.click(badge);
		expect(getChunk).toHaveBeenCalledTimes(1);
		fireEvent.keyDown(document.body, { key: "Escape" });
		expect(screen.queryByRole("dialog")).toBeNull();

		// 重开:不发第二次请求(在途 Promise 仍在模块缓存里)。
		fireEvent.click(badge);
		expect(getChunk).toHaveBeenCalledTimes(1);
		expect(screen.getByText("正在加载引用原文…")).toBeTruthy();

		await act(async () => {
			pending[0]?.resolve({ content: "壬的原文", knowledgeId: "k", kbId: "b" });
		});
		expect(await screen.findByText("壬的原文")).toBeTruthy();
		expect(getChunk).toHaveBeenCalledTimes(1);
	});

	it("失败重试:失败后重开**重新发请求**(负结果不缓存),成功后进入成功态", async () => {
		const { getChunk, pending } = installGetChunk();
		renderCitation(`参见${kbTag("文档癸.md", "apop-11")}`);
		const badge = screen.getByRole("button");

		fireEvent.click(badge);
		await act(async () => {
			pending[0]?.reject(new Error("network down"));
		});
		expect(await screen.findByText("引用原文暂时无法加载,请稍后重试。")).toBeTruthy();

		fireEvent.keyDown(document.body, { key: "Escape" });
		fireEvent.click(badge);
		// 失败未被缓存:第二次真实发请求。
		expect(getChunk).toHaveBeenCalledTimes(2);
		await act(async () => {
			pending[1]?.resolve({ content: "恢复后的原文", knowledgeId: "k", kbId: "b" });
		});
		expect(await screen.findByText("恢复后的原文")).toBeTruthy();
	});

	it("同 chunk 双角标:在途互切弹层只发一次请求;两角标先后都能看到成功态", async () => {
		const { getChunk, pending } = installGetChunk();
		renderCitation(`甲${kbTag("文档子.md", "apop-12")}乙${kbTag("文档子.md", "apop-12")}`);
		const [first, second] = screen.getAllByRole("button");

		fireEvent.click(first);
		expect(getChunk).toHaveBeenCalledTimes(1);
		// 互斥:开第二个,第一个弹层卸载;仍在途 → 不发第二发。
		fireEvent.click(second);
		expect(getChunk).toHaveBeenCalledTimes(1);
		expect(screen.getAllByRole("dialog")).toHaveLength(1);

		await act(async () => {
			pending[0]?.resolve({ content: "同一 chunk 的原文", knowledgeId: "k", kbId: "b" });
		});
		expect(await screen.findByText("同一 chunk 的原文")).toBeTruthy();

		// 回看第一个角标:缓存命中,invoke 仍为 1。
		fireEvent.keyDown(document.body, { key: "Escape" });
		fireEvent.click(first);
		expect(await screen.findByText("同一 chunk 的原文")).toBeTruthy();
		expect(getChunk).toHaveBeenCalledTimes(1);
	});
});
