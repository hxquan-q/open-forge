// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import type { DesktopApi, WeKnoraAgent, WeKnoraMessage, WeKnoraSession, WeKnoraStreamEvent } from "@preload/api";
import { i18n, initI18n } from "@shared/i18n";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * CP3 修复（06-review-fixes ①）的回归用例：流事件订阅提升为模块级常驻引擎
 * （`weKnoraStreamEngine`，幂等单例、不随组件卸载退订）后，「离开 /weknora 路由
 * （整页卸载）」窗口内的流事件仍被路由。修复前订阅是渲染层唯一订阅者、挂在 hook 的
 * useEffect 里：卸载窗口内分片全部丢失；期间到终态则路由/缓冲永不释放（该会话永久
 * 「思考中」+ 永久禁删）。三件用例对应修复清单要求的三条回归测试。
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

import { WeKnoraPage } from "./components/WeKnoraPage";

type WeKnoraApi = DesktopApi["weknora"];

function agent(id: string): WeKnoraAgent {
	return { id, name: `Agent ${id}` };
}

function wireMessage(id: string, role: "user" | "assistant", content: string): WeKnoraMessage {
	return { id, role, content };
}

interface FakeState {
	sessions: WeKnoraSession[];
	messagesBySession: Record<string, WeKnoraMessage[]>;
}

interface FakeCounters {
	listSessions: number;
	loadMessages: string[];
}

interface FakeHarness {
	api: WeKnoraApi;
	state: FakeState;
	counters: FakeCounters;
	emit: (event: WeKnoraStreamEvent) => void;
}

/** 有状态的假后端（沿用 background-flow 测试形态）：ask 落库即建会话，requestId 递增。 */
function installFake(): FakeHarness {
	const state: FakeState = { sessions: [], messagesBySession: {} };
	const counters: FakeCounters = { listSessions: 0, loadMessages: [] };
	let handler: ((event: WeKnoraStreamEvent) => void) | null = null;
	let sessionSeq = 0;
	let messageSeq = 0;
	let askSeq = 0;

	const api: WeKnoraApi = {
		getConfig: vi.fn(async () => ({ baseUrl: "http://host:8083", defaultAgentId: "", pageSize: 50, hasApiKey: true })),
		setConfig: vi.fn(async () => undefined),
		setApiKey: vi.fn(async () => undefined),
		listAgents: vi.fn(async () => [agent("A"), agent("B")]),
		listSessions: vi.fn(async () => {
			counters.listSessions += 1;
			return [...state.sessions];
		}),
		loadMessages: vi.fn(async ({ sessionId }) => {
			counters.loadMessages.push(sessionId);
			return state.messagesBySession[sessionId] ?? [];
		}),
		deleteSession: vi.fn(async () => undefined),
		getChunk: vi.fn(async () => ({ content: "chunk" })),
		getFile: vi.fn(async () => ({ dataUrl: "data:image/png;base64,", contentType: "image/png" })),
		ask: vi.fn(async (input) => {
			let sessionId = input.sessionId;
			if (!sessionId) {
				sessionSeq += 1;
				sessionId = `s${sessionSeq}`;
				state.sessions = [
					{
						id: sessionId,
						title: `会话 ${sessionId}`,
						updated_at: `2026-10-1${sessionSeq}T09:00:00`,
						...(input.agentId ? { last_request_state: { agent_id: input.agentId } } : {}),
					},
					...state.sessions,
				];
			}
			messageSeq += 1;
			state.messagesBySession[sessionId] = [
				...(state.messagesBySession[sessionId] ?? []),
				wireMessage(`u${messageSeq}`, "user", input.query),
				wireMessage(`a${messageSeq}`, "assistant", `对「${input.query}」的回答`),
			];
			askSeq += 1;
			return { requestId: `r${askSeq}`, sessionId };
		}),
		cancel: vi.fn(async () => undefined),
		onStreamEvent: vi.fn((next) => {
			handler = next;
			return () => {
				handler = null;
			};
		}),
	};
	Object.defineProperty(window, "vetta", {
		configurable: true,
		writable: true,
		value: { weknora: api } as unknown as DesktopApi,
	});
	return {
		api,
		state,
		counters,
		emit: (event) => handler?.(event),
	};
}

/** 挂载整页（指定 store）：卸载-重挂用同一 store，模拟「离开路由再回来」（atoms 是模块级）。 */
function renderFlow(store: ReturnType<typeof createStore>) {
	return render(
		<Provider store={store}>
			<WeKnoraPage />
		</Provider>,
	);
}

async function configureAndWaitReady(): Promise<void> {
	await waitFor(() => expect(screen.getByRole("button", { name: "Agent A" })).toBeTruthy());
}

async function askViaUi(text: string): Promise<void> {
	const user = userEvent.setup();
	await user.type(screen.getByPlaceholderText("输入你的问题…"), text);
	await user.click(screen.getByRole("button", { name: "发送" }));
	await act(async () => {
		await Promise.resolve();
	});
}

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

