// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { RendererMarkdownContent } from "@shared/components/RendererMarkdownContent";
import { RendererMarkdownScope } from "@shared/components/RendererMarkdownScope";
import { useRendererMarkdownModel } from "@shared/hooks/useRendererMarkdownModel";
import { i18n, initI18n } from "@shared/i18n";
import type { DesktopApi, WeKnoraChunk } from "@preload/api";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Provider as JotaiProvider, createStore } from "jotai";
import type { ReactNode } from "react";
import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { WeKnoraMarkdownProvider } from "./WeKnoraMarkdownProvider";

/**
 * 引用原文弹层的行为合同(T04;AC-14/15/16 与 D4/D5):经真实管线点开角标,
 * mock `window.vetta.weknora.getChunk` 手动推进三态;断言 portal/语义/只读零编辑
 * 入口、失败态 i18n 降级(不含 raw 错误)、Escape 走作用域栈、点外关闭、弹层互斥、
 * 缓存命中不重复 invoke。chunkClient 缓存是模块级:每个用例用互不相同的 chunkId,
 * 互不渗透。
 */

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

afterEach(cleanup);

const WORKSPACE = { cwd: "C:/projects/vetta", id: "C:/projects/vetta" } as const;

function ScopeHarness({ children }: { readonly children: ReactNode }): JSX.Element {
	const model = useRendererMarkdownModel(WORKSPACE.cwd, true, WORKSPACE.id);
	return <RendererMarkdownScope value={model}>{children}</RendererMarkdownScope>;
}

interface Deferred {
	resolve: (value: WeKnoraChunk) => void;
	reject: (reason: Error) => void;
}

/** 装一个可控的 getChunk 假 IPC(chunkClient.test 同款):记录调用、返回手动推进的 Promise。 */
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

