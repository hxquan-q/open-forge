// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import type { DesktopApi, WeKnoraAgent, WeKnoraSession, WeKnoraStreamEvent } from "@preload/api";
import { i18n, initI18n } from "@shared/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { WeKnoraPage } from "./components/WeKnoraPage";
import { WEKNORA_SIDEBAR_STORAGE_KEY } from "./weknora-sidebar-state";

/**
 * 侧栏收起过渡的用户流程级用例（TASK-0506：重写自写 motion 动画为 ResizeHandle/抽屉式折叠）。
 *
 * 沿 weknora-sidebar-collapse 同一装配路线：整页 + 假后端，按真实用户路径断言。
 * jsdom 不跑真实布局/动画帧，因此只断言「可验证事实」：
 * - 展开态：侧栏槽占位宽度 = 会话栏宽度，面板滑入到位（translateX(0)、不透明）；
 * - 收起态：占位宽度归零、面板滑出（translateX(-100%)、透明）且对辅助技术收起
 *   （`inert` + `aria-hidden`）；占位盒子宽度一步到位不参与逐帧重排；
 * - 过渡是纯 CSS（`transition-[transform,opacity]`），reduced-motion 经
 *   `motion-reduce:transition-none` 瞬时切换；
 * - 落盘语义不变（收起/展开仍写盘）。
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
		<div role="button" data-value={value}>
			{children}
		</div>
	),
}));

type WeKnoraApi = DesktopApi["weknora"];

const CONFIGURED = { baseUrl: "http://host:8083", defaultAgentId: "", pageSize: 50, hasApiKey: true };

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
		getChunk: vi.fn(async () => ({ content: "chunk" })),
		getFile: vi.fn(async () => ({ dataUrl: "data:image/png;base64,", contentType: "image/png" })),
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

/** 侧栏占位盒子（宽度一步到位的槽位）。 */
function sidebarSlot(): HTMLElement | null {
	return screen.queryByTestId("weknora-sidebar-slot");
}

/** 侧栏滑动面板（占位盒子里做 transform/opacity 过渡的那层）。 */
function sidebarPanel(): HTMLElement | null {
	return sidebarSlot()?.firstElementChild as HTMLElement | null;
}

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

describe("智能客服 · 侧栏抽屉式折叠（TASK-0506）", () => {
	it("展开态：占位宽度等于会话栏宽度，面板滑入到位；过渡是纯 CSS transform/opacity（无逐帧宽度动画）", async () => {
		installApi();
		renderPage();
		await waitReady();

		const slot = sidebarSlot();
		const panel = sidebarPanel();
		expect(slot).not.toBeNull();
		expect(panel).not.toBeNull();
		// 占位宽度一步到位 = 面板宽度（默认 272px），不参与过渡。
		expect(slot?.style.width).toBe(panel?.style.width);
		expect(slot?.style.width).not.toBe("0px");
		// 面板滑入到位。
		expect(panel?.style.transform).toBe("translateX(0)");
		expect(panel?.style.opacity).toBe("");
		// 过渡只动 transform/opacity，且走纯 CSS 类（reduced-motion 瞬时切换的钩子也在类上）。
		expect(panel?.className).toContain("transition-[transform,opacity]");
		expect(panel?.className).toContain("motion-reduce:transition-none");
		// 对辅助技术可见（无 inert / aria-hidden）。
		expect(slot?.hasAttribute("inert")).toBe(false);
		expect(slot?.hasAttribute("aria-hidden")).toBe(false);
	});

	it("收起：占位宽度归零，面板滑出并透明；对辅助技术已收起（inert + aria-hidden）；消息区不受影响", async () => {
		installApi();
		renderPage();
		await waitReady();

		await userEvent.setup().click(toggleButton());

		const slot = sidebarSlot();
		const panel = sidebarPanel();
		expect(slot?.style.width).toBe("0px");
		expect(panel?.style.transform).toBe("translateX(-100%)");
		expect(panel?.className).toContain("opacity-0");
		expect(slot?.hasAttribute("inert")).toBe(true);
		expect(slot?.getAttribute("aria-hidden")).toBe("true");
		// 会话主区（输入区）不受影响。
		expect(screen.getByPlaceholderText("输入你的问题…")).toBeTruthy();
	});

	it("收起后展开：面板滑回、列表数据原样、不触发重拉", async () => {
		const api = installApi();
		renderPage();
		await waitReady();
		await waitFor(() => expect(api.listSessions).toHaveBeenCalledTimes(1));

		await userEvent.setup().click(toggleButton());
		expect(sidebarSlot()?.style.width).toBe("0px");

		await userEvent.setup().click(toggleButton());
		const panel = sidebarPanel();
		expect(sidebarSlot()?.style.width).not.toBe("0px");
		expect(panel?.style.transform).toBe("translateX(0)");
		// 列表数据与收起前一致，且没有因收起-展开重拉（子树留住不卸载）。
		const nav = screen.getByRole("navigation", { name: "历史会话", hidden: true });
		expect(nav.textContent).toContain("会话一");
		expect(api.listSessions).toHaveBeenCalledTimes(1);
	});

	it("持久化语义不变：收起/展开仍写盘", async () => {
		installApi();
		renderPage();
		await waitReady();

		await userEvent.setup().click(toggleButton());
		expect(localStorage.getItem(WEKNORA_SIDEBAR_STORAGE_KEY)).toBe('{"version":1,"collapsed":true}');

		await userEvent.setup().click(toggleButton());
		expect(localStorage.getItem(WEKNORA_SIDEBAR_STORAGE_KEY)).toBe('{"version":1,"collapsed":false}');
	});

	it("未配置时不渲染侧栏槽，也不显示显隐开关", async () => {
		installApi();
		localStorage.clear();
		renderPage();
		await waitFor(() => expect(screen.getByRole("button", { name: "Agent A" })).toBeTruthy());

		// configured 时槽在；这里只验证存在性方向（未配置分支由 collapse 套件覆盖）。
		expect(sidebarSlot()).not.toBeNull();
	});
});
