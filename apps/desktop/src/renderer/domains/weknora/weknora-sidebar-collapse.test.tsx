// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import type { DesktopApi, WeKnoraAgent, WeKnoraSession, WeKnoraStreamEvent } from "@preload/api";
import { i18n, initI18n } from "@shared/i18n";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { WeKnoraPage } from "./components/WeKnoraPage";
import { WEKNORA_SIDEBAR_STORAGE_KEY } from "./weknora-sidebar-state";

/**
 * A 组「侧栏收起」的用户流程级用例（AC-1~5，T03）。
 *
 * 沿 weknora-flow / weknora-delete-flow 的路线：整页装配 + 假后端，按真实用户路径
 * （点开关 → 收起 → 再点 → 展开）断言可观察行为。jsdom 不做真实布局，「布局顶满」
 * 以结构断言等价表达：侧栏节点不在 DOM、主列（消息区 + 输入区）仍在。
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

function agent(id: string): WeKnoraAgent {
	return { id, name: `Agent ${id}` };
}

interface Harness {
	readonly api: WeKnoraApi;
	readonly emit: (event: WeKnoraStreamEvent) => void;
}

function installApi(overrides: Partial<WeKnoraApi> = {}): Harness {
	let handler: ((event: WeKnoraStreamEvent) => void) | null = null;
	const api: WeKnoraApi = {
		getConfig: vi.fn(async () => CONFIGURED),
		setConfig: vi.fn(async () => undefined),
		setApiKey: vi.fn(async () => undefined),
		listAgents: vi.fn(async () => [agent("A"), agent("B")]),
		listSessions: vi.fn(async () => [
			{ id: "s1", title: "会话一", updated_at: "2026-10-19T09:00:00" },
			{ id: "s2", title: "会话二", updated_at: "2026-10-19T10:00:00" },
		]),
		loadMessages: vi.fn(async () => []),
		deleteSession: vi.fn(async () => undefined),
		getChunk: vi.fn(async () => ({ content: "chunk" })),
		getFile: vi.fn(async () => ({ dataUrl: "data:image/png;base64,", contentType: "image/png" })),
		ask: vi.fn(async () => ({ requestId: "r1", sessionId: "s1" })),
		cancel: vi.fn(async () => undefined),
		onStreamEvent: vi.fn((next: (event: WeKnoraStreamEvent) => void) => {
			handler = next;
			return () => {
				handler = null;
			};
		}),
		...overrides,
	};
	Object.defineProperty(window, "vetta", {
		configurable: true,
		writable: true,
		value: { weknora: api } as unknown as DesktopApi,
	});
	return { api, emit: (event) => handler?.(event) };
}

/** 落盘在模块外（localStorage），测试间必须清掉，否则收起状态会串场。 */
afterEach(() => {
	localStorage.clear();
});

/** 返回 RenderResult，供「重启」用例卸载上一页面实例。 */
function renderPage(): ReturnType<typeof render> {
	return render(
		<Provider store={createStore()}>
			<WeKnoraPage />
		</Provider>,
	);
}

/** 等智能体就绪（配置读取 + 初次拉取完成的可观察信号）。 */
async function waitReady(): Promise<void> {
	await waitFor(() => expect(screen.getByRole("button", { name: "Agent A" })).toBeTruthy());
}

/** 拿侧栏显隐开关（按当前态的可访问名称）。 */
function toggleButton(): HTMLButtonElement {
	return screen.getByRole("button", { name: /历史会话/ }) as HTMLButtonElement;
}

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

