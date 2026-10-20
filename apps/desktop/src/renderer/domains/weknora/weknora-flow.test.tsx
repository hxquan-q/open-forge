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
 * 跨组件「用户流程」用例（本文件的核心价值）。
 *
 * 教训来源：用户在实机使用中发现「历史列表不显示」，而当时全部函数级用例全绿 —— 因为那些用例
 * 测不出「该调用的地方没调用」这类**流程缺陷**。本文件沿真实用户路径把整个页面串起来，每一步都
 * 断言**结果**（而非「点击成功」）。
 */

const selectBridge = vi.hoisted(() => ({ onValueChange: null as ((value: string) => void) | null }));

vi.mock("@shared/components/RendererMarkdownContent", () => ({
	RendererMarkdownContent: ({ text }: { text: string }) => <div data-testid="weknora-markdown">{text}</div>,
}));

vi.mock("@shared/components/ui/select", () => ({
	Select: ({ children, onValueChange }: { children: ReactNode; onValueChange?: (value: string) => void }) => {
		selectBridge.onValueChange = onValueChange ?? null;
		return <div>{children}</div>;
	},
	SelectTrigger: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => (
		<div {...props}>{children}</div>
	),
	SelectValue: () => <span />,
	SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
		<button type="button" data-value={value} onClick={() => selectBridge.onValueChange?.(value)}>
			{children}
		</button>
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
	config: { baseUrl: string; defaultAgentId: string; pageSize: number };
	hasApiKey: boolean;
	sessions: WeKnoraSession[];
	messagesBySession: Record<string, WeKnoraMessage[]>;
}

interface FakeCounters {
	listAgents: number;
	listSessions: number;
	loadMessages: string[];
	ask: Array<{ query: string; sessionId?: string; agentId?: string }>;
	/** 因「新对话」而真正新建的 WeKnora 会话数。 */
	created: number;
}

interface FakeHarness {
	api: WeKnoraApi;
	state: FakeState;
	counters: FakeCounters;
	emit: (event: WeKnoraStreamEvent) => void;
}

/**
 * 有状态的假后端：会话列表 / 会话消息随提问增长，模拟真实 WeKnora 的持久化，
 * 从而让「刷新是否真的把新会话带回来」这类流程断言有意义。
 */
function installFake(): FakeHarness {
	const state: FakeState = {
		config: { baseUrl: "", defaultAgentId: "", pageSize: 50 },
		hasApiKey: false,
		sessions: [],
		messagesBySession: {},
	};
	const counters: FakeCounters = { listAgents: 0, listSessions: 0, loadMessages: [], ask: [], created: 0 };
	let handler: ((event: WeKnoraStreamEvent) => void) | null = null;
	let sessionSeq = 0;
	let messageSeq = 0;

	const api: WeKnoraApi = {
		getConfig: vi.fn(async () => ({ ...state.config, hasApiKey: state.hasApiKey })),
		setConfig: vi.fn(async (patch) => {
			state.config = { ...state.config, ...patch };
		}),
		setApiKey: vi.fn(async () => {
			state.hasApiKey = true;
		}),
		listAgents: vi.fn(async () => {
			counters.listAgents += 1;
			return [agent("A"), agent("B")];
		}),
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
				counters.created += 1;
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
	return { api, state, counters, emit: (event) => handler?.(event) };
}

function renderFlow(): void {
	render(
		<Provider store={createStore()}>
			<WeKnoraPage />
		</Provider>,
	);
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

describe("智能客服 · 用户流程（跨组件）", () => {
	it("配置 → 选智能体 → 提问 → 追问复用 → 新建对话刷新 → 历史确认/取消/载入", async () => {
		const harness = installFake();
		const user = userEvent.setup();
		renderFlow();

		// ① 打开页面（未配置）：中文引导，且一个网络请求都不发。
		await waitFor(() => expect(screen.getByText("尚未配置智能客服")).toBeTruthy());
		expect(harness.counters.listAgents).toBe(0);
		expect(harness.counters.listSessions).toBe(0);

		// ② 填 baseUrl + API Key 并保存 → 断言：配置就绪后【会话列表被拉取】（缺陷 1 回归）。
		await user.type(screen.getByPlaceholderText("http://host:port"), "http://host:8083");
		await user.type(screen.getByPlaceholderText("输入租户 API Key"), FAKE_API_KEY);
		await user.click(screen.getByRole("button", { name: "保存" }));

		await waitFor(() => expect(harness.counters.listSessions).toBeGreaterThanOrEqual(1));
		expect(harness.counters.listAgents).toBeGreaterThanOrEqual(1);

		// ③ 空列表时点「刷新」→ 断言：重新拉取。（第 9 步放在列表确实为空的时刻 ——
		//    后面一旦提问就会新建会话，列表不再为空，无法在流程末尾复现空态。）
		const nav = await screen.findByRole("navigation", { name: "历史会话" });
		await waitFor(() => expect(within(nav).getByText("暂无历史会话")).toBeTruthy());
		const beforeRefresh = harness.counters.listSessions;
		await user.click(within(nav).getByRole("button", { name: "刷新" }));
		await waitFor(() => expect(harness.counters.listSessions).toBe(beforeRefresh + 1));

		// ④ 选智能体 B → 提问 → 断言：流式文本出现、回答完成、思考区收拢。
		await waitFor(() => expect(screen.getByRole("button", { name: "Agent B" })).toBeTruthy());
		await user.click(screen.getByRole("button", { name: "Agent B" }));

		await askViaUi("第一问");
		expect(harness.counters.ask[0]).toEqual({ query: "第一问", agentId: "B" }); // 新对话：不带 sessionId
		expect(harness.counters.created).toBe(1);

		act(() => harness.emit({ type: "turn.started", requestId: "r1", sessionId: "s1" }));
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "我先查一下。" }));
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "这是正式回答。" }));
		// 流式期间：文本即时可见（此时暂存在思考区）。
		expect(screen.getByText("我先查一下。这是正式回答。")).toBeTruthy();

		act(() =>
			harness.emit({ type: "answer.promoted", requestId: "r1", promotedLength: "这是正式回答。".length }),
		);
		act(() => harness.emit({ type: "turn.completed", requestId: "r1" }));

		// 完成后：思考区收拢（旁白不可见），正式回答铺开。
		await waitFor(() => expect(screen.getByTestId("weknora-markdown").textContent).toBe("这是正式回答。"));
		expect(screen.queryByText("我先查一下。")).toBeNull();

		// ⑤ 再提问 → 断言：复用同一会话，不重复建会话。
		await askViaUi("第二问");
		expect(harness.counters.ask[1]).toEqual({ query: "第二问", sessionId: "s1", agentId: "B" });
		expect(harness.counters.created).toBe(1);
		act(() => harness.emit({ type: "turn.completed", requestId: "r2" }));

		// ⑥ 点「新建对话」→ 再提问 → 断言：新建会话后【列表被刷新】。
		const listCallsBeforeNew = harness.counters.listSessions;
		await user.click(screen.getByRole("button", { name: "新建对话" }));
		await askViaUi("第三问");
		expect(harness.counters.created).toBe(2);
		await waitFor(() => expect(harness.counters.listSessions).toBeGreaterThan(listCallsBeforeNew));
		act(() => harness.emit({ type: "turn.completed", requestId: "r3" }));
		await waitFor(() => expect(within(nav).getAllByRole("listitem").length).toBe(2));

		// ⑦ 点左栏某个历史对话 → 断言：先弹确认。
		await user.click(within(nav).getByRole("button", { name: /会话 s1/ }));
		const dialog = await screen.findByRole("dialog");
		expect(within(dialog).getByText(/当前对话将被替换/)).toBeTruthy();

		// ⑧ 取消确认 → 断言：什么都不变（不载入、不切换、消息不变）。
		const loadCallsBeforeCancel = harness.counters.loadMessages.length;
		await user.click(within(dialog).getByRole("button", { name: "取消" }));
		expect(harness.counters.loadMessages.length).toBe(loadCallsBeforeCancel);
		expect(screen.getByText("第三问")).toBeTruthy();

		// ⑨ 再点 → 确认 → 断言：载入消息且当前会话切过去。
		await user.click(within(nav).getByRole("button", { name: /会话 s1/ }));
		const dialog2 = await screen.findByRole("dialog");
		await user.click(within(dialog2).getByRole("button", { name: "替换当前对话" }));

		await waitFor(() => expect(harness.counters.loadMessages).toContain("s1"));
		await waitFor(() => expect(screen.getByText("第一问")).toBeTruthy());
		expect(screen.getByText("对「第一问」的回答")).toBeTruthy();
		expect(screen.queryByText("第三问")).toBeNull(); // 当前对话已被替换

		// 载入后追问接上该会话。
		await askViaUi("追问");
		expect(harness.counters.ask.at(-1)).toEqual({ query: "追问", sessionId: "s1", agentId: "B" });
		act(() => harness.emit({ type: "turn.completed", requestId: `r${harness.counters.ask.length}` }));
	});

	it("空历史列表：提供刷新入口，点击后重新拉取（AC-13 空态）", async () => {
		const harness = installFake();
		const user = userEvent.setup();
		renderFlow();

		await waitFor(() => expect(screen.getByText("尚未配置智能客服")).toBeTruthy());
		await user.type(screen.getByPlaceholderText("http://host:port"), "http://host:8083");
		await user.type(screen.getByPlaceholderText("输入租户 API Key"), FAKE_API_KEY);
		await user.click(screen.getByRole("button", { name: "保存" }));

		const nav = await screen.findByRole("navigation", { name: "历史会话" });
		await waitFor(() => expect(within(nav).getByText("暂无历史会话")).toBeTruthy());
		const before = harness.counters.listSessions;

		await user.click(within(nav).getByRole("button", { name: "刷新" }));

		await waitFor(() => expect(harness.counters.listSessions).toBe(before + 1));
	});
});
