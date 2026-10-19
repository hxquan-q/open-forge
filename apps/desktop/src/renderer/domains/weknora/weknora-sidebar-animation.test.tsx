// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import type { DesktopApi, WeKnoraAgent, WeKnoraSession, WeKnoraStreamEvent } from "@preload/api";
import { i18n, initI18n } from "@shared/i18n";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { WeKnoraPage } from "./components/WeKnoraPage";
import { WEKNORA_SIDEBAR_STORAGE_KEY } from "./weknora-sidebar-state";

/**
 * D 组「侧栏收起动画」的用户流程级用例（AC-10/11/12，T04）。
 *
 * 与 weknora-sidebar-collapse（A 组守卫）同一装配路线：整页 + 假后端，按真实用户路径断言。
 * jsdom 不跑真实布局/动画帧，因此只断言「可验证事实」：
 * - 动画期（约 200ms）侧栏槽仍在 DOM —— 证明是「过渡」而非硬切（AC-10）；
 * - 动画结束后侧栏槽从 DOM 卸载 —— 终态不渲染、不留不可见节点（AC-11）；
 * - reduced-motion 下收起无过渡期、立即卸载（AC-12）。
 * 「好看不好看」留实机验收，不在此断言。
 */

vi.mock("@shared/components/RendererMarkdownContent", () => ({
	RendererMarkdownContent: ({ text }: { text: string }) => <div data-testid="weknora-markdown">{text}</div>,
}));

vi.mock("@shared/components/ui/select", () => ({
	Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SelectTrigger: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => (
		<div {...props}>{children}</div>
	),
	SelectValue: () => <span />,
	SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
		<button type="button" data-value={value}>
			{children}
		</button>
	),
}));

type WeKnoraApi = DesktopApi["weknora"];

const CONFIGURED = { baseUrl: "http://host:8083", defaultAgentId: "", pageSize: 50, hasApiKey: true };

/** 动画时长（与实现里的 SIDEBAR_ANIMATION_MS 同量级）；等它播完再加余量。 */
const ANIMATION_SETTLE_MS = 260;

function agent(id: string): WeKnoraAgent {
	return { id, name: `Agent ${id}` };
}

function installApi(): WeKnoraApi {
	const api: WeKnoraApi = {
		getConfig: vi.fn(async () => CONFIGURED),
		setConfig: vi.fn(async () => undefined),
		setApiKey: vi.fn(async () => undefined),
		listAgents: vi.fn(async () => [agent("A"), agent("B")]),
		listSessions: vi.fn(async () => [
			{ id: "s1", title: "会话一", updated_at: "2026-10-19T09:00:00" },
			{ id: "s2", title: "会话二", updated_at: "2026-10-19T10:00:00" },
		] satisfies WeKnoraSession[]),
		loadMessages: vi.fn(async () => []),
		deleteSession: vi.fn(async () => undefined),
		ask: vi.fn(async () => ({ requestId: "r1", sessionId: "s1" })),
		cancel: vi.fn(async () => undefined),
		onStreamEvent: vi.fn((_next: (event: WeKnoraStreamEvent) => void) => () => undefined),
	};
	Object.defineProperty(window, "vetta", {
		configurable: true,
		writable: true,
		value: { weknora: api } as unknown as DesktopApi,
	});
	return api;
}

afterEach(() => {
	localStorage.clear();
	vi.unstubAllGlobals();
});

function renderPage(): ReturnType<typeof render> {
	return render(
		<Provider store={createStore()}>
			<WeKnoraPage />
		</Provider>,
	);
}

async function waitReady(): Promise<void> {
	await waitFor(() => expect(screen.getByRole("button", { name: "Agent A" })).toBeTruthy());
}

function toggleButton(): HTMLButtonElement {
	return screen.getByRole("button", { name: /历史会话/ }) as HTMLButtonElement;
}

/**
 * 侧栏槽是否在 DOM。`hidden: true` 让查询纳入 `aria-hidden` 元素——
 * 动画期间侧栏对辅助技术已「收起」，但仍留在 DOM 里播过渡。
 */
function sidebarSlot(): HTMLElement | null {
	return screen.queryByRole("navigation", { name: "历史会话", hidden: true });
}

