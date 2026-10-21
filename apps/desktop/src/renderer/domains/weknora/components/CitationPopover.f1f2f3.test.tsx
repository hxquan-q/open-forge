// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { RendererMarkdownContent } from "@shared/components/RendererMarkdownContent";
import { RendererMarkdownScope } from "@shared/components/RendererMarkdownScope";
import { useRendererMarkdownModel } from "@shared/hooks/useRendererMarkdownModel";
import { i18n, initI18n } from "@shared/i18n";
import type { DesktopApi, WeKnoraChunk, WeKnoraFileData } from "@preload/api";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Provider as JotaiProvider, createStore } from "jotai";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { WeKnoraMarkdownProvider } from "./WeKnoraMarkdownProvider";

/**
 * 弹层实机验收修复(F1 跟随滚动/F2 显式关闭按钮/F3 真图渲染 + 噪声兜底)的行为合同。
 *
 * 走真实 Markdown 管线 + 真实 i18n(zh);`window.vetta.weknora` 用可控假 IPC(getChunk/getFile
 * 各自手动推进)。chunkClient / fileClient 缓存是模块级:每个用例用互不相同的 id/ref 互不渗透。
 * 既有弹层三态用例在 CitationPopover.test.tsx / .acceptance.test.tsx,本文件只覆盖新增行为。
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

interface Deferred<T> {
	resolve: (value: T) => void;
	reject: (reason: unknown) => void;
}

/** 可控假 IPC:getChunk(文本)与 getFile(图片 data URL)各自返回手动推进的 Promise。 */
function installWeKnoraIpc(): {
	getChunk: ReturnType<typeof vi.fn>;
	getFile: ReturnType<typeof vi.fn>;
	chunks: Deferred<WeKnoraChunk>[];
	files: Deferred<WeKnoraFileData>[];
} {
	const chunks: Deferred<WeKnoraChunk>[] = [];
	const files: Deferred<WeKnoraFileData>[] = [];
	const getChunk = vi.fn(() => new Promise<WeKnoraChunk>((resolve, reject) => chunks.push({ resolve, reject })));
	const getFile = vi.fn(() => new Promise<WeKnoraFileData>((resolve, reject) => files.push({ resolve, reject })));
	Object.defineProperty(window, "vetta", {
		configurable: true,
		writable: true,
		value: { weknora: { getChunk, getFile } } as unknown as DesktopApi,
	});
	return { getChunk, getFile, chunks, files };
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

/** 打开角标弹层并把 getChunk 推进到成功态,返回弹层元素。 */
async function openLoaded(content: string): Promise<HTMLElement> {
	fireEvent.click(screen.getByRole("button"));
	await act(async () => {
		installed.chunks[0]?.resolve({ content, knowledgeId: "k", kbId: "b" });
	});
	return screen.getByRole("dialog");
}

let installed: ReturnType<typeof installWeKnoraIpc>;

function mockViewport(width: number, height: number, popoverWidth: number, popoverHeight: number): void {
	Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
	Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: height });
	vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(popoverWidth);
	vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(popoverHeight);
}

function anchorRect(left: number, top: number, bottom: number): DOMRect {
	return {
		left,
		top,
		right: left + 40,
		bottom,
		width: 40,
		height: bottom - top,
		x: left,
		y: top,
		toJSON: () => ({}),
	} as DOMRect;
}

