// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { RendererMarkdownContent } from "@shared/components/RendererMarkdownContent";
import { RendererMarkdownScope } from "@shared/components/RendererMarkdownScope";
import { useRendererMarkdownModel } from "@shared/hooks/useRendererMarkdownModel";
import { i18n, initI18n } from "@shared/i18n";
import type { DesktopApi, WeKnoraChunk, WeKnoraFileData } from "@preload/api";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Provider as JotaiProvider, createStore } from "jotai";
import { Profiler, type ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { WeKnoraMarkdownProvider } from "./WeKnoraMarkdownProvider";

/**
 * flow-tester 独立复验 · 弹层实机验收修复(F1 跟随滚动 / F2 显式关闭按钮 / F3 真图渲染 + 噪声兜底)。
 *
 * 与实现者用例(`CitationPopover.f1f2f3.test.tsx`)的角度差异:
 * - F1 位置断言用**位移增量**(滚动前后 delta)而非仅终值;
 * - F1「位置未变不重渲染」用 **React Profiler 提交计数**实证(非只看坐标不变);
 * - F1 滚出视口对**四条边**逐一枚举(实现只测了上方一条);
 * - F1 capture 监听用**不冒泡 scroll 事件 + 冒泡相监听对照**实证(内层容器场景);
 * - F1 卸载用 addEventListener/removeEventListener 的**选项逐项对照**;
 * - F2 三态逐一断言「唯一 button 恒为关闭按钮」,并以**切 en 语言**证明 aria-label/title 走 i18n;
 * - F3 断言正文里的 `<script>`/HTML 字面量**不产生元素、不执行**。
 *
 * 走真实 Markdown 管线 + 真实 i18n;`window.vetta.weknora` 用可控假 IPC。chunkClient/fileClient
 * 缓存是模块级:每个用例用互不相同的 id/ref 互不渗透。
 */

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

afterEach(() => {
	vi.restoreAllMocks();
	cleanup();
	// 还原视口,避免污染后续用例的定位计算。
	Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1024 });
	Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: 768 });
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

function renderCitation(text: string) {
	return render(
		<JotaiProvider store={createStore()}>
			<ScopeHarness>
				<WeKnoraMarkdownProvider>
					<RendererMarkdownContent text={text} />
				</WeKnoraMarkdownProvider>
			</ScopeHarness>
		</JotaiProvider>,
	);
}

let profilerCommits = 0;
function renderCitationProfiled(text: string) {
	return render(
		<JotaiProvider store={createStore()}>
			<Profiler
				id="f1-commit-counter"
				onRender={() => {
					profilerCommits += 1;
				}}
			>
				<ScopeHarness>
					<WeKnoraMarkdownProvider>
						<RendererMarkdownContent text={text} />
					</WeKnoraMarkdownProvider>
				</ScopeHarness>
			</Profiler>
		</JotaiProvider>,
	);
}

function kbTag(doc: string, chunkId: string): string {
	return `<kb doc="${doc}" chunk_id="${chunkId}" kb_id="b" />`;
}

/** 唯一 id/ref 生成,避免模块级缓存跨用例串台。 */
let seq = 0;
function uid(prefix: string): string {
	seq += 1;
	return `${prefix}-${seq}`;
}

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

/** 打开角标弹层并把 getChunk 推进到成功态,返回弹层元素。 */
async function openLoaded(
	installed: ReturnType<typeof installWeKnoraIpc>,
	content: string,
): Promise<HTMLElement> {
	fireEvent.click(screen.getByRole("button"));
	await act(async () => {
		installed.chunks[0]?.resolve({ content, knowledgeId: "k", kbId: "b" });
	});
	return screen.getByRole("dialog");
}

/** 弹层成功态正文段落(whitespace-pre-wrap 那段)。 */
function contentParagraph(dialog: HTMLElement): HTMLElement {
	const paragraph = dialog.querySelector("p.whitespace-pre-wrap");
	if (!paragraph) throw new Error("content paragraph not found");
	return paragraph as HTMLElement;
}

// ───────────────────────────── F1 · 跟随滚动 ─────────────────────────────