describe("智能客服 · 离开路由期间的流事件（CP3 ① 回归）", () => {
	it("组件卸载期间流事件仍被路由：重挂后已累积内容完整，后续分片继续追加（AC-16/17）", async () => {
		const harness = installFake();
		const store = createStore();
		const first = renderFlow(store);
		await configureAndWaitReady();

		await askViaUi("一问");
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲1" }));
		expect(screen.getByText("甲1")).toBeTruthy();

		// 离开 /weknora 路由：整页卸载。修复前唯一订阅者随组件退订，下面的分片全部丢失。
		first.unmount();
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲2" }));
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲3" }));

		// 回到路由：同一 store 重挂（归属表/缓冲是模块级 atom，跨挂载存活）。
		renderFlow(store);
		await configureAndWaitReady();
		// 卸载窗口内错过的分片立即可见（回切同步以缓冲为视图，无中段空洞）。
		expect(screen.getByText("甲1甲2甲3")).toBeTruthy();

		// 后续分片继续实时追加（不重新发起请求、不从头重播）。
		const loadCalls = harness.counters.loadMessages.length;
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲4" }));
		expect(screen.getByText("甲1甲2甲3甲4")).toBeTruthy();
		expect(harness.counters.loadMessages.length).toBe(loadCalls);
	});

	it("卸载期间流到终态：路由与缓冲释放，重挂后不再「思考中」、删除恢复可用（AC-19/10）", async () => {
		const harness = installFake();
		const store = createStore();
		const first = renderFlow(store);
		await configureAndWaitReady();

		// 路径一：卸载时仍是「当前会话」的流到终态（修复前 isStreaming 残留 → 假活 + 禁删死锁）。
		await askViaUi("一问");
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲" }));
		first.unmount();
		act(() => harness.emit({ type: "turn.completed", requestId: "r1" }));

		// 回到路由：该会话不再「思考中」（无假活），完整回答仍在视图上（未被误标中断），
		// 当前会话流身份已被引擎收敛（取消入口不残留，canAsk 恢复）。
		const second = renderFlow(store);
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });
		const row1 = await within(nav).findByRole("button", { name: /会话 s1/ });
		expect(within(row1).queryByText("思考中")).toBeNull();
		expect(screen.getByText("甲")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "取消" })).toBeNull();

		// 禁删解除（AC-10）：右键菜单的「删除会话」恢复可用（修复前永久灰显）。
		fireEvent.contextMenu(row1, { clientX: 12, clientY: 12 });
		const menu = await screen.findByRole("menu");
		const deleteItem = within(menu).getByRole("menuitem", { name: "删除会话" }) as HTMLButtonElement;
		expect(deleteItem.disabled).toBe(false);
		fireEvent.keyDown(document.body, { key: "Escape" });
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());

		// 路径二：卸载期间「后台会话」的流到终态——引擎完成全部终态副作用：缓冲释放 +
		// 去抖静默重拉列表（页面不在时列表也刷新，AC-20；修复前无人收敛）。
		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: "新建对话" }));
		await askViaUi("二问");
		act(() => harness.emit({ type: "answer.delta", requestId: "r2", text: "乙" }));
		await user.click(screen.getByRole("button", { name: "新建对话" }));
		await within(nav).findByRole("button", { name: /会话 s2/ });
		const baseline = harness.counters.listSessions;
		second.unmount();
		act(() => harness.emit({ type: "turn.completed", requestId: "r2" }));
		await waitFor(() => expect(harness.counters.listSessions).toBe(baseline + 1), { timeout: 4000 });

		// 重挂后 s2 同样无假活、可删。
		renderFlow(store);
		await configureAndWaitReady();
		const navAgain = await screen.findByRole("navigation", { name: "历史会话" });
		const row2 = await within(navAgain).findByRole("button", { name: /会话 s2/ });
		expect(within(row2).queryByText("思考中")).toBeNull();
		fireEvent.contextMenu(row2, { clientX: 12, clientY: 12 });
		const menuAgain = await screen.findByRole("menu");
		const deleteItemAgain = within(menuAgain).getByRole("menuitem", { name: "删除会话" }) as HTMLButtonElement;
		expect(deleteItemAgain.disabled).toBe(false);
	});

	it("模块级引擎幂等：多次挂载/卸载不重复订阅、终态副作用不放大", async () => {
		const harness = installFake();
		const store = createStore();
		// 三个挂载周期（含两个卸载窗口）：订阅只允许建立一次。
		const first = renderFlow(store);
		await configureAndWaitReady();
		first.unmount();
		const second = renderFlow(store);
		await configureAndWaitReady();
		second.unmount();
		renderFlow(store);
		await configureAndWaitReady();
		expect(harness.api.onStreamEvent).toHaveBeenCalledTimes(1);

		// 事件仍被正常路由（第三周期挂载后流照常可见）。
		await askViaUi("幂等");
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲" }));
		expect(screen.getByText("甲")).toBeTruthy();

		// 转后台再终态：去抖窗口后恰好一次列表重拉（副作用不因多次挂载/卸载而重复）。
		await userEvent.setup().click(screen.getByRole("button", { name: "新建对话" }));
		const nav = await screen.findByRole("navigation", { name: "历史会话" });
		await within(nav).findByRole("button", { name: /会话 s1/ });
		const baseline = harness.counters.listSessions;
		act(() => harness.emit({ type: "turn.completed", requestId: "r1" }));
		await waitFor(() => expect(harness.counters.listSessions).toBe(baseline + 1), { timeout: 4000 });
		await new Promise((resolve) => setTimeout(resolve, 800));
		expect(harness.counters.listSessions).toBe(baseline + 1);
		// 终态处理本身也不产生新订阅。
		expect(harness.api.onStreamEvent).toHaveBeenCalledTimes(1);
	});
});
