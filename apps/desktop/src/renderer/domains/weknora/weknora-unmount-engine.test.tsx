// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import type { DesktopApi, WeKnoraAgent, WeKnoraMessage, WeKnoraPublicConfig, WeKnoraSession, WeKnoraStreamEvent } from "@preload/api";
import { i18n, initI18n } from "@shared/i18n";
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
	type WeKnoraChatMessage,
	weKnoraActiveRequestIdAtom,
	weKnoraMessagesAtom,
	weKnoraSessionBuffersAtom,
	weKnoraStreamRoutesAtom,
	weKnoraStreamingAtom,
} from "./atoms";

/**
 * CP3 复验（06-review-fixes ①）：**独立于实现者 `weknora-unmount-flow.test.tsx`** 的验证。
 *
 * 实现者用例的做法是「整页挂载 → 卸载 → 重挂 → 断言重挂后的 UI」。本文件走另一条路，
 * 在 **hook 层**直接读**模块级 atom**：断言「组件卸载期间（此刻没有任何订阅者/渲染者）
 * 引擎是否仍在把事件落进 `weKnoraSessionBuffersAtom` / `weKnoraStreamingAtom` /
 * `weKnoraActiveRequestIdAtom`」——这是 finding ① 的根因所在，也是实现者用例没直接断言的面
 * （他们只在重挂后看结果，看不到「卸载窗口内 atom 是否被写」）。
 *
 * 咬合验证：把引擎临时改回「effect 清理即退订 + 注销 WeakMap 条目」的旧行为后，
 * 本文件 5 条用例全部转红（见 05-tests.md「CP3 复验」节的咬合记录）；精确还原后全绿。
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
import { useWeKnoraChat } from "./hooks/useWeKnoraChat";

type WeKnoraApi = DesktopApi["weknora"];
type AtomStore = ReturnType<typeof createStore>;

/** 红线 C2：夹具不含任何 Key 字面量；`hasApiKey` 仅为布尔，真 Key 从不出现在测试里。 */
const CONFIGURED: WeKnoraPublicConfig = { baseUrl: "http://weknora.test:8083", defaultAgentId: "A", pageSize: 50, hasApiKey: true };

function agent(id: string): WeKnoraAgent {
	return { id, name: `Agent ${id}` };
}

function wireMessage(id: string, role: "user" | "assistant", content: string): WeKnoraMessage {
	return { id, role, content };
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function wrapperFor(store: AtomStore) {
	return function TestProvider({ children }: { children: ReactNode }): JSX.Element {
		return <Provider store={store}>{children}</Provider>;
	};
}

/** 最后一条 assistant 消息文本（回切/续接的观察点）。 */
function lastAssistantText(messages: readonly WeKnoraChatMessage[]): string | undefined {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message && message.role === "assistant") return message.text;
	}
	return undefined;
}

function lastAssistant(messages: readonly WeKnoraChatMessage[]): WeKnoraChatMessage | undefined {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message && message.role === "assistant") return message;
	}
	return undefined;
}

interface ChatCounters {
	loadSessions: number;
	fetchMessages: number;
}

interface ChatFake {
	api: WeKnoraApi;
	emit: (event: WeKnoraStreamEvent) => void;
	counters: ChatCounters;
}

/**
 * hook 层假后端：ask 返回递增 requestId（r1、r2…）与递增 sessionId（s1、s2…）；
 * onStreamEvent 捕获 handler，供测试手动 emit（模拟主进程转发）。
 */