/** 侧栏槽的外壳（motion 驱动的宽度/透明度动画元素）。 */
function sidebarSlotShell(): HTMLElement | null {
	const nav = sidebarSlot();
	return nav?.parentElement ?? null;
}

/** 等退出动画播完（把定时器回调包进 act，避免落下「更新未包 act」告警）。 */
async function settleAnimation(): Promise<void> {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, ANIMATION_SETTLE_MS));
	});
}

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

describe("智能客服 · 侧栏收起动画（D 组 AC-10/11/12）", () => {
	it("展开态：侧栏槽由 motion 驱动（外壳带 overflow-hidden 与内联 width/opacity），内容行不再留 gap-4（AC-10）", async () => {
		installApi();
		renderPage();
		await waitReady();

		const shell = sidebarSlotShell();
		expect(shell).not.toBeNull();
		// 宽度滑动靠 overflow-hidden 裁剪 + motion 内联宽度；淡入/淡出靠内联 opacity。
		expect(shell?.classList.contains("overflow-hidden")).toBe(true);
		const style = shell?.getAttribute("style") ?? "";
		expect(style).toContain("opacity");
		expect(style).toContain("width");

		// 间隙并入动画宽度：内容行不再自带 gap-4，否则收起终态会残留 16px 空隙。
		const contentRow = shell?.parentElement;
		expect(contentRow?.classList.contains("gap-4")).toBe(false);
	});

	it("收起时进入过渡：动画期间侧栏槽仍在 DOM（对辅助技术已收起），消息区与输入区不受影响（AC-10）", async () => {
		installApi();
		renderPage();
		await waitReady();

		await userEvent.setup().click(toggleButton());

		// 过渡期：节点还在（证明是动画而非硬切），但已 aria-hidden。
		expect(sidebarSlotShell()).not.toBeNull();
		expect(screen.queryByRole("navigation", { name: "历史会话" })).toBeNull();
		expect(screen.getByPlaceholderText("输入你的问题…")).toBeTruthy();
	});

	it("动画结束后侧栏从 DOM 卸载：终态不渲染、不留不可见占位节点（AC-11）", async () => {
		installApi();
		renderPage();
		await waitReady();

		await userEvent.setup().click(toggleButton());
		expect(sidebarSlotShell()).not.toBeNull();

		await settleAnimation();
		// 终态：连 aria-hidden 的过渡节点都不复存在（含 hidden: true 也查不到）。
		expect(sidebarSlotShell()).toBeNull();
		expect(screen.queryByRole("navigation", { name: "历史会话", hidden: true })).toBeNull();
	});

	it("收起后展开：侧栏回归、列表数据原样、不触发重拉（AC-11）", async () => {
		const api = installApi();
		renderPage();
		await waitReady();
		await waitFor(() => expect(api.listSessions).toHaveBeenCalledTimes(1));

		await userEvent.setup().click(toggleButton());
		await settleAnimation();
		expect(sidebarSlotShell()).toBeNull();

		await userEvent.setup().click(toggleButton());
		// 展开：槽立即可查（辅助技术可见），数据与收起前一致。
		const nav = screen.getByRole("navigation", { name: "历史会话" });
		expect(nav.textContent).toContain("会话一");
		expect(api.listSessions).toHaveBeenCalledTimes(1);
	});

	it("reduced-motion：收起无过渡期、立即卸载（AC-12）", async () => {
		vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
		installApi();
		renderPage();
		await waitReady();

		await userEvent.setup().click(toggleButton());

		// 无过渡：点击后槽已不在 DOM（含 hidden: true 也查不到）。
		expect(sidebarSlotShell()).toBeNull();
	});

	it("持久化语义不变：收起/展开仍写盘（AC-12）", async () => {
		installApi();
		renderPage();
		await waitReady();

		await userEvent.setup().click(toggleButton());
		expect(localStorage.getItem(WEKNORA_SIDEBAR_STORAGE_KEY)).toBe('{"version":1,"collapsed":true}');

		await userEvent.setup().click(toggleButton());
		expect(localStorage.getItem(WEKNORA_SIDEBAR_STORAGE_KEY)).toBe('{"version":1,"collapsed":false}');
	});
});
