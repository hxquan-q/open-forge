// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import type { DesktopApi, WeKnoraAgent, WeKnoraMessage, WeKnoraSession, WeKnoraStreamEvent } from "@preload/api";
import { i18n, initI18n } from "@shared/i18n";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Markdown 渲染由共享管线负责（真实实现依赖 activity-panel 上下文）；这里替换成可断言的桩，
// 用来验证「流式期间纯文本 / 终态才 Markdown」这条行为边界（02-plan §4.4）。
vi.mock("@shared/components/RendererMarkdownContent", () => ({
	RendererMarkdownContent: ({ text }: { text: string }) => <div data-testid="weknora-markdown">{text}</div>,
}));

// Radix Select 在 jsdom 下需要指针捕获等环境；沿用仓库既有做法，用可断言的替身（TeamSettingsSheet.test 同款）。
vi.mock("@shared/components/ui/select", () => ({
	Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
		<div data-value={value}>{children}</div>
	),
	SelectTrigger: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => (
		<div {...props}>{children}</div>
	),
	SelectValue: () => <span />,
}));

import { WeKnoraPage } from "./components/WeKnoraPage";

type WeKnoraApi = DesktopApi["weknora"];

const CONFIGURED = { baseUrl: "http://host:8083", defaultAgentId: "A", pageSize: 50, hasApiKey: true };

function agent(id: string): WeKnoraAgent {
	return { id, name: `Agent ${id}` };
}

function session(id: string, overrides: Partial<WeKnoraSession> = {}): WeKnoraSession {
	return { id, ...overrides };
}

