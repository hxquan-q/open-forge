// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { RendererMarkdownContent } from "@shared/components/RendererMarkdownContent";
import { RendererMarkdownScope } from "@shared/components/RendererMarkdownScope";
import { useRendererMarkdownModel } from "@shared/hooks/useRendererMarkdownModel";
import { activityPanelOpenAtom, browserUrlByWorkspaceAtom } from "@shared/store/atoms";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useAtomValue } from "jotai";
import { Provider as JotaiProvider, createStore } from "jotai";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WeKnoraMarkdownProvider } from "./WeKnoraMarkdownProvider";

/**
 * flow-tester 独立验收测试(weknora-kb-citation,AC-3/AC-4/AC-7 管线级)。
 *
 * 与实现者用例(WeKnoraMarkdownProvider.test.tsx)的角度差异:
 * - AC-3 点击通道不再用事后 store.get 快照,而是挂**订阅式探针组件**实时反映 atom 值,
 *   同时断言 window.open 未被调用(没绕开既有通道开新窗口);
 * - AC-4 对照法做两层:innerHTML 全等 + 规范化 DOM 树序列化全等(标签/属性/文本逐节点),
 *   夹具含裸 &、表格、引用块、CJK 与 `<` 字面量(fail-open 对照);
 * - AC-7 残缺标签走**真实 react-markdown 管线**(text 宿主),不是手搭 hast。
 */

// jsdom 无 ResizeObserver:markdown 表格测量需要,给 no-op 桩(仅本文件,不触共享 setup)。
class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}
if (typeof window !== "undefined" && window.ResizeObserver === undefined) {
	window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

afterEach(cleanup);

const WORKSPACE = { cwd: "C:/projects/vetta", id: "C:/projects/vetta" } as const;

function ScopeHarness({ children }: { readonly children: ReactNode }): JSX.Element {
	const model = useRendererMarkdownModel(WORKSPACE.cwd, true, WORKSPACE.id);
	return <RendererMarkdownScope value={model}>{children}</RendererMarkdownScope>;
}

function renderPlain(text: string): HTMLElement {
	return render(
		<ScopeHarness>
			<RendererMarkdownContent text={text} />
		</ScopeHarness>,
	).container;
}

function renderWithProvider(text: string): HTMLElement {
	return render(
		<ScopeHarness>
			<WeKnoraMarkdownProvider>
				<RendererMarkdownContent text={text} />
			</WeKnoraMarkdownProvider>
		</ScopeHarness>,
	).container;
}

/** 规范化 DOM 序列化:标签名 + 排序属性 + 递归文本,忽略 class 顺序等无义差异。 */
function canonical(node: Element): string {
	const attributes = [...node.attributes]
		.map((attr) => `${attr.name}=${attr.value}`)
		.sort()
		.join(";");
	const children = [...node.children].map(canonical).join("|");
	return `<${node.tagName.toLowerCase()}(${attributes})>${node.textContent ?? ""}{${children}}`;
}

const WEB_TAG =
	'<web url="https://developer.kingdee.com/article/1?productLineId=29&amp;lang=zh" title="单点登录说明" />';
const WEB_URL = "https://developer.kingdee.com/article/1?productLineId=29&lang=zh";

describe("WeKnoraMarkdownProvider 验收 · web 外链走既有通道(AC-3)", () => {
	/** 订阅式探针:实时渲染两个通道 atom 的值(比事后快照更接近真实消费者)。 */
	function ChannelProbe(): JSX.Element {
		const urlByWorkspace = useAtomValue(browserUrlByWorkspaceAtom);
		const panelOpen = useAtomValue(activityPanelOpenAtom);
		return (
			<div data-testid="channel-probe">
				<span data-testid="probe-url">{urlByWorkspace.get(WORKSPACE.id) ?? "<none>"}</span>
				<span data-testid="probe-panel">{panelOpen ? "open" : "closed"}</span>
			</div>
		);
	}

	it("链接显示域名、href 为反转义 URL;点击写入工作空间预览地址并展开面板;不开新窗口", () => {
		const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
		const store = createStore();
		render(
			<JotaiProvider store={store}>
				<ScopeHarness>
					<WeKnoraMarkdownProvider>
						<RendererMarkdownContent text={`详见 ${WEB_TAG} 的说明`} />
						<ChannelProbe />
					</WeKnoraMarkdownProvider>
				</ScopeHarness>
			</JotaiProvider>,
		);

		const link = screen.getByRole("link", { name: "developer.kingdee.com" });
		expect(link.getAttribute("href")).toBe(WEB_URL);
		// 现行合同(队长裁定降级):tooltip 是 URL;标签自带 title 数据留缝不消费。锁定现状。
		expect(link.getAttribute("title")).toBe(WEB_URL);
		expect(document.body.textContent).not.toContain("<web");
		expect(document.body.textContent).not.toContain("&amp;");

		expect(screen.getByTestId("probe-url").textContent).toBe("<none>");
		expect(screen.getByTestId("probe-panel").textContent).toBe("closed");
		fireEvent.click(link);
		// 既有通道 = 工作空间预览地址 + 浏览器面板展开(不是 window.open)。
		expect(screen.getByTestId("probe-url").textContent).toBe(WEB_URL);
		expect(screen.getByTestId("probe-panel").textContent).toBe("open");
		expect(openSpy).not.toHaveBeenCalled();
		openSpy.mockRestore();
	});
});

describe("WeKnoraMarkdownProvider 验收 · 无标签文本零回归(AC-4 对照法)", () => {
	it("全要素 markdown(标题/列表/表格/引用/链接/行内代码/CJK/裸 &):套/不套 Provider 输出全等", () => {
		const plain = `### 金蝶云·苍穹 **定位**
- K/3 WISE & KIS云 是传统ERP产品的云化版本
- 列表与 **加粗**、\`行内代码\` 共存,还有 [普通链接](https://example.com/docs?a=1&b=2)

> 引用块:企业级PaaS平台(低代码开发平台)

| 列一 | 列二 |
| --- | --- |
| 甲 | 乙 |`;
		const bare = renderPlain(plain);
		const wrapped = renderWithProvider(plain);
		// 双层对照:原始 innerHTML 全等 + 规范化 DOM 树全等。
		expect(wrapped.innerHTML).toBe(bare.innerHTML);
		expect(canonical(wrapped)).toBe(canonical(bare));
	});

	it("裸 < 字面量(数学比较/泛型/未闭合非引用尖括号):对照全等且字符保留(fail-open 不误伤)", () => {
		const plain = "比较式 x < 5、y > 3,泛型 list<int>,以及半个 <div";
		const bare = renderPlain(plain);
		const wrapped = renderWithProvider(plain);
		expect(wrapped.innerHTML).toBe(bare.innerHTML);
		expect(canonical(wrapped)).toBe(canonical(bare));
		// 字符本身保留(不是"两边一起吞"的假全等)。
		expect(wrapped.textContent).toContain("x < 5");
		expect(wrapped.textContent).toContain("list<int>");
	});
});

describe("WeKnoraMarkdownProvider 验收 · 残缺尾部(AC-7 真实管线)", () => {
	it("段尾半截 kb(无闭引号无 >)与半截 web:不显示,其前正文与标点完整", () => {
		const view = renderWithProvider('结论见上。<kb doc="x" chunk_id="c1');
		expect(view.textContent).toBe("结论见上。");

		const viewWeb = renderWithProvider("正文继续 <web url=");
		expect(viewWeb.textContent).toBe("正文继续 ");
	});
});