function installChatFake(): ChatFake {
	const counters: ChatCounters = { loadSessions: 0, fetchMessages: 0 };
	let handler: ((event: WeKnoraStreamEvent) => void) | null = null;
	let askSeq = 0;
	const api: WeKnoraApi = {
		getConfig: vi.fn(async () => CONFIGURED),
		setConfig: vi.fn(async () => undefined),
		setApiKey: vi.fn(async () => undefined),
		listAgents: vi.fn(async () => [agent("A")]),
		listSessions: vi.fn(async () => []),
		loadMessages: vi.fn(async () => []),
		deleteSession: vi.fn(async () => undefined),
		getChunk: vi.fn(async () => ({ content: "chunk" })),
		getFile: vi.fn(async () => ({ dataUrl: "data:image/png;base64,", contentType: "image/png" })),
		ask: vi.fn(async () => {
			askSeq += 1;
			return { requestId: `r${askSeq}`, sessionId: `s${askSeq}` };
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
	return { api, counters, emit: (event) => handler?.(event) };
}

function chatDeps(counters: ChatCounters) {
	return {
		config: CONFIGURED,
		agents: [agent("A")] as readonly WeKnoraAgent[],
		agentsStatus: "ready" as const,
		selectedAgentId: "A",
		loadSessions: async (): Promise<void> => {
			counters.loadSessions += 1;
		},
		fetchMessages: async (): Promise<WeKnoraChatMessage[] | null> => {
			counters.fetchMessages += 1;
			return null;
		},
	};
}

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

describe("智能客服 · 卸载窗口的模块级流引擎（CP3 ① 复验 · hook 层）", () => {
	it("卸载期间分片仍进模块级缓冲；重挂数据完整并续接（AC-16/17）", async () => {
		const harness = installChatFake();
		const store = createStore();
		const deps = chatDeps(harness.counters);

		const first = renderHook(() => useWeKnoraChat(deps), { wrapper: wrapperFor(store) });
		await act(async () => {
			await first.result.current.send("一问");
		});
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲1" }));
		expect(lastAssistantText(first.result.current.messages)).toBe("甲1");

		// 离开 /weknora 路由：卸载。此刻**没有任何订阅者/渲染者**。
		first.unmount();

		// 卸载窗口内到达的分片：直接断言模块级 atom 被写（实现者用例看不到这一面）。
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲2" }));
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲3" }));
		expect(lastAssistant(store.get(weKnoraSessionBuffersAtom).s1)?.text).toBe("甲1甲2甲3");
		expect(lastAssistant(store.get(weKnoraMessagesAtom))?.text).toBe("甲1甲2甲3");

		// 回到路由：同一 store 重挂（归属表/缓冲是模块级 atom，跨挂载存活）。
		const second = renderHook(() => useWeKnoraChat(deps), { wrapper: wrapperFor(store) });
		expect(lastAssistantText(second.result.current.messages)).toBe("甲1甲2甲3");
		expect(second.result.current.isStreaming).toBe(true);

		// 后续分片继续实时追加；不重新拉取（AC-17：不重播、不重新请求）。
		const fetchBefore = harness.counters.fetchMessages;
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲4" }));
		expect(lastAssistantText(second.result.current.messages)).toBe("甲1甲2甲3甲4");
		expect(harness.counters.fetchMessages).toBe(fetchBefore);
	});

	it("卸载期间到终态：模块级缓冲/流身份在窗口内即收敛，重挂无假活、可提问（AC-19/10）", async () => {
		const harness = installChatFake();
		const store = createStore();
		const deps = chatDeps(harness.counters);

		const first = renderHook(() => useWeKnoraChat(deps), { wrapper: wrapperFor(store) });
		await act(async () => {
			await first.result.current.send("一问");
		});
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲" }));

		first.unmount();
		// 卸载窗口内到终态：引擎必须完成全部终态副作用（当前会话路径）。
		act(() => harness.emit({ type: "turn.completed", requestId: "r1" }));

		// 直接断言模块级 atom（窗口内，无任何渲染者）：
		expect(store.get(weKnoraSessionBuffersAtom).s1).toBeUndefined(); // 缓冲已释放（AC-19 指示源灭）
		expect(store.get(weKnoraStreamingAtom)).toBe(false); // 无 isStreaming 假活
		expect(store.get(weKnoraActiveRequestIdAtom)).toBeNull(); // 流身份已清（取消入口不残留）
		expect(store.get(weKnoraStreamRoutesAtom).r1).toBeUndefined(); // 归属已注销
		expect(lastAssistant(store.get(weKnoraMessagesAtom))?.status).toBe("complete"); // 完整回答未被误标中断

		// 重挂：无假活；AC-10 禁删判定源（streamingSessionIds）不含该会话；canAsk 恢复。
		const second = renderHook(() => useWeKnoraChat(deps), { wrapper: wrapperFor(store) });
		expect(second.result.current.isStreaming).toBe(false);
		expect(second.result.current.streamingSessionIds.has("s1")).toBe(false);
		expect(second.result.current.canAsk).toBe(true);
		expect(lastAssistant(second.result.current.messages)?.status).toBe("complete");
		expect(lastAssistantText(second.result.current.messages)).toBe("甲");
	});

	it("引擎幂等：多次挂载/卸载只订阅一次，且卸载窗口内事件仍被路由（AC-16/17）", async () => {
		const harness = installChatFake();
		const store = createStore();
		const deps = chatDeps(harness.counters);

		const first = renderHook(() => useWeKnoraChat(deps), { wrapper: wrapperFor(store) });
		await act(async () => {
			await first.result.current.send("一问");
		});
		first.unmount();
		const second = renderHook(() => useWeKnoraChat(deps), { wrapper: wrapperFor(store) });
		second.unmount();

		// 三次「进入 /weknora」周期（含两次卸载）后，仍只建立一条订阅。
		expect(harness.api.onStreamEvent).toHaveBeenCalledTimes(1);

		// 当前处于卸载状态：事件仍被路由（订阅不随卸载退订）。
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "离窗片" }));
		expect(lastAssistant(store.get(weKnoraSessionBuffersAtom).s1)?.text).toBe("离窗片");

		// 第三次进入：立即可见（回切以缓冲为视图）。
		const third = renderHook(() => useWeKnoraChat(deps), { wrapper: wrapperFor(store) });
		expect(lastAssistantText(third.result.current.messages)).toBe("离窗片");
		expect(harness.api.onStreamEvent).toHaveBeenCalledTimes(1);
	});

	it("卸载期间后台流终态仍触发一次去抖静默重拉（AC-20）", async () => {
		const harness = installChatFake();
		const store = createStore();
		const deps = chatDeps(harness.counters);

		const first = renderHook(() => useWeKnoraChat(deps), { wrapper: wrapperFor(store) });
		await act(async () => {
			await first.result.current.send("一问");
		});
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲" }));
		// 切到新对话：s1 转为后台流（当前缓冲键变成 draft:）。
		act(() => first.result.current.newConversation());
		first.unmount();

		const baseline = harness.counters.loadSessions;
		act(() => harness.emit({ type: "turn.completed", requestId: "r1" }));

		// 页面不在，引擎仍持有最近挂载注册的 loadSessions：去抖窗口后恰好一次。
		await waitFor(() => expect(harness.counters.loadSessions).toBe(baseline + 1), { timeout: 4000 });
		await sleep(800);
		expect(harness.counters.loadSessions).toBe(baseline + 1);
		// 终态处理本身不产生新订阅。
		expect(harness.api.onStreamEvent).toHaveBeenCalledTimes(1);
	});
});

