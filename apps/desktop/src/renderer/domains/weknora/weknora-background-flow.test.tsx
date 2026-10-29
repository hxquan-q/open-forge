// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { randomUUID } from "node:crypto";
import type { DesktopApi, WeKnoraAgent, WeKnoraMessage, WeKnoraSession, WeKnoraStreamEvent } from "@preload/api";
import { i18n, initI18n } from "@shared/i18n";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * D 组「后台思考」的用户流程级用例（AC-16~22，T01）。
 *
 * 沿 weknora-flow.test.tsx 的路线：把整页串起来按真实用户路径断言**结果**——
 * 切走 / 回切 / 并发 / 取消 / 后台终态都要在页面行为上可观察，纯函数级测不出
 * 「该路由的没路由」这类流程缺陷（R2 教训）。
 */

vi.mock("@shared/components/RendererMarkdownContent", () => ({
	RendererMarkdownContent: ({ text }: { text: string }) => <div data-testid="weknora-markdown">{text}</div>,
}));

// 输入栏分支标签/Git 页签的 useMeta 会拉取仓库状态（window.vetta.git）；测试桥不带
// git 通道，桩掉该 hook 避免未处理 rejection 干扰流程断言（vitest 会把未处理错误
// 记为潜在假阳性）。
vi.mock("@shared/hooks/useGitRepoStatus", () => ({
	useGitRepoStatus: () => ({ status: null, loading: false, refresh: () => {} }),
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

/** 红线 C2：测试夹具不出现任何 Key 字面量，一律运行时生成（与 main 侧做法一致）。 */
const FAKE_API_KEY = `test-key-${randomUUID()}`;

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
	ask: Array<{ query: string; sessionId?: string; agentId?: string }>;
}

interface FakeHarness {
	api: WeKnoraApi;
	state: FakeState;
	counters: FakeCounters;
	emit: (event: WeKnoraStreamEvent) => void;
	/** 手动把一个会话塞进服务端列表（配合手动落库的 ask 用）。 */
	addSession: (session: WeKnoraSession) => void;
}

/**
 * 有状态的假后端（沿用 flow 测试的形态）：会话列表 / 会话消息随提问增长。
 * ask 的 requestId 递增（r1、r2…），并发多路时事件按 requestId 区分，互不相同。
 */
function installFake(): FakeHarness {
	const state: FakeState = { sessions: [], messagesBySession: {} };
	const counters: FakeCounters = { listSessions: 0, loadMessages: [], ask: [] };
	let handler: ((event: WeKnoraStreamEvent) => void) | null = null;
	let sessionSeq = 0;
	let messageSeq = 0;

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
			counters.ask.push(input);
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
			return { requestId: `r${counters.ask.length}`, sessionId };
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
		addSession: (session) => {
			state.sessions = [session, ...state.sessions];
		},
	};
}

function renderFlow(): void {
	render(
		<Provider store={createStore()}>
			<WeKnoraPage />
		</Provider>,
	);
}

async function configureAndWaitReady(): Promise<void> {
	// 本文件的假后端直接返回「已配置」，等智能体就绪即可提问。
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

/** 打开某个历史会话（点行即直接切换，不再弹替换确认）。 */
async function openSessionViaUi(nav: HTMLElement, name: RegExp | string): Promise<void> {
	const user = userEvent.setup();
	await user.click(within(nav).getByRole("button", { name }));
	await act(async () => {
		await Promise.resolve();
	});
}

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

describe("智能客服 · 后台思考（D 组用户流程）", () => {
	it("切走后后台继续累积；回切立即见已累积部分并继续实时追加，不重新拉取（AC-16/17）", async () => {
		const harness = installFake();
		renderFlow();
		await configureAndWaitReady();

		// 会话 A：提问并收到两片。
		await askViaUi("一问");
		act(() => harness.emit({ type: "turn.started", requestId: "r1", sessionId: "s1" }));
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲1" }));
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲2" }));
		expect(screen.getByText("甲1甲2")).toBeTruthy();

		// 切到新对话 → 会话 B 提问（A 不因切换中断，B 也不被 A 阻塞）。
		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: "新建对话" }));
		await askViaUi("二问");
		act(() => harness.emit({ type: "answer.delta", requestId: "r2", text: "乙1" }));
		expect(screen.getByText("乙1")).toBeTruthy();

		// A 在后台继续出片：不落到当前视图（防串台），但缓冲在累积。
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲3" }));
		expect(screen.queryByText(/甲1甲2甲3/)).toBeNull();

		// 回切 A：已累积部分立即可见，且不重新发起消息请求。
		const nav = screen.getByRole("navigation", { name: "历史会话" });
		const loadCallsBefore = harness.counters.loadMessages.length;
		await openSessionViaUi(nav, /会话 s1/);
		expect(screen.getByText("甲1甲2甲3")).toBeTruthy();
		expect(harness.counters.loadMessages.length).toBe(loadCallsBefore);

		// 后续分片继续实时追加（不重播、不重新请求）。
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲4" }));
		expect(screen.getByText("甲1甲2甲3甲4")).toBeTruthy();
	});

	it("并发两路各自收敛互不串台；后台终态后回切走服务端事实（AC-16/18）", async () => {
		const harness = installFake();
		renderFlow();
		await configureAndWaitReady();

		await askViaUi("一问");
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲" }));
		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: "新建对话" }));
		// A 还在流式中，新对话仍可提问（canAsk 不因 A 的后台流而禁用，AC-18）。
		await askViaUi("二问");
		expect(harness.counters.ask.length).toBe(2);
		act(() => harness.emit({ type: "answer.delta", requestId: "r2", text: "乙" }));

		// A 在后台到达终态：当前视图（B）不受任何影响、无弹窗。
		act(() => harness.emit({ type: "turn.completed", requestId: "r1" }));
		expect(screen.getByText("乙")).toBeTruthy();
		expect(screen.queryByRole("dialog")).toBeNull();

		// B 也终态后回切 A：缓冲已释放，走 fetch，显示服务端持久化的事实。
		act(() => harness.emit({ type: "turn.completed", requestId: "r2" }));
		const nav = screen.getByRole("navigation", { name: "历史会话" });
		await openSessionViaUi(nav, /会话 s1/);
		await waitFor(() => expect(harness.counters.loadMessages).toContain("s1"));
		expect(screen.getByText("对「一问」的回答")).toBeTruthy();
		expect(screen.queryByText(/甲/)).toBeNull();
	});

	it("取消只作用于当前会话的流；后台流不受影响，跑到自然终态（AC-21）", async () => {
		const harness = installFake();
		renderFlow();
		await configureAndWaitReady();

		await askViaUi("一问");
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲" }));
		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: "新建对话" }));
		await askViaUi("二问");
		act(() => harness.emit({ type: "answer.delta", requestId: "r2", text: "乙" }));

		// 当前会话（B）在流式：取消入口出现，点击只取消 r2。
		await user.click(screen.getByRole("button", { name: "取消" }));
		expect(harness.api.cancel).toHaveBeenCalledTimes(1);
		expect(harness.api.cancel).toHaveBeenCalledWith("r2");
		expect(screen.getByText("已取消")).toBeTruthy();

		// 取消后当前会话无流：取消入口消失，可继续提问。
		expect(screen.queryByRole("button", { name: "取消" })).toBeNull();

		// 后台流（A）不受影响：继续出片并最终自然收敛。
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲续" }));
		act(() => harness.emit({ type: "turn.completed", requestId: "r1" }));
		const nav = screen.getByRole("navigation", { name: "历史会话" });
		await openSessionViaUi(nav, /会话 s1/);
		await waitFor(() => expect(harness.counters.loadMessages).toContain("s1"));
	});

	it("后台终态仅静默重拉列表：多路几乎同时完成合并为一次请求，无弹窗（AC-20）", async () => {
		const harness = installFake();
		renderFlow();
		await configureAndWaitReady();

		// 两路先后起流（A 后台、B 当前），再切到新对话，两路都在后台。
		await askViaUi("一问");
		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: "新建对话" }));
		await askViaUi("二问");
		await user.click(screen.getByRole("button", { name: "新建对话" }));

		const baseline = harness.counters.listSessions;
		act(() => harness.emit({ type: "turn.completed", requestId: "r1" }));
		act(() => harness.emit({ type: "turn.completed", requestId: "r2" }));

		// 去抖窗口（500ms）后恰好合并为一次重拉。
		await waitFor(() => expect(harness.counters.listSessions).toBe(baseline + 1), { timeout: 4000 });
		await new Promise((resolve) => setTimeout(resolve, 800));
		expect(harness.counters.listSessions).toBe(baseline + 1);
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(screen.queryByRole("status")).toBeNull();
	});

	it("草稿期发起的 ask 在切走后落库：归后台不劫持新草稿，回切走列表与缓冲（假设 7）", async () => {
		const harness = installFake();
		let resolveAsk: ((value: { requestId: string; sessionId: string }) => void) | null = null;
		harness.api.ask = vi.fn(
			() =>
				new Promise((resolve) => {
					resolveAsk = resolve;
				}),
		) as unknown as WeKnoraApi["ask"];
		renderFlow();
		await configureAndWaitReady();

		// 草稿提问后、ask 返回前就切到新对话。
		await askViaUi("草稿问");
		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: "新建对话" }));
		expect(screen.queryByText("草稿问")).toBeNull();

		// ask 落库：会话进列表、流归后台，新草稿视图不被劫持。
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		await act(async () => {
			resolveAsk?.({ requestId: "r1", sessionId: "s1" });
			await Promise.resolve();
		});
		const nav = await screen.findByRole("navigation", { name: "历史会话" });
		await waitFor(() => expect(within(nav).getByText("会话 s1")).toBeTruthy());
		expect(screen.queryByText("草稿问")).toBeNull();

		// 回切：走活跃缓冲（不 fetch），草稿期的问题与已累积内容都在。
		const loadCallsBefore = harness.counters.loadMessages.length;
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "后台片" }));
		await openSessionViaUi(nav, /会话 s1/);
		expect(screen.getByText("草稿问")).toBeTruthy();
		expect(screen.getByText("后台片")).toBeTruthy();
		expect(harness.counters.loadMessages.length).toBe(loadCallsBefore);
	});

	it("ask 未决窗口到达的首片事件不丢：落定后回放可见（防御语义保持）", async () => {
		const harness = installFake();
		let resolveAsk: ((value: { requestId: string; sessionId: string }) => void) | null = null;
		harness.api.ask = vi.fn(
			() =>
				new Promise((resolve) => {
					resolveAsk = resolve;
				}),
		) as unknown as WeKnoraApi["ask"];
		renderFlow();
		await configureAndWaitReady();

		await askViaUi("首片测试");
		// ask 尚未返回、requestId 未知：事件先暂存。
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "首片" }));
		expect(screen.queryByText("首片")).toBeNull();

		await act(async () => {
			resolveAsk?.({ requestId: "r1", sessionId: "s1" });
			await Promise.resolve();
		});
		await waitFor(() => expect(screen.getByText("首片")).toBeTruthy());
	});

	it("历史行对思考中的会话（含后台）显示「思考中」，流到终态后消失，不误标其他行（AC-19）", async () => {
		const harness = installFake();
		renderFlow();
		await configureAndWaitReady();

		await askViaUi("一问");
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲" }));
		const nav = await screen.findByRole("navigation", { name: "历史会话" });
		await waitFor(() => expect(within(nav).getByRole("button", { name: /会话 s1/ })).toBeTruthy());

		// 当前会话流式中：行有指示。
		const row1 = within(nav).getByRole("button", { name: /会话 s1/ });
		expect(within(row1).getByText("思考中")).toBeTruthy();

		// 切到新对话再问一路：s1 转后台仍亮，s2 起流即亮。
		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: "新建对话" }));
		await askViaUi("二问");
		act(() => harness.emit({ type: "answer.delta", requestId: "r2", text: "乙" }));
		const row2 = await within(nav).findByRole("button", { name: /会话 s2/ });
		expect(within(row2).getByText("思考中")).toBeTruthy();
		expect(within(within(nav).getByRole("button", { name: /会话 s1/ })).getByText("思考中")).toBeTruthy();

		// s1 在后台到达终态：其行指示消失（无假活），s2 不受影响。
		act(() => harness.emit({ type: "turn.completed", requestId: "r1" }));
		await waitFor(() => {
			const settledRow1 = within(nav).getByRole("button", { name: /会话 s1/ });
			expect(within(settledRow1).queryByText("思考中")).toBeNull();
		});
		expect(within(within(nav).getByRole("button", { name: /会话 s2/ })).getByText("思考中")).toBeTruthy();

		// 取消当前会话（s2）的流：指示立即消失（无假活）。
		await user.click(screen.getByRole("button", { name: "取消" }));
		const settledRow2 = within(nav).getByRole("button", { name: /会话 s2/ });
		expect(within(settledRow2).queryByText("思考中")).toBeNull();
	});
});
