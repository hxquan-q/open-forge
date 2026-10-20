// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { RendererMarkdownContent } from "@shared/components/RendererMarkdownContent";
import { RendererMarkdownScope } from "@shared/components/RendererMarkdownScope";
import { useRendererMarkdownModel } from "@shared/hooks/useRendererMarkdownModel";
import { activityPanelOpenAtom, browserUrlByWorkspaceAtom } from "@shared/store/atoms";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Provider as JotaiProvider, createStore } from "jotai";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WeKnoraMarkdownProvider } from "./WeKnoraMarkdownProvider";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// jsdom 不实现 ResizeObserver,markdown 表格组件挂载要用它测量;给个 no-op 桩让
// 含表格的 AC-4 对照夹具能渲染(对照断言不受影响,桩只省掉测量本身)。
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

/** 与浏览器链接先例(RendererMarkdownContent.browser.test)同款模型接法:workspace 显式,onOpenUrl 才会生效。 */
function ScopeHarness({ children }: { readonly children: ReactNode }): JSX.Element {
	const model = useRendererMarkdownModel(WORKSPACE.cwd, true, WORKSPACE.id);
	return <RendererMarkdownScope value={model}>{children}</RendererMarkdownScope>;
}

function renderPlain(text: string): HTMLElement {
	const view = render(
		<ScopeHarness>
			<RendererMarkdownContent text={text} />
		</ScopeHarness>,
	);
	return view.container;
}

function renderWithProvider(text: string): HTMLElement {
	const view = render(
		<ScopeHarness>
			<WeKnoraMarkdownProvider>
				<RendererMarkdownContent text={text} />
			</WeKnoraMarkdownProvider>
		</ScopeHarness>,
	);
	return view.container;
}

// 夹具拷自 T00 实测真实会话(v1-real-messages.json),仅文档名与资源 UUID,无凭据(红线 C2)。
const REAL_KB_TAG =
	'<kb doc="超值产品资料包等你领 _ 金蝶云社区“邀客户共学习”有奖活动上线！.md" chunk_id="f2acd65e-3969-4700-88f6-612579891ec6" kb_id="78c47382-49f4-41bb-a11a-bc9c6f06f3a9" />';
const WEB_TAG =
	'<web url="https://developer.kingdee.com/article/454700048043812608?productLineId=29&amp;lang=zh" title="单点登录说明" />';
const WEB_URL = "https://developer.kingdee.com/article/454700048043812608?productLineId=29&lang=zh";

describe("WeKnoraMarkdownProvider · web 标签 → 既有外链通道(AC-3)", () => {
	it("web 标签渲染为可点击链接:显示域名、无 raw 残留,点击走既有打开 URL 通道", () => {
		const store = createStore();
		render(
			<JotaiProvider store={store}>
				<ScopeHarness>
					<WeKnoraMarkdownProvider>
						<RendererMarkdownContent text={`详见 ${WEB_TAG} 的说明`} />
					</WeKnoraMarkdownProvider>
				</ScopeHarness>
			</JotaiProvider>,
		);

		const link = screen.getByRole("link", { name: "developer.kingdee.com" });
		expect(link.getAttribute("href")).toBe(WEB_URL);
		// 正文不再出现任何 raw 标签文本。
		expect(document.body.textContent).not.toContain("<web");
		expect(document.body.textContent).not.toContain("<kb");

		fireEvent.click(link);
		// 既有通道 = openUrlInActivityWorkspace:写入工作空间预览地址并展开浏览器面板。
		expect(store.get(browserUrlByWorkspaceAtom).get(WORKSPACE.id)).toBe(WEB_URL);
		expect(store.get(activityPanelOpenAtom)).toBe(true);
	});
});

describe("WeKnoraMarkdownProvider · 无标签文本逐字符一致(AC-4)", () => {
	it("markdown 全要素输入:套 Provider 与不套的渲染输出 innerHTML 完全一致", () => {
		const plain = `### 1. **金蝶云·苍穹**
- K/3 WISE & KIS云 是传统ERP产品的云化版本
- 列表与 **加粗**、\`代码\` 共存,还有 [普通链接](https://example.com/docs)

| 列一 | 列二 |
| --- | --- |
| 甲 | 乙 |`;
		expect(renderWithProvider(plain).innerHTML).toBe(renderPlain(plain).innerHTML);
	});
});

describe("WeKnoraMarkdownProvider · kb 标签本票维持现状文本", () => {
	it("kb 标签在正文路径行为=现状:套 Provider 与不套的输出逐字符一致(不劣化)", () => {
		const withKb = `金蝶拥有**六大核心产品线**,覆盖不同规模企业的数字化需求${REAL_KB_TAG}:`;
		expect(renderWithProvider(withKb).innerHTML).toBe(renderPlain(withKb).innerHTML);
	});
});

describe("WeKnoraMarkdownProvider · 残缺标签与混排(AC-7/AC-8)", () => {
	it("流中断的半截标签不显示,其前的正常文本不受影响", () => {
		const view = renderWithProvider('参见资料结尾 <kb doc="x" chunk_id="c1');
		expect(view.textContent).toContain("参见资料结尾");
		expect(view.textContent).not.toContain("<kb");
		expect(view.textContent).not.toContain("chunk_id");
	});

	it("web+markdown 元素混排:link 与加粗并存,前后空格标点不吞", () => {
		const view = renderWithProvider(`参照 ${WEB_TAG} 以及 **加粗**、句尾。`);
		expect(screen.getByRole("link", { name: "developer.kingdee.com" })).toBeTruthy();
		expect(view.textContent).toContain("参照 ");
		expect(view.textContent).toContain(" 以及 ");
		expect(view.textContent).toContain("加粗");
		expect(view.textContent).toContain("、句尾。");
	});

	it("行内代码里的标签不处理(维持现状明文,不产生链接)", () => {
		const view = renderWithProvider(`示例 \`<web url="https://e.com" />\` 结束`);
		expect(screen.queryByRole("link")).toBeNull();
		expect(view.textContent).toContain('<web url="https://e.com" />');
	});
});