/** 等外点监听挂载(弹层延后一拍挂 mousedown,照右键菜单同款)。 */
async function waitForOutsideListener(): Promise<void> {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

const POPOVER_TITLE = "引用原文";

describe("CitationPopover · 结构与只读(AC-14/15)", () => {
	it("portal 到 body,dialog 语义带标题;加载态有文案;弹层内无可编辑元素", () => {
		installGetChunk();
		renderCitation(`参见${kbTag("文档甲.md", "c-pop-1")}`);

		fireEvent.click(screen.getByRole("button"));
		const dialog = screen.getByRole("dialog", { name: POPOVER_TITLE });
		// createPortal 落点是 document.body(浮层范式先例)。
		expect(dialog.parentElement).toBe(document.body);
		expect(screen.getByText(i18n.t("weknora:citation.loading"))).toBeTruthy();
		// 只读红线:无 input/textarea/select/button/contenteditable(AC-15)。
		expect(dialog.querySelectorAll("input,textarea,select,button,[contenteditable]")).toHaveLength(0);
	});
});

describe("CitationPopover · 三态(AC-14)", () => {
	it("成功态:显示 chunk 原文与文档名", async () => {
		const { pending } = installGetChunk();
		renderCitation(`参见${kbTag("文档乙.md", "c-pop-2")}`);

		fireEvent.click(screen.getByRole("button"));
		expect(screen.getByText(i18n.t("weknora:citation.loading"))).toBeTruthy();

		await act(async () => {
			pending[0]?.resolve({ content: "分块原文内容乙,多行\n第二行", knowledgeId: "k", kbId: "b" });
		});
		expect(await screen.findByText(/分块原文内容乙/)).toBeTruthy();
		// 文档名同时出现在角标与弹层标题,用 within 限定在弹层内断言。
		expect(within(screen.getByRole("dialog")).getByText("文档乙.md")).toBeTruthy();
		expect(screen.queryByText(i18n.t("weknora:citation.loading"))).toBeNull();
		// 成功态同样零编辑入口(AC-15)。
		expect(screen.getByRole("dialog").querySelectorAll("input,textarea,select,button,[contenteditable]")).toHaveLength(0);
	});

	it("失败态:i18n 降级文案,不透出 raw 错误(含错误码与原始信息)", async () => {
		const { pending } = installGetChunk();
		renderCitation(`参见${kbTag("文档丙.md", "c-pop-3")}`);

		fireEvent.click(screen.getByRole("button"));
		await act(async () => {
			pending[0]?.reject(new Error("unauthorized: secret-detail"));
		});
		expect(await screen.findByText(i18n.t("weknora:citation.loadFailed"))).toBeTruthy();
		expect(document.body.textContent).not.toContain("secret-detail");
		expect(document.body.textContent).not.toContain("unauthorized");
	});

	it("content 空串判空:按失败态降级(T02 遗留裁量落地)", async () => {
		const { pending } = installGetChunk();
		renderCitation(`参见${kbTag("文档丁.md", "c-pop-4")}`);

		fireEvent.click(screen.getByRole("button"));
		await act(async () => {
			pending[0]?.resolve({ content: "", knowledgeId: "k", kbId: "b" });
		});
		expect(await screen.findByText(i18n.t("weknora:citation.loadFailed"))).toBeTruthy();
	});
});

describe("CitationPopover · 关闭与互斥(AC-14/D4)", () => {
	it("Escape 关闭(走统一快捷键作用域栈)", () => {
		installGetChunk();
		renderCitation(`参见${kbTag("文档戊.md", "c-pop-5")}`);

		fireEvent.click(screen.getByRole("button"));
		expect(screen.getByRole("dialog")).toBeTruthy();

		fireEvent.keyDown(document.body, { key: "Escape" });
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("弹层内与锚点角标上的 mousedown 不关;点外关闭", async () => {
		installGetChunk();
		renderCitation(`参见${kbTag("文档己.md", "c-pop-6")}`);

		const badge = screen.getByRole("button");
		fireEvent.click(badge);
		await waitForOutsideListener();

		fireEvent.mouseDown(screen.getByRole("dialog"));
		expect(screen.getByRole("dialog")).toBeTruthy();

		// 锚点上的按下不算点外:开/关由角标点击逻辑接管(否则点已开角标会「关了又开」)。
		fireEvent.mouseDown(badge);
		expect(screen.getByRole("dialog")).toBeTruthy();

		fireEvent.mouseDown(document.body);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("弹层互斥:打开第二个角标时,第一个的弹层自动关(后开先关)", async () => {
		const { pending } = installGetChunk();
		renderCitation(`甲${kbTag("文档庚.md", "c-pop-7")}乙${kbTag("文档辛.md", "c-pop-8")}`);

		const [first, second] = screen.getAllByRole("button");
		fireEvent.click(first);
		await act(async () => {
			pending[0]?.resolve({ content: "庚的原文", knowledgeId: "k", kbId: "b" });
		});
		expect(await screen.findByText("庚的原文")).toBeTruthy();

		fireEvent.click(second);
		expect(screen.getAllByRole("dialog")).toHaveLength(1);
		await act(async () => {
			pending[1]?.resolve({ content: "辛的原文", knowledgeId: "k", kbId: "b" });
		});
		expect(await screen.findByText("辛的原文")).toBeTruthy();
		expect(screen.queryByText("庚的原文")).toBeNull();
	});
});

describe("CitationPopover · 缓存(AC-16)", () => {
	it("同一 chunk 关闭后再打开:直接回放缓存结果,不重复 invoke", async () => {
		const { getChunk, pending } = installGetChunk();
		renderCitation(`参见${kbTag("文档壬.md", "c-pop-9")}`);

		fireEvent.click(screen.getByRole("button"));
		await act(async () => {
			pending[0]?.resolve({ content: "壬的原文", knowledgeId: "k", kbId: "b" });
		});
		expect(await screen.findByText("壬的原文")).toBeTruthy();

		fireEvent.keyDown(document.body, { key: "Escape" });
		expect(screen.queryByRole("dialog")).toBeNull();

		fireEvent.click(screen.getByRole("button"));
		expect(await screen.findByText("壬的原文")).toBeTruthy();
		expect(getChunk).toHaveBeenCalledTimes(1);
	});
});