describe("CitationPopover · F1 跟随滚动", () => {
	it("滚动时按新锚点位置实时重定位", () => {
		installed = installWeKnoraIpc();
		renderCitation(`参见${kbTag("文档甲.md", "f1-follow")}`);
		mockViewport(800, 600, 320, 200);
		const badge = screen.getByRole("button");
		const rectSpy = vi.spyOn(badge, "getBoundingClientRect").mockReturnValue(anchorRect(100, 100, 120));
		fireEvent.click(badge);

		const dialog = screen.getByRole("dialog");
		expect(dialog.style.left).toBe("100px");
		expect(dialog.style.top).toBe("126px");

		// 滚动把锚点带到新位置:重新给矩形 → 触发 scroll → 弹层跟随。
		rectSpy.mockReturnValue(anchorRect(140, 40, 60));
		fireEvent.scroll(window);
		expect(dialog.style.left).toBe("140px");
		expect(dialog.style.top).toBe("66px");
	});

	it("锚点整体滚出视口 → 自动关闭(不留悬浮孤儿)", () => {
		installed = installWeKnoraIpc();
		renderCitation(`参见${kbTag("文档乙.md", "f1-out")}`);
		mockViewport(800, 600, 320, 200);
		const badge = screen.getByRole("button");
		const rectSpy = vi.spyOn(badge, "getBoundingClientRect").mockReturnValue(anchorRect(100, 100, 120));
		fireEvent.click(badge);
		expect(screen.getByRole("dialog")).toBeTruthy();

		// 锚点被滚到视口上方(rect 整体 < 0)。
		rectSpy.mockReturnValue(anchorRect(100, -80, -60));
		fireEvent.scroll(window);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("锚点仍在视口内时不误关(只在滚出后关)", () => {
		installed = installWeKnoraIpc();
		renderCitation(`参见${kbTag("文档丙.md", "f1-stay")}`);
		mockViewport(800, 600, 320, 200);
		const badge = screen.getByRole("button");
		vi.spyOn(badge, "getBoundingClientRect").mockReturnValue(anchorRect(100, 200, 220));
		fireEvent.click(badge);

		fireEvent.scroll(window);
		expect(screen.getByRole("dialog")).toBeTruthy();
	});
});

describe("CitationPopover · F2 显式关闭按钮", () => {
	it("弹层内有关闭按钮(aria-label/title 走 i18n);点击即关", () => {
		installed = installWeKnoraIpc();
		renderCitation(`参见${kbTag("文档丁.md", "f2-close")}`);
		fireEvent.click(screen.getByRole("button"));

		const close = screen.getByRole("button", { name: i18n.t("weknora:citation.close") });
		expect(close.getAttribute("title")).toBe(i18n.t("weknora:citation.close"));
		fireEvent.click(close);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("Esc 与点外关闭作为便捷路径保留", async () => {
		installed = installWeKnoraIpc();
		renderCitation(`参见${kbTag("文档戊.md", "f2-esc")}`);
		fireEvent.click(screen.getByRole("button"));
		expect(screen.getByRole("dialog")).toBeTruthy();
		fireEvent.keyDown(document.body, { key: "Escape" });
		expect(screen.queryByRole("dialog")).toBeNull();

		// 点外(弹层与锚点之外)仍关。
		const badge = screen.getByRole("button");
		fireEvent.click(badge);
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		fireEvent.mouseDown(document.body);
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});

describe("CitationPopover · F3 真图渲染与噪声兜底", () => {
	it("minio 图片语法经取图渲染为 <img src=dataUrl>,正文其余仍纯文本", async () => {
		installed = installWeKnoraIpc();
		renderCitation(`参见${kbTag("文档己.md", "f3-img")}`);
		const content = "如图所示。![](minio://images/10001/exports/f3-one.png)";
		const dialog = await openLoaded(content);

		// 取图请求发出,ref 为正文原串。
		expect(installed.getFile).toHaveBeenCalledTimes(1);
		expect(installed.getFile).toHaveBeenCalledWith({ fileRef: "minio://images/10001/exports/f3-one.png" });
		// 加载中先占位,不发原始长串。
		expect(dialog.textContent).toContain(i18n.t("weknora:citation.imagePlaceholder"));
		expect(dialog.textContent).not.toContain("minio://");

		await act(async () => {
			installed.files[0]?.resolve({ dataUrl: "data:image/png;base64,AAAA", contentType: "image/png" });
		});
		const img = within(dialog).getByRole("img", { name: i18n.t("weknora:citation.imagePlaceholder") });
		expect(img.getAttribute("src")).toBe("data:image/png;base64,AAAA");
		// 图片外的正文逐字可见。
		expect(dialog.textContent).toContain("如图所示。");
	});

	it("同一 chunk 多图各自渲染(两次取图)", async () => {
		installed = installWeKnoraIpc();
		renderCitation(`参见${kbTag("文档庚.md", "f3-multi")}`);
		const content = "A![](minio://images/10001/exports/f3-m1.png)B![](minio://images/10001/exports/f3-m2.png)C";
		const dialog = await openLoaded(content);

		expect(installed.getFile).toHaveBeenCalledTimes(2);
		await act(async () => {
			installed.files[0]?.resolve({ dataUrl: "data:image/png;base64,ONE", contentType: "image/png" });
			installed.files[1]?.resolve({ dataUrl: "data:image/png;base64,TWO", contentType: "image/png" });
		});
		const images = within(dialog).getAllByRole("img");
		expect(images).toHaveLength(2);
		expect(images.map((node) => node.getAttribute("src"))).toEqual([
			"data:image/png;base64,ONE",
			"data:image/png;base64,TWO",
		]);
	});

	it("取图失败 → 占位 + i18n 失败提示,不显示原始长串", async () => {
		installed = installWeKnoraIpc();
		renderCitation(`参见${kbTag("文档辛.md", "f3-fail")}`);
		const dialog = await openLoaded("图![](minio://images/10001/exports/f3-bad.png)");

		await act(async () => {
			installed.files[0]?.reject(new Error("unauthorized"));
		});
		const placeholder = within(dialog).getByTitle(i18n.t("weknora:citation.imageFailed"));
		expect(placeholder.textContent).toBe(i18n.t("weknora:citation.imagePlaceholder"));
		expect(dialog.querySelectorAll("img")).toHaveLength(0);
		expect(dialog.textContent).not.toContain("minio://");
	});

	it("裸 minio 串(非图片语法)→ 占位,不发起取图", async () => {
		installed = installWeKnoraIpc();
		renderCitation(`参见${kbTag("文档壬.md", "f3-bare")}`);
		const dialog = await openLoaded("附件 minio://images/10001/exports/f3-bare.png 已上传。");

		expect(installed.getFile).not.toHaveBeenCalled();
		// 占位与前后正文同处一个纯文本段落(段落文本 = 正文 + 占位,无原始长串)。
		const paragraph = within(dialog).getByText(`附件 ${i18n.t("weknora:citation.imagePlaceholder")} 已上传。`);
		expect(paragraph.textContent).toBe(`附件 ${i18n.t("weknora:citation.imagePlaceholder")} 已上传。`);
		expect(dialog.textContent).not.toContain("minio://");
	});

	it("缓存命中:同一 ref 关闭重开不重复取图", async () => {
		installed = installWeKnoraIpc();
		renderCitation(`参见${kbTag("文档癸.md", "f3-cache")}`);
		const dialog = await openLoaded("![](minio://images/10001/exports/f3-cache.png)");
		await act(async () => {
			installed.files[0]?.resolve({ dataUrl: "data:image/png;base64,CACHE", contentType: "image/png" });
		});
		expect(within(dialog).getByRole("img").getAttribute("src")).toBe("data:image/png;base64,CACHE");

		fireEvent.keyDown(document.body, { key: "Escape" });
		expect(screen.queryByRole("dialog")).toBeNull();

		fireEvent.click(screen.getByRole("button"));
		expect(await screen.findByRole("img")).toBeTruthy();
		expect(installed.getFile).toHaveBeenCalledTimes(1);
	});
});