describe("智能客服 · 侧栏收起（A 组用户流程）", () => {
	it("开关带 aria-expanded 与可访问名称；点按在展开/收起间切换（AC-1）", async () => {
		installApi();
		renderPage();
		await waitReady();

		const toggle = toggleButton();
		expect(toggle.getAttribute("aria-label")).toBe("收起历史会话");
		expect(toggle.getAttribute("aria-expanded")).toBe("true");

		await userEvent.setup().click(toggle);
		const collapsed = toggleButton();
		expect(collapsed.getAttribute("aria-label")).toBe("展开历史会话");
		expect(collapsed.getAttribute("aria-expanded")).toBe("false");
	});

	it("收起时侧栏不在 DOM、消息区与输入区仍在（AC-2 结构等价）；展开后列表数据原样、不重拉（AC-2）", async () => {
		const { api } = installApi();
		renderPage();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });
		await within(nav).findAllByRole("button", { name: /会话[一二]/ });
		// 挂载初次拉取后 listSessions 只应有 1 次（保存/删除/手动刷新才会再拉）。
		await waitFor(() => expect(api.listSessions).toHaveBeenCalledTimes(1));

		await userEvent.setup().click(toggleButton());

		// 收起 = 整栏不渲染（不是视觉隐藏）：导航节点从 DOM 消失，聊天区不受影响。
		expect(screen.queryByRole("navigation", { name: "历史会话" })).toBeNull();
		expect(screen.getByPlaceholderText("输入你的问题…")).toBeTruthy();

		await userEvent.setup().click(toggleButton());

		// 展开后：列表数据与收起前一致（同样两条会话），且没有因收起-展开重拉。
		const navAgain = screen.getByRole("navigation", { name: "历史会话" });
		expect(within(navAgain).getByRole("button", { name: /会话一/ })).toBeTruthy();
		expect(within(navAgain).getByRole("button", { name: /会话二/ })).toBeTruthy();
		expect(api.listSessions).toHaveBeenCalledTimes(1);
	});

	it("收起状态落盘，重新挂载（等价重启）仍收起；再展开后恢复（AC-3）", async () => {
		installApi();
		const first = renderPage();
		await waitReady();
		await userEvent.setup().click(toggleButton());
		expect(screen.queryByRole("navigation", { name: "历史会话" })).toBeNull();
		expect(localStorage.getItem(WEKNORA_SIDEBAR_STORAGE_KEY)).toBe('{"version":1,"collapsed":true}');
		first.unmount();

		// 重启 = 全新挂载：惰性初始化读落盘，收起态保持。
		renderPage();
		await waitReady();
		expect(screen.queryByRole("navigation", { name: "历史会话" })).toBeNull();

		await userEvent.setup().click(toggleButton());
		expect(screen.getByRole("navigation", { name: "历史会话" })).toBeTruthy();
		expect(localStorage.getItem(WEKNORA_SIDEBAR_STORAGE_KEY)).toBe('{"version":1,"collapsed":false}');
	});

	it("落盘记录被写坏时安全回落展开（AC-3 兜底）", async () => {
		localStorage.setItem(WEKNORA_SIDEBAR_STORAGE_KEY, "]]garbage[[");
		installApi();
		renderPage();

		const nav = await screen.findByRole("navigation", { name: "历史会话" });
		expect(within(nav).getByRole("button", { name: /会话一/ })).toBeTruthy();
		expect(toggleButton().getAttribute("aria-expanded")).toBe("true");
	});

	it("未配置时不显示侧栏，也不显示显隐开关（AC-4）", async () => {
		installApi({ getConfig: vi.fn(async () => ({ ...CONFIGURED, hasApiKey: false })) });
		renderPage();

		await waitFor(() => expect(screen.getByText("尚未配置智能客服")).toBeTruthy());
		expect(screen.queryByRole("navigation", { name: "历史会话" })).toBeNull();
		expect(screen.queryByRole("button", { name: /历史会话/ })).toBeNull();
	});

	it("收起不影响发消息：仍可提问并收到流式回答（AC-5）", async () => {
		const { api, emit } = installApi();
		renderPage();
		await waitReady();
		await userEvent.setup().click(toggleButton());
		expect(screen.queryByRole("navigation", { name: "历史会话" })).toBeNull();

		const user = userEvent.setup();
		await user.type(screen.getByPlaceholderText("输入你的问题…"), "收起时的问题");
		await user.click(screen.getByRole("button", { name: "发送" }));
		await act(async () => {
			await Promise.resolve();
		});

		expect(api.ask).toHaveBeenCalled();
		act(() => emit({ type: "answer.delta", requestId: "r1", text: "回答正文" }));
		expect(screen.getByText("回答正文")).toBeTruthy();
	});
});