describe("F1 复验 · 跟随滚动", () => {
	it("滚动时弹层按锚点新位置重定位:断言位移增量(delta)与终值", () => {
		const installed = installWeKnoraIpc();
		renderCitation(`参见${kbTag("文档甲.md", uid("f1-follow"))}`);
		mockViewport(800, 600, 320, 200);
		const badge = screen.getByRole("button");
		const rectSpy = vi.spyOn(badge, "getBoundingClientRect").mockReturnValue(anchorRect(100, 100, 120));
		fireEvent.click(badge);

		const dialog = screen.getByRole("dialog");
		const before = { left: dialog.style.left, top: dialog.style.top };
		expect(before).toEqual({ left: "100px", top: "126px" });

		// 锚点被滚动带离:left +40、top -60(整体上移)。
		rectSpy.mockReturnValue(anchorRect(140, 40, 60));
		fireEvent.scroll(window);

		const after = { left: dialog.style.left, top: dialog.style.top };
		expect(after).toEqual({ left: "140px", top: "66px" });
		// 位移增量与锚点位移一致(弹层是「跟随」而非固定)。
		expect(parseInt(after.left, 10) - parseInt(before.left, 10)).toBe(40);
		expect(parseInt(after.top, 10) - parseInt(before.top, 10)).toBe(-60);
	});

	it("锚点位置未变 → 不产生新的 React 提交(Profiler 提交计数不变)", () => {
		const installed = installWeKnoraIpc();
		profilerCommits = 0;
		renderCitationProfiled(`参见${kbTag("文档乙.md", uid("f1-norender"))}`);
		mockViewport(800, 600, 320, 200);
		const badge = screen.getByRole("button");
		vi.spyOn(badge, "getBoundingClientRect").mockReturnValue(anchorRect(100, 200, 220));
		fireEvent.click(badge);

		const dialog = screen.getByRole("dialog");
		const baseline = profilerCommits;
		expect(baseline).toBeGreaterThan(0);

		// 锚点未动:连续 3 次滚动,坐标不变且不触发新提交。
		fireEvent.scroll(window);
		fireEvent.scroll(window);
		fireEvent.scroll(window);
		expect(dialog.style.left).toBe("100px");
		expect(dialog.style.top).toBe("226px");
		expect(profilerCommits).toBe(baseline);

		// 对照:锚点移动后确实产生新提交(证明该计数对变化敏感,非空转)。
		vi.spyOn(badge, "getBoundingClientRect").mockReturnValue(anchorRect(140, 40, 60));
		fireEvent.scroll(window);
		expect(profilerCommits).toBeGreaterThan(baseline);
		expect(dialog.style.left).toBe("140px");
	});

	it.each([
		["上方", { left: 100, top: -80, bottom: -60 }],
		["下方", { left: 100, top: 700, bottom: 720 }],
		["左侧", { left: -80, top: 100, bottom: 120 }],
		["右侧", { left: 900, top: 100, bottom: 120 }],
	])("锚点从%s整体滚出视口 → 自动关闭(四边枚举)", (_label, outRect) => {
		const installed = installWeKnoraIpc();
		renderCitation(`参见${kbTag("文档丙.md", uid("f1-out"))}`);
		mockViewport(800, 600, 320, 200);
		const badge = screen.getByRole("button");
		const rectSpy = vi.spyOn(badge, "getBoundingClientRect").mockReturnValue(anchorRect(100, 100, 120));
		fireEvent.click(badge);
		expect(screen.getByRole("dialog")).toBeTruthy();

		rectSpy.mockReturnValue(anchorRect(outRect.left, outRect.top, outRect.bottom));
		fireEvent.scroll(window);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("capture 监听:内层滚动容器派发的不冒泡 scroll 也能触发跟随(冒泡相监听收不到)", () => {
		const installed = installWeKnoraIpc();
		const { container } = renderCitation(`参见${kbTag("文档丁.md", uid("f1-capture"))}`);
		mockViewport(800, 600, 320, 200);
		const badge = screen.getByRole("button");
		const rectSpy = vi.spyOn(badge, "getBoundingClientRect").mockReturnValue(anchorRect(100, 100, 120));
		fireEvent.click(badge);

		const dialog = screen.getByRole("dialog");
		expect(dialog.style.left).toBe("100px");

		// 对照探针:window 上的「冒泡相」监听器。
		const bubbleSpy = vi.fn();
		window.addEventListener("scroll", bubbleSpy);

		rectSpy.mockReturnValue(anchorRect(140, 40, 60));
		// 内层容器(非 window)派发一个不冒泡的 scroll 事件——scroll 事件本身就不冒泡,
		// 只有 window 的 capture 监听能收到。裸 dispatchEvent 不经过 RTL 的 act,
		// 须自行包 act 才能同步 flush React 的定位状态更新。
		act(() => {
			container.dispatchEvent(new Event("scroll", { bubbles: false }));
		});

		expect(bubbleSpy).not.toHaveBeenCalled();
		window.removeEventListener("scroll", bubbleSpy);
		// 弹层仍跟随 = capture 生效。
		expect(dialog.style.left).toBe("140px");
		expect(dialog.style.top).toBe("66px");
	});

	it("卸载清理:scroll(capture+passive)/resize(passive) 监听按匹配选项移除,卸载后不再响应", () => {
		installWeKnoraIpc();
		const addSpy = vi.spyOn(window, "addEventListener");
		const removeSpy = vi.spyOn(window, "removeEventListener");
		const { unmount } = renderCitation(`参见${kbTag("文档戊.md", uid("f1-unmount"))}`);

		fireEvent.click(screen.getByRole("button"));
		expect(screen.getByRole("dialog")).toBeTruthy();

		// 树上还可能有其他 resize 监听(如 Markdown 模型),故按「至少一次带该选项」判定。
		const hasScroll = (calls: unknown[][], opts: AddEventListenerOptions): boolean =>
			calls.some(([type, , o]) => type === "scroll" && o !== undefined && Object.entries(opts).every(([k, v]) => (o as Record<string, unknown>)[k] === v));
		const hasResize = (calls: unknown[][], opts: AddEventListenerOptions): boolean =>
			calls.some(([type, , o]) => type === "resize" && o !== undefined && Object.entries(opts).every(([k, v]) => (o as Record<string, unknown>)[k] === v));

		expect(hasScroll(addSpy.mock.calls, { capture: true, passive: true })).toBe(true);
		expect(hasResize(addSpy.mock.calls, { passive: true })).toBe(true);

		unmount();

		// 移除选项必须与注册时的 capture 标志匹配,否则监听器不会被真正摘除。
		expect(hasScroll(removeSpy.mock.calls, { capture: true })).toBe(true);
		expect(removeSpy.mock.calls.some(([type]) => type === "resize")).toBe(true);

		// 卸载后派发滚动:无异常、无残留弹层。
		expect(() => fireEvent.scroll(window)).not.toThrow();
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});

// ───────────────────────────── F2 · 显式关闭按钮 ─────────────────────────────

describe("F2 复验 · 显式关闭按钮", () => {
	async function openState(state: "loading" | "loaded" | "failed"): Promise<HTMLElement> {
		const installed = installWeKnoraIpc();
		renderCitation(`参见${kbTag("文档己.md", uid("f2-state"))}`);
		fireEvent.click(screen.getByRole("button"));
		if (state === "loaded") {
			await act(async () => {
				installed.chunks[0]?.resolve({ content: "原文", knowledgeId: "k", kbId: "b" });
			});
		} else if (state === "failed") {
			await act(async () => {
				installed.chunks[0]?.reject(new Error("x"));
			});
		}
		return screen.getByRole("dialog");
	}

	it.each(["loading", "loaded", "failed"] as const)("%s 态:弹层内恰好一个 button 且就是关闭按钮", async (state) => {
		const dialog = await openState(state);
		const buttons = within(dialog).getAllByRole("button");
		expect(buttons).toHaveLength(1);
		expect(buttons[0]?.getAttribute("aria-label")).toBe(i18n.t("weknora:citation.close"));
		// 除关闭按钮外无任何其他交互元素(AC-15 意图:无编辑/操作入口)。
		expect(dialog.querySelectorAll("button, a[href], input, select, textarea, [contenteditable]")).toHaveLength(1);
	});

	it("点击关闭按钮即关(主关闭路径)", async () => {
		const installed = installWeKnoraIpc();
		renderCitation(`参见${kbTag("文档庚.md", uid("f2-click"))}`);
		fireEvent.click(screen.getByRole("button"));
		const close = within(screen.getByRole("dialog")).getByRole("button");
		fireEvent.click(close);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("aria-label/title 走 i18n:切 en 后逐字变英文,非硬编码中文", async () => {
		installWeKnoraIpc();
		renderCitation(`参见${kbTag("文档辛.md", uid("f2-i18n"))}`);
		fireEvent.click(screen.getByRole("button"));
		const zhClose = within(screen.getByRole("dialog")).getByRole("button");
		expect(zhClose.getAttribute("aria-label")).toBe(i18n.t("weknora:citation.close"));
		expect(zhClose.getAttribute("title")).toBe(i18n.t("weknora:citation.close"));
		expect(zhClose.getAttribute("aria-label")).toBe("关闭引用原文");

		await act(async () => {
			await i18n.changeLanguage("en");
		});
		const enClose = within(screen.getByRole("dialog")).getByRole("button");
		expect(enClose.getAttribute("aria-label")).toBe("Close cited source");
		expect(enClose.getAttribute("title")).toBe("Close cited source");
		expect(enClose.getAttribute("aria-label")).toBe(i18n.t("weknora:citation.close"));

		await act(async () => {
			await i18n.changeLanguage("zh");
		});
	});

	it("Esc 与点外关闭作为便捷路径保留", async () => {
		installWeKnoraIpc();
		renderCitation(`参见${kbTag("文档壬.md", uid("f2-paths"))}`);
		const badge = screen.getByRole("button");

		fireEvent.click(badge);
		expect(screen.getByRole("dialog")).toBeTruthy();
		fireEvent.keyDown(document.body, { key: "Escape" });
		expect(screen.queryByRole("dialog")).toBeNull();

		// 点外(弹层与锚点之外)仍关;需等延后一拍的 mousedown 监听挂上。
		fireEvent.click(badge);
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		fireEvent.mouseDown(document.body);
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});

// ───────────────────────────── F3 · 真图渲染与噪声兜底 ─────────────────────────────

describe("F3 复验 · 真图渲染与噪声兜底", () => {
	it("markdown 图片语法 → <img src=dataUrl>(经取图代理),正文其余逐字保留", async () => {
		const installed = installWeKnoraIpc();
		const ref = `minio://images/10001/exports/${uid("f3-img")}.png`;
		renderCitation(`参见${kbTag("文档癸.md", uid("f3-img-chunk"))}`);
		const content = `如图所述。![](${ref})到此为止。`;
		const dialog = await openLoaded(installed, content);

		expect(installed.getFile).toHaveBeenCalledTimes(1);
		expect(installed.getFile).toHaveBeenCalledWith({ fileRef: ref });
		// 加载中先占位,不闪现原始长串。
		expect(dialog.textContent).toContain(i18n.t("weknora:citation.imagePlaceholder"));
		expect(dialog.textContent).not.toContain("minio://");

		await act(async () => {
			installed.files[0]?.resolve({ dataUrl: "data:image/png;base64,REV", contentType: "image/png" });
		});
		const img = within(dialog).getByRole("img", { name: i18n.t("weknora:citation.imagePlaceholder") });
		expect(img.getAttribute("src")).toBe("data:image/png;base64,REV");
		// 图片前后的正文逐字保留在同一正文段里。
		expect(contentParagraph(dialog).textContent).toContain("如图所述。");
		expect(contentParagraph(dialog).textContent).toContain("到此为止。");
	});

	it("同一 chunk 多图各自渲染(两次取图,互不串台)", async () => {
		const installed = installWeKnoraIpc();
		const refA = `minio://images/10001/exports/${uid("f3-mA")}.png`;
		const refB = `minio://images/10001/exports/${uid("f3-mB")}.png`;
		renderCitation(`参见${kbTag("文档子.md", uid("f3-multi-chunk"))}`);
		const dialog = await openLoaded(installed, `A![](${refA})B![](${refB})C`);

		expect(installed.getFile).toHaveBeenCalledTimes(2);
		await act(async () => {
			installed.files[0]?.resolve({ dataUrl: "data:image/png;base64,ONE", contentType: "image/png" });
			installed.files[1]?.resolve({ dataUrl: "data:image/png;base64,TWO", contentType: "image/png" });
		});
		const images = within(dialog).getAllByRole("img");
		expect(images.map((node) => node.getAttribute("src"))).toEqual([
			"data:image/png;base64,ONE",
			"data:image/png;base64,TWO",
		]);
		expect(contentParagraph(dialog).textContent).toContain("A");
		expect(contentParagraph(dialog).textContent).toContain("C");
	});

	it("非 minio 的图片语法 → 占位「[图片]」,不发起取图", async () => {
		const installed = installWeKnoraIpc();
		renderCitation(`参见${kbTag("文档丑.md", uid("f3-nonminio-chunk"))}`);
		const dialog = await openLoaded(installed, "外链图 ![x](https://example.com/a.png) 结尾");

		expect(installed.getFile).not.toHaveBeenCalled();
		expect(dialog.textContent).toContain(i18n.t("weknora:citation.imagePlaceholder"));
		expect(dialog.textContent).not.toContain("example.com");
		expect(dialog.querySelectorAll("img")).toHaveLength(0);
	});

	it("裸 minio 串(非图片语法)→ 占位,不发起取图,前后正文保留", async () => {
		const installed = installWeKnoraIpc();
		const bare = `minio://images/10001/exports/${uid("f3-bare")}.png`;
		renderCitation(`参见${kbTag("文档寅.md", uid("f3-bare-chunk"))}`);
		const dialog = await openLoaded(installed, `附件 ${bare} 已上传。`);

		expect(installed.getFile).not.toHaveBeenCalled();
		const paragraph = contentParagraph(dialog);
		expect(paragraph.textContent).toBe(`附件 ${i18n.t("weknora:citation.imagePlaceholder")} 已上传。`);
		expect(dialog.textContent).not.toContain("minio://");
	});

	it("取图失败 → 占位 + i18n 失败提示(title),不显示原始错误/长串", async () => {
		const installed = installWeKnoraIpc();
		const ref = `minio://images/10001/exports/${uid("f3-fail")}.png`;
		renderCitation(`参见${kbTag("文档卯.md", uid("f3-fail-chunk"))}`);
		const dialog = await openLoaded(installed, `图![](${ref})`);

		await act(async () => {
			installed.files[0]?.reject(new Error("unauthorized: secret-ref-detail"));
		});
		const placeholder = within(dialog).getByTitle(i18n.t("weknora:citation.imageFailed"));
		expect(placeholder.textContent).toBe(i18n.t("weknora:citation.imagePlaceholder"));
		expect(dialog.querySelectorAll("img")).toHaveLength(0);
		expect(dialog.textContent).not.toContain("minio://");
		expect(dialog.textContent).not.toContain("secret-ref-detail");
		expect(dialog.textContent).not.toContain("unauthorized");
	});

	it("其余正文仍纯文本:<script>/HTML 字面量不产生元素、不执行", async () => {
		const installed = installWeKnoraIpc();
		renderCitation(`参见${kbTag("文档辰.md", uid("f3-plain-chunk"))}`);
		const content = "前言<script>globalThis.__f3Pwned=1</script>中间**加粗**<b>粗</b>后记";
		const dialog = await openLoaded(installed, content);

		// 不产生任何被解析的元素,脚本不执行。
		expect(dialog.querySelector("script")).toBeNull();
		expect(dialog.querySelectorAll("b, strong, i, em, code, a")).toHaveLength(0);
		expect((globalThis as Record<string, unknown>).__f3Pwned).toBeUndefined();
		// 原文逐字落为纯文本。
		expect(contentParagraph(dialog).textContent).toBe(content);
	});

	it("缓存命中:同一 ref 关闭重开不重复取图(fileClient 生效)", async () => {
		const installed = installWeKnoraIpc();
		const ref = `minio://images/10001/exports/${uid("f3-cache")}.png`;
		renderCitation(`参见${kbTag("文档巳.md", uid("f3-cache-chunk"))}`);
		const dialog = await openLoaded(installed, `![](${ref})`);
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

	it("取图失败后重开:负结果不缓存,重新发起取图并成功渲染", async () => {
		const installed = installWeKnoraIpc();
		const ref = `minio://images/10001/exports/${uid("f3-retry")}.png`;
		renderCitation(`参见${kbTag("文档午.md", uid("f3-retry-chunk"))}`);
		await openLoaded(installed, `![](${ref})`);

		await act(async () => {
			installed.files[0]?.reject(new Error("network down"));
		});
		expect(screen.getByTitle(i18n.t("weknora:citation.imageFailed"))).toBeTruthy();

		fireEvent.keyDown(document.body, { key: "Escape" });
		fireEvent.click(screen.getByRole("button"));
		// 失败未被缓存:第二次真实取图(chunk 命中缓存后 ChunkImage 重新挂载,须等一拍)。
		await waitFor(() => expect(installed.getFile).toHaveBeenCalledTimes(2));
		await act(async () => {
			installed.files[1]?.resolve({ dataUrl: "data:image/png;base64,RETRY", contentType: "image/png" });
		});
		expect(await screen.findByRole("img")).toBeTruthy();
	});
});