/** 整页假后端（AC-10 端到端用）：ask 落库即建会话，事件手动 emit。 */
interface PageFake {
	api: WeKnoraApi;
	state: { sessions: WeKnoraSession[]; messagesBySession: Record<string, WeKnoraMessage[]> };
	counters: { ask: number };
	emit: (event: WeKnoraStreamEvent) => void;
}

function installPageFake(): PageFake {
	const state = { sessions: [] as WeKnoraSession[], messagesBySession: {} as Record<string, WeKnoraMessage[]> };
	const counters = { ask: 0 };
	let handler: ((event: WeKnoraStreamEvent) => void) | null = null;
	let sessionSeq = 0;
	let messageSeq = 0;
	const api: WeKnoraApi = {
		getConfig: vi.fn(async () => CONFIGURED),
		setConfig: vi.fn(async () => undefined),
		setApiKey: vi.fn(async () => undefined),
		listAgents: vi.fn(async () => [agent("A"), agent("B")]),
		listSessions: vi.fn(async () => [...state.sessions]),
		loadMessages: vi.fn(async ({ sessionId }) => state.messagesBySession[sessionId] ?? []),
		deleteSession: vi.fn(async () => undefined),
		getChunk: vi.fn(async () => ({ content: "chunk" })),
		getFile: vi.fn(async () => ({ dataUrl: "data:image/png;base64,", contentType: "image/png" })),
		ask: vi.fn(async (input) => {
			counters.ask += 1;
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
			return { requestId: `r${counters.ask}`, sessionId };
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

function renderPage(store: AtomStore) {
	return render(
		<Provider store={store}>
			<WeKnoraPage />
		</Provider>,
	);
}

describe("智能客服 · 卸载窗口到终态后的禁删与 canAsk（CP3 ① 复验 · 整页 AC-10）", () => {
	it("卸载期间当前会话到终态，重挂后行无「思考中」、右键删除可用、可继续提问", async () => {
		const harness = installPageFake();
		const store = createStore();
		const first = renderPage(store);
		await waitFor(() => expect(screen.getByRole("button", { name: "Agent A" })).toBeTruthy());

		const user = userEvent.setup();
		await user.type(screen.getByPlaceholderText("输入你的问题…"), "一问");
		await user.click(screen.getByRole("button", { name: "发送" }));
		await act(async () => {
			await Promise.resolve();
		});
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲" }));

		// 离开路由：整页卸载；卸载窗口内流到终态。
		first.unmount();
		act(() => harness.emit({ type: "turn.completed", requestId: "r1" }));

		// 回到路由：同一 store 重挂。
		renderPage(store);
		await waitFor(() => expect(screen.getByRole("button", { name: "Agent A" })).toBeTruthy());

		const nav = await screen.findByRole("navigation", { name: "历史会话" });
		const row = await within(nav).findByRole("button", { name: /会话 s1/ });
		// 无假活：行不再显示「思考中」。
		expect(within(row).queryByText("思考中")).toBeNull();

		// 禁删解除（AC-10）：右键菜单的「删除会话」可用（修复前永久灰显）。
		fireEvent.contextMenu(row, { clientX: 12, clientY: 12 });
		const menu = await screen.findByRole("menu");
		const deleteItem = within(menu).getByRole("menuitem", { name: "删除会话" }) as HTMLButtonElement;
		expect(deleteItem.disabled).toBe(false);
		fireEvent.keyDown(document.body, { key: "Escape" });
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());

		// canAsk 恢复：取消入口消失，追问可再次发出（完整回答仍在视图）。
		expect(screen.queryByRole("button", { name: "取消" })).toBeNull();
		expect(screen.getByText("甲")).toBeTruthy();
		await user.type(screen.getByPlaceholderText("输入你的问题…"), "追问");
		await user.click(screen.getByRole("button", { name: "发送" }));
		await act(async () => {
			await Promise.resolve();
		});
		expect(harness.counters.ask).toBe(2);
	});
});
