// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { RendererMarkdownContent } from "@shared/components/RendererMarkdownContent";
import { RendererMarkdownScope } from "@shared/components/RendererMarkdownScope";
import { useRendererMarkdownModel } from "@shared/hooks/useRendererMarkdownModel";
import { i18n, initI18n } from "@shared/i18n";
import type { DesktopApi, WeKnoraChunk } from "@preload/api";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider as JotaiProvider, createStore } from "jotai";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { WeKnoraMarkdownProvider } from "./WeKnoraMarkdownProvider";

/**
 * flow-tester 独立验收测试(weknora-kb-citation,AC-1/2/9/11 与 AC-8/AC-10 角标侧)。
 *
 * 与实现者用例(CitationBadge.test.tsx)的断言角度差异:
 * - 截断断言从"长度上限"升级为"前缀+省略号+不等于全名"的结构化形态(不镜像实现的常量);
 * - 键盘走 user-event 的真实 Tab / Enter / Space 序列(不止 programmatic focus + 手工回放);
 * - en 镜像全链消费:切 en 后逐字比对 en catalog 的插值产物(AC-10 真空区);
 * - 混排用"精确重构可见文本全串"替代点查包含(AC-8)。
 * 真实文档名拷自 t00-run 实测夹具,仅文档名与资源 UUID,无凭据(C2)。
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

/** 可控的 getChunk 假 IPC(渲染层测试一律假通道,C1/C2:不触真实实例、无 Key)。 */
function installGetChunk(): { getChunk: ReturnType<typeof vi.fn>; pending: Array<{ resolve: (c: WeKnoraChunk) => void }> } {
	const pending: Array<{ resolve: (c: WeKnoraChunk) => void }> = [];
	const getChunk = vi.fn(
		() =>
			new Promise<WeKnoraChunk>((resolve) => {
				pending.push({ resolve });
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

// 真实长文档名(43 字符,含全角引号与全角感叹号;t00-run/v1-real-messages.json)。
const LONG_DOC = "超值产品资料包等你领 _ 金蝶云社区“邀客户共学习”有奖活动上线！.md";
const SHORT_DOC = "产品手册.md";
const KB_LONG = `<kb doc="${LONG_DOC}" chunk_id="acc-1" kb_id="78c47382-49f4-41bb-a11a-bc9c6f06f3a9" />`;
const KB_SHORT = `<kb doc="${SHORT_DOC}" chunk_id="acc-2" kb_id="b-2" />`;
const WEB_TAG = '<web url="https://developer.kingdee.com/article/1?x=1&amp;y=2" title="说明" />';

describe("CitationBadge 验收 · 角标形态与 hover(AC-1/AC-2)", () => {
	it("长文档名角标:显示为全名前缀+省略号(≤13 字符量级),title 为全名且不含省略号", () => {
		const { getChunk } = installGetChunk();
		const view = renderCitation(`金蝶拥有**六大核心产品线**${KB_LONG}:`);

		const badge = screen.getByRole("button", { name: `引用资料:${LONG_DOC}` });
		const displayed = badge.textContent ?? "";
		// 截断形态(结构化断言,不镜像实现常量):省略号结尾、是全名前缀、显著短于全名。
		expect(displayed.endsWith("…")).toBe(true);
		expect(LONG_DOC.startsWith(displayed.slice(0, -1))).toBe(true);
		expect(displayed.length).toBeLessThanOrEqual(13);
		expect(displayed).not.toBe(LONG_DOC);
		// hover 全名走原生 title(AC-2):完整、无省略号、与显示名不同。
		expect(badge.getAttribute("title")).toBe(LONG_DOC);
		expect(badge.getAttribute("title")).not.toContain("…");
		// 正文无 raw 残留(AC-1):标签文本、属性名、chunk uuid 一概不可见。
		expect(view.textContent).not.toContain("<kb");
		expect(view.textContent).not.toContain("chunk_id");
		expect(view.textContent).not.toContain("acc-1");
		// 渲染/悬停不取数(不做项:悬停只看名,点击才弹)。
		expect(getChunk).not.toHaveBeenCalled();
	});

	it("短文档名不截断;多角标 title 各自对应,不串位", () => {
		installGetChunk();
		renderCitation(`甲${KB_SHORT}乙${KB_LONG}丙`);
		const badges = screen.getAllByRole("button");
		expect(badges).toHaveLength(2);
		expect(badges[0]?.getAttribute("title")).toBe(SHORT_DOC);
		expect(badges[0]?.textContent).toBe(SHORT_DOC);
		expect(badges[1]?.getAttribute("title")).toBe(LONG_DOC);
	});
});

describe("CitationBadge 验收 · 键盘与焦点(AC-9)", () => {
	it("Tab 从 body 落到角标;Enter 打开弹层;Escape 后 Space 再开(user-event 真实键序)", async () => {
		const user = userEvent.setup();
		installGetChunk();
		renderCitation(`参见${KB_SHORT}说明`);
		const badge = screen.getByRole("button");

		// 原生语义:无 role/tabindex 覆盖(浏览器默认可聚焦、Enter/Space 激活)。
		expect(badge.tagName).toBe("BUTTON");
		expect(badge.getAttribute("role")).toBeNull();
		expect(badge.getAttribute("tabindex")).toBeNull();
		expect(badge.getAttribute("type")).toBe("button");

		// 真实 Tab 导航:正文区首个可聚焦元素即角标。
		expect(document.activeElement).toBe(document.body);
		await user.keyboard("{Tab}");
		expect(document.activeElement).toBe(badge);

		// Enter 激活打开弹层(user-event keyboard 的按键序列,不手工补 click:
		// keypress 行为对 button 派发 click,见 dist/esm/event/behavior/keypress.js)。
		await user.keyboard("{Enter}");
		expect(screen.getByRole("dialog")).toBeTruthy();

		// Escape 关闭后(弹层卸载,焦点回落 body),键盘用户 Tab 回角标再按 Space 仍能打开
		//(Space 在 keyup 派发 click,键名就是 " ";激活行为要求按钮持有焦点)。
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("dialog")).toBeNull();
		badge.focus();
		await user.keyboard(" ");
		expect(screen.getByRole("dialog")).toBeTruthy();
	});
});

describe("CitationBadge 验收 · 样式 token(AC-11)", () => {
	it("角标样式全部走 DESIGN.md token 工具类,无裸色值", () => {
		installGetChunk();
		renderCitation(`参见${KB_SHORT}说明`);
		const badge = screen.getByRole("button");
		const className = badge.getAttribute("class") ?? "";
		// 主题 token:primary 系前景/底/描边(明暗两主题自适应)+ 圆角 + 行内对齐。
		expect(className).toContain("bg-primary/10");
		expect(className).toContain("text-primary");
		expect(className).toContain("border-primary/25");
		expect(className).toContain("rounded-md");
		// 禁用形态:裸色值与非存在 token(DESIGN.md 白名单外)。
		expect(className).not.toMatch(/#[0-9a-f]{3,8}\b/i);
		expect(className).not.toMatch(/rgb\(/i);
		expect(className).not.toContain("var(--text-1)");
		expect(className).not.toContain("var(--hover)");
	});
});

describe("CitationBadge 验收 · en 镜像全链(AC-10)", () => {
	it("切 en 后 aria-label 逐字等于 en catalog 的插值产物", async () => {
		installGetChunk();
		renderCitation(`参见${KB_SHORT}说明`);
		await i18n.changeLanguage("en");
		try {
			const badge = screen.getByRole("button");
			// en catalog 值 "Cited source: {{doc}}" 插值全名(全名不截断)。
			expect(badge.getAttribute("aria-label")).toBe("Cited source: 产品手册.md");
			expect(badge.getAttribute("aria-label")).not.toContain("…");
		} finally {
			await i18n.changeLanguage("zh");
		}
	});
});

describe("CitationBadge 验收 · 三方混排精确重构(AC-8)", () => {
	it("同段 markdown 加粗/行内代码 + kb 角标 + web 链接:可见文本全串逐字等于期望", () => {
		installGetChunk();
		const view = renderCitation(`参照 **加粗**、\`码\`、${KB_SHORT} 与 ${WEB_TAG} 以及句尾。`);
		// 期望串:markdown 记号(如 **)不出现在可见文本;角标显示名用全名(短名不截断)。
		expect(view.textContent).toBe("参照 加粗、码、产品手册.md 与 developer.kingdee.com 以及句尾。");
	});
});
