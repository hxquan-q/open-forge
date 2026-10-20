// Copyright The Open Forge contributors.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 「删除智能客服页顶部 48px 空白带」(weknora-top-whitespace-fix) 的**静态契约**用例
 * (③ 测试相位自建，node 环境，读源码文本断言)。
 *
 * 目的:删除本页拖拽带的前提是「窗口拖拽已由外壳页头承担」(AC-2)。这层事实在 jsdom 里证不了
 * (外壳 `PageHeaderFrame` 属于 `@vetta-org/theme-ui`，desktop 的 jsdom 用例不挂它)，只能作静态
 * 契约:外壳页头根元素仍是 `drag-region` 且高度仍为 `h-11`；`MainContentFrame` 在默认
 * `headerOverlay=false` 下仍把 `header` 叠在内容之上渲染(而非浮层)。
 *
 * 这些是**结构性证据**，不是拖拽手感——真实拖拽与窗口布局留实机人眼验收(见 05-tests.md 残余风险)。
 */

const repoRoot = join(import.meta.dirname, "..", "..", "..", "..", "..", "..");

const pageHeaderFrameSource = readFileSync(
	join(repoRoot, "packages", "theme-ui", "src", "app-shell", "PageHeaderFrame.tsx"),
	"utf8",
);
const mainContentFrameSource = readFileSync(
	join(repoRoot, "packages", "theme-ui", "src", "layout", "MainContentFrame.tsx"),
	"utf8",
);
const weKnoraPageViewSource = readFileSync(join(import.meta.dirname, "components", "WeKnoraPageView.tsx"), "utf8");

/** 取 `marker` 所在的那个 `<div ...>` 开标签原文(从最近的 `<div` 到该行 `>`)。 */
function openingTagOf(source: string, marker: string): string {
	const markerIndex = source.indexOf(marker);
	expect(markerIndex, `missing marker: ${marker}`).toBeGreaterThanOrEqual(0);
	const start = source.lastIndexOf("<div", markerIndex);
	const end = source.indexOf(">", markerIndex);
	return source.slice(start, end + 1);
}

describe("外壳页头仍是拖拽区（AC-2 结构性证据）", () => {
	it("AC-2：`PageHeaderFrame` 根 div 的 className 含 `drag-region` 与 `h-11`（44px 拖拽区仍在）", () => {
		const rootTag = openingTagOf(pageHeaderFrameSource, 'data-theme-surface-root="app.pageHeader"');
		expect(rootTag).toContain("drag-region");
		expect(rootTag).toContain("h-11");
	});

	it("AC-2：`MainContentFrame` 在默认 `headerOverlay=false` 下把 header 叠在内容上方渲染（relative z-[1]，非浮层）", () => {
		// 默认值确为 false（内容路由 `/weknora` 未显式传 headerOverlay）。
		expect(mainContentFrameSource).toContain("headerOverlay = false");
		// 两个分支都渲染 header；非 overlay 分支为 `relative z-[1]`（堆叠在内容上方，header 可见可拖拽）。
		expect(mainContentFrameSource).toContain("{header}");
		expect(mainContentFrameSource).toMatch(/headerOverlay \? "absolute inset-x-0 top-0" : "relative z-\[1\]"/);
	});
});

describe("智能客服页源码不再声明拖拽带（AC-1 静态支持）", () => {
	it('AC-1：`WeKnoraPageView.tsx` 不再有 `className="drag-region…"` 的 JSX 元素（注释里的历史说明不算）', () => {
		expect(weKnoraPageViewSource).not.toMatch(/className="drag-region/);
	});
});