function message(id: string, role: "user" | "assistant", content: string): WeKnoraMessage {
	return { id, role, content };
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
		listSessions: vi.fn(async () => []),
		loadMessages: vi.fn(async () => []),
		deleteSession: vi.fn(async () => undefined),
		getChunk: vi.fn(async () => ({ content: "chunk" })),
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

function renderPage(): void {
	const store = createStore();
	render(
		<Provider store={store}>
			<WeKnoraPage />
		</Provider>,
	);
}

/** 发一条消息并等 ask 的 Promise 落定（activeRequestId 就绪，后续流事件才会被接收）。 */
async function sendMessage(api: WeKnoraApi, text: string): Promise<void> {
	const user = userEvent.setup();
	await user.type(screen.getByPlaceholderText("输入你的问题…"), text);
	await user.click(screen.getByRole("button", { name: "发送" }));
	await act(async () => {
		await Promise.resolve();
	});
	expect(api.ask).toHaveBeenCalled();
}

async function waitReady(): Promise<void> {
	await waitFor(() => expect(screen.getByText("Agent A")).toBeTruthy());
}

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

describe("WeKnoraPage", () => {
	it("未配置时显示引导，且不发任何请求（AC-2）", async () => {
		const { api } = installApi({ getConfig: vi.fn(async () => ({ ...CONFIGURED, hasApiKey: false })) });
		renderPage();

		await waitFor(() => expect(screen.getByText("尚未配置智能客服")).toBeTruthy());
		expect(screen.getByText("填写 WeKnora 服务地址与租户 API Key 后即可开始提问。")).toBeTruthy();
		expect(api.listAgents).not.toHaveBeenCalled();
		expect(api.ask).not.toHaveBeenCalled();
	});

	it("列出全部智能体名称（AC-16）", async () => {
		installApi();
		renderPage();
		await waitReady();
		expect(screen.getByText("Agent B")).toBeTruthy();
	});

	it("智能体列表为空时给出提示，提问按钮禁用且不发请求（AC-19）", async () => {
		const { api } = installApi({ listAgents: vi.fn(async () => []) });
		renderPage();

		await waitFor(() => expect(screen.getByText(/没有可用智能体/)).toBeTruthy());
		const send = screen.getByRole("button", { name: "发送" }) as HTMLButtonElement;
		expect(send.disabled).toBe(true);
		await userEvent.click(send);
		expect(api.ask).not.toHaveBeenCalled();
	});

	it("智能体列表拉取失败时给出中文提示且提问不可用（AC-19 失败路径）", async () => {
		const { api } = installApi({
			listAgents: vi.fn(async () => {
				throw new Error("boom");
			}),
		});
		renderPage();

		await waitFor(() => expect(screen.getByText(/获取智能体列表失败/)).toBeTruthy());
		const send = screen.getByRole("button", { name: "发送" }) as HTMLButtonElement;
		expect(send.disabled).toBe(true);
		await userEvent.click(send);
		expect(api.ask).not.toHaveBeenCalled();
	});

	it("提问调 ask；进行中显示 loading 且发送按钮禁用（AC-4/7）", async () => {
		const { api } = installApi();
		renderPage();
		await waitReady();

		await sendMessage(api, "你好");

		await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
		expect((screen.getByRole("button", { name: "发送" }) as HTMLButtonElement).disabled).toBe(true);
	});

	it("注入 3 个 answer.delta → 界面已出现拼接文本，且未做 Markdown 渲染（AC-6/R5）", async () => {
		const { api, emit } = installApi();
		renderPage();
		await waitReady();
		await sendMessage(api, "你好");

		act(() => emit({ type: "answer.delta", requestId: "r1", text: "你" }));
		act(() => emit({ type: "answer.delta", requestId: "r1", text: "好" }));
		act(() => emit({ type: "answer.delta", requestId: "r1", text: "呀" }));

		expect(screen.getByText("你好呀")).toBeTruthy();
		expect(screen.queryByTestId("weknora-markdown")).toBeNull();
	});

	it("turn.completed 后做一次完整 Markdown 渲染（AC-6）", async () => {
		const { api, emit } = installApi();
		renderPage();
		await waitReady();
		await sendMessage(api, "**加粗**");

		act(() => emit({ type: "answer.delta", requestId: "r1", text: "**加粗**" }));
		expect(screen.queryByTestId("weknora-markdown")).toBeNull();

		act(() => emit({ type: "turn.completed", requestId: "r1" }));
		expect(screen.getByTestId("weknora-markdown").textContent).toBe("**加粗**");
	});

	it("取消调 cancel，保留已收到文本并标注「已取消」（AC-8）", async () => {
		const { api, emit } = installApi();
		renderPage();
		await waitReady();
		await sendMessage(api, "问题");

		act(() => emit({ type: "answer.delta", requestId: "r1", text: "部分回答" }));
		await userEvent.click(screen.getByRole("button", { name: "取消" }));

		expect(api.cancel).toHaveBeenCalledWith("r1");
		expect(screen.getByText("部分回答")).toBeTruthy();
		expect(screen.getByText("已取消")).toBeTruthy();
	});

	it("requestId 不匹配的 delta 不改变界面（AC-15）", async () => {
		const { api, emit } = installApi();
		renderPage();
		await waitReady();
		await sendMessage(api, "你好");

		act(() => emit({ type: "answer.delta", requestId: "other", text: "串台内容" }));
		expect(screen.queryByText("串台内容")).toBeNull();
	});
});

describe("WeKnoraPage · 历史会话（AC-12/13/14/20）", () => {
	it("历史每行显示绑定的 agent 名（AC-20）", async () => {
		installApi({
			listSessions: vi.fn(async () => [
				session("s1", { title: "会话一", last_request_state: { agent_id: "B" } }),
			]),
		});
		renderPage();

		const nav = await screen.findByRole("navigation", { name: "历史会话" });
		await waitFor(() => expect(within(nav).getByText("会话一")).toBeTruthy());
		expect(within(nav).getByText("Agent B")).toBeTruthy();
	});

	it("agent 名映射不到时显示「未知」且不崩溃（AC-20 / R6）", async () => {
		installApi({
			listSessions: vi.fn(async () => [session("s1", { last_request_state: { agent_id: "ghost" } })]),
		});
		renderPage();

		const nav = await screen.findByRole("navigation", { name: "历史会话" });
		await waitFor(() => expect(within(nav).getByText("未知")).toBeTruthy());
	});

	it("last_request_state 整个缺失时显示「未知」且不崩溃（AC-20 / R6）", async () => {
		installApi({ listSessions: vi.fn(async () => [session("s1")]) });
		renderPage();

		const nav = await screen.findByRole("navigation", { name: "历史会话" });
		await waitFor(() => expect(within(nav).getByText("未知")).toBeTruthy());
	});

	it("历史列表渲染标题与时间，按更新时间倒序（AC-13）", async () => {
		installApi({
			listSessions: vi.fn(async () => [
				session("old", { title: "旧会话", updated_at: "2026-01-01T00:00:00" }),
				session("new", { title: "新会话", updated_at: "2026-02-01T09:30:00" }),
			]),
		});
		renderPage();

		const nav = await screen.findByRole("navigation", { name: "历史会话" });
		await waitFor(() => expect(within(nav).getByText("新会话")).toBeTruthy());

		const items = within(nav).getAllByRole("listitem");
		expect(items[0]?.textContent).toContain("新会话");
		expect(items[0]?.textContent).toContain("2026-02-01 09:30");
		expect(items[1]?.textContent).toContain("旧会话");
	});

	it("点历史会话先弹确认；取消则什么都不做（1d）", async () => {
		const { api } = installApi({ listSessions: vi.fn(async () => [session("s1", { title: "会话一" })]) });
		renderPage();
		await waitReady();
		await sendMessage(api, "当前问题");
		expect(screen.getByText("当前问题")).toBeTruthy();

		const nav = screen.getByRole("navigation", { name: "历史会话" });
		await userEvent.click(within(nav).getByRole("button", { name: /会话一/ }));

		const dialog = await screen.findByRole("dialog");
		expect(within(dialog).getByText(/当前对话将被替换/)).toBeTruthy();

		await userEvent.click(within(dialog).getByRole("button", { name: "取消" }));

		expect(api.loadMessages).not.toHaveBeenCalled();
		expect(screen.getByText("当前问题")).toBeTruthy();
	});

	it("确认后调 load-messages 并切换为当前对话（AC-14 / 1d）", async () => {
		const { api } = installApi({
			listSessions: vi.fn(async () => [session("s9", { title: "旧会话" })]),
			loadMessages: vi.fn(async () => [
				message("m1", "user", "历史提问"),
				message("m2", "assistant", "历史回答"),
			]),
		});
		renderPage();
		await waitReady();

		const nav = screen.getByRole("navigation", { name: "历史会话" });
		await userEvent.click(within(nav).getByRole("button", { name: /旧会话/ }));

		const dialog = await screen.findByRole("dialog");
		await userEvent.click(within(dialog).getByRole("button", { name: "替换当前对话" }));

		await waitFor(() => expect(api.loadMessages).toHaveBeenCalledWith({ sessionId: "s9", limit: 20 }));
		await waitFor(() => expect(screen.getByText("历史提问")).toBeTruthy());
		expect(screen.getByText("历史回答")).toBeTruthy();
	});

	it("新建对话按钮清空当前消息（AC-12）", async () => {
		const { api } = installApi();
		renderPage();
		await waitReady();
		await sendMessage(api, "问题");
		expect(screen.getByText("问题")).toBeTruthy();

		await userEvent.click(screen.getByRole("button", { name: "新建对话" }));

		expect(screen.queryByText("问题")).toBeNull();
	});

	it("历史为空时提供刷新入口，点击后重新拉取（缺陷 3）", async () => {
		const { api } = installApi({ listSessions: vi.fn(async () => []) });
		renderPage();

		const nav = await screen.findByRole("navigation", { name: "历史会话" });
		await waitFor(() => expect(within(nav).getByText("暂无历史会话")).toBeTruthy());
		expect(api.listSessions).toHaveBeenCalledTimes(1);

		await userEvent.click(within(nav).getByRole("button", { name: "刷新" }));

		await waitFor(() => expect(api.listSessions).toHaveBeenCalledTimes(2));
	});
});
