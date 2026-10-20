// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import type { DesktopApi, WeKnoraAgent, WeKnoraMessage, WeKnoraSession, WeKnoraStreamEvent } from "@preload/api";
import { i18n, initI18n } from "@shared/i18n";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * 测试相位（flow-tester）新增的用户旅程用例 —— 独立于实现者用例设计，专攻既有用例没覆盖的角度：
 *
 * - 「A 生成中切 B → A 后台续跑 → 回切续显 → 后台完成列表**数据**刷新」一条线走完（上一 feature 的
 *   教训：函数级测试测不出「该调用的地方没调用」，这里每步都断言用户可见结果）；
 * - 删除当前会话后「与新建对话语义一致」的下游证据（再提问不带旧 sessionId）；
 * - 收起中的取消流 / AgentSelector / 设置面板（AC-5 的未覆盖半边）；
 * - 侧栏空白处右键无菜单（01-spec 假设 2）；
 * - 删除失败错误块随下一次删除开始而清除（AC-11 的跨会话半边）;
 * - en 语言下全链路文案真实渲染（AC-13 只既有键集一致性测试，没有消费侧证据）。
 *
 * 红线 C2：夹具不出现任何 Key 字面量（假后端只回 hasApiKey 标志，不携带 Key 本体），会话 id 均为假数据。
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
	ask: Array<{ query: string; sessionId?: string; agentId?: string }>;
}

interface FakeHarness {
	api: WeKnoraApi;
	state: FakeState;
	counters: FakeCounters;
	/** 跨方法调用序（如「删除发生在重拉之前」的顺序断言）。 */
	ops: string[];
	emit: (event: WeKnoraStreamEvent) => void;
	addSession: (session: WeKnoraSession) => void;
	/** 模拟服务端在会话完成时刷新其 updated_at（后台终态后列表静默更新的数据源）。 */
	bumpSessionTime: (sessionId: string, updated_at: string) => void;
}

function installFake(): FakeHarness {
	const state: FakeState = { sessions: [], messagesBySession: {} };
	const counters: FakeCounters = { listSessions: 0, loadMessages: [], ask: [] };
	const ops: string[] = [];
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
			ops.push("list");
			return [...state.sessions];
		}),
		loadMessages: vi.fn(async ({ sessionId }) => {
			counters.loadMessages.push(sessionId);
			return state.messagesBySession[sessionId] ?? [];
		}),
		deleteSession: vi.fn(async ({ sessionId }: { sessionId: string }) => {
			ops.push(`delete:${sessionId}`);
			state.sessions = state.sessions.filter((session) => session.id !== sessionId);
		}),
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
		ops,
		emit: (event) => handler?.(event),
		addSession: (session) => {
			state.sessions = [session, ...state.sessions];
		},
		bumpSessionTime: (sessionId, updated_at) => {
			state.sessions = state.sessions.map((session) =>
				session.id === sessionId ? { ...session, updated_at } : session,
			);
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

async function waitReady(): Promise<void> {
	await waitFor(() => expect(screen.getByRole("button", { name: "Agent A" })).toBeTruthy());
}

/** 语言参数化的提问助手（en 用例复用同一旅程骨架）。 */
async function askViaUi(text: string, labels: { placeholder: string; send: string }): Promise<void> {
	const user = userEvent.setup();
	await user.type(screen.getByPlaceholderText(labels.placeholder), text);
	await user.click(screen.getByRole("button", { name: labels.send }));
	await act(async () => {
		await Promise.resolve();
	});
}

const ZH_ASK = { placeholder: "输入你的问题…", send: "发送" };

/** 经确认弹窗打开某历史会话（点行 → 确认替换当前对话）。 */
async function openSessionViaUi(nav: HTMLElement, name: RegExp | string): Promise<void> {
	const user = userEvent.setup();
	await user.click(within(nav).getByRole("button", { name }));
	const dialog = await screen.findByRole("dialog");
	await user.click(within(dialog).getByRole("button", { name: "替换当前对话" }));
	await act(async () => {
		await Promise.resolve();
	});
}

/** 右键会话行弹出菜单。 */
async function rightClickSession(nav: HTMLElement, name: RegExp | string): Promise<void> {
	fireEvent.contextMenu(within(nav).getByRole("button", { name }), { clientX: 12, clientY: 12 });
	await screen.findByRole("menu");
}

/** 右键 → 菜单「删除会话」→ 确认弹窗（不点确认）。 */
async function openDeleteDialog(nav: HTMLElement): Promise<HTMLElement> {
	await rightClickSession(nav, /会话 s1/);
	fireEvent.click(screen.getByRole("menuitem", { name: "删除会话" }));
	return screen.findByRole("dialog");
}

/** 侧栏显隐开关（按当前态的可访问名称定位）。 */
function toggleButton(): HTMLButtonElement {
	return screen.getByRole("button", { name: /历史会话/ }) as HTMLButtonElement;
}

/** 收起状态落盘在 localStorage，测试间必须清掉。 */
afterEach(() => {
	localStorage.clear();
});

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

describe("智能客服 · 打磨三件套的用户旅程（测试相位补充）", () => {
	it("A 生成中切 B 提问 → A 后台续跑 → 回切续显 → 后台完成后列表数据刷新（AC-16/17/18/20/21）", async () => {
		const harness = installFake();
		renderFlow();
		await waitReady();

		// 会话 A 起流：两片可见。
		await askViaUi("一问", ZH_ASK);
		act(() => harness.emit({ type: "turn.started", requestId: "r1", sessionId: "s1" }));
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲1" }));
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲2" }));
		expect(screen.getByText("甲1甲2")).toBeTruthy();

		// 切到新对话：当前会话无流，取消入口不出现（AC-21 后半）。
		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: "新建对话" }));
		expect(screen.queryByRole("button", { name: "取消" })).toBeNull();

		// B 提问不受 A 后台流阻塞（canAsk，AC-18）。
		await askViaUi("二问", ZH_ASK);
		act(() => harness.emit({ type: "answer.delta", requestId: "r2", text: "乙1" }));
		expect(screen.getByText("乙1")).toBeTruthy();

		// A 在后台续跑：新片不落当前视图（防串台），但列表行仍标「思考中」（AC-16/19）。
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲3" }));
		expect(screen.queryByText(/甲1甲2甲3/)).toBeNull();
		const nav = screen.getByRole("navigation", { name: "历史会话" });
		const rowA = await within(nav).findByRole("button", { name: /会话 s1/ });
		expect(within(rowA).getByText("思考中")).toBeTruthy();

		// 回切 A：已累积部分立即可见，且不重新发起消息请求（AC-17）。
		const loadCallsBefore = harness.counters.loadMessages.length;
		await openSessionViaUi(nav, /会话 s1/);
		expect(screen.getByText("甲1甲2甲3")).toBeTruthy();
		expect(harness.counters.loadMessages.length).toBe(loadCallsBefore);

		// 后续分片实时追加；回切后取消入口恢复（当前会话又有流了，AC-21）。
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲4" }));
		expect(screen.getByText("甲1甲2甲3甲4")).toBeTruthy();
		expect(screen.getByRole("button", { name: "取消" })).toBeTruthy();

		// 再切走（A 回后台）；服务端在其完成时刷新时间戳。
		await user.click(screen.getByRole("button", { name: "新建对话" }));
		harness.bumpSessionTime("s1", "2026-10-19T11:30:00");
		const baseline = harness.counters.listSessions;
		act(() => harness.emit({ type: "turn.completed", requestId: "r1" }));

		// 后台终态：去抖窗口后恰好一次静默重拉；列表数据真实更新（行显示新时间、指示消失），无任何弹窗（AC-20）。
		await waitFor(() => expect(harness.counters.listSessions).toBe(baseline + 1), { timeout: 4000 });
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 800));
		});
		expect(harness.counters.listSessions).toBe(baseline + 1);
		const settledRow = within(nav).getByRole("button", { name: /会话 s1/ });
		expect(within(settledRow).queryByText("思考中")).toBeNull();
		expect(settledRow.textContent).toContain("2026-10-19 11:30");
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(screen.queryByRole("status")).toBeNull();
	});

	it("右键 → 确认 → 删除当前会话 → 聊天区回空态；再提问不带旧 sessionId（AC-7/8/9）", async () => {
		const harness = installFake();
		renderFlow();
		await waitReady();

		await askViaUi("一问", ZH_ASK);
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲" }));
		act(() => harness.emit({ type: "turn.completed", requestId: "r1" }));
		const nav = await screen.findByRole("navigation", { name: "历史会话" });
		await within(nav).findByRole("button", { name: /会话 s1/ });
		expect(screen.getByText("一问")).toBeTruthy();

		const dialog = await openDeleteDialog(nav);
		expect(within(dialog).getByText(/不可恢复/)).toBeTruthy();
		await userEvent.setup().click(within(dialog).getByRole("button", { name: "删除" }));

		// 删除成功：消息清空、指针置空（新对话空态），行消失。
		await waitFor(() => expect(screen.queryByText("一问")).toBeNull());
		await waitFor(() => expect(within(nav).queryByRole("button", { name: /会话 s1/ })).toBeNull());
		expect(screen.getByPlaceholderText("输入你的问题…")).toBeTruthy();

		// 顺序证据：删除发生在重拉之前（AC-8：从事实源刷新，不是本地过滤）。
		expect(harness.ops.lastIndexOf("list")).toBeGreaterThan(harness.ops.indexOf("delete:s1"));

		// 空态后继续提问：不带旧 sessionId（与「新建对话」语义一致的下游证据，AC-9）。
		await askViaUi("新问题", ZH_ASK);
		expect(harness.counters.ask.at(-1)).toEqual({ query: "新问题", agentId: "A" });
		await waitFor(() => expect(within(nav).getByRole("button", { name: /会话 s2/ })).toBeTruthy());
		expect(screen.getByText("新问题")).toBeTruthy();
	});

	it("流式中收起侧栏：AgentSelector / 设置面板 / 取消流照旧，展开后数据一致（AC-5）", async () => {
		const harness = installFake();
		renderFlow();
		await waitReady();

		await askViaUi("收起中的问题", ZH_ASK);
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "部分回答" }));

		await userEvent.setup().click(toggleButton());
		expect(screen.queryByRole("navigation", { name: "历史会话" })).toBeNull();

		// AgentSelector 在页头，收起后仍在（可换智能体）。
		expect(screen.getByRole("button", { name: "Agent B" })).toBeTruthy();

		// 设置面板照旧可开合。
		await userEvent.setup().click(screen.getByRole("button", { name: "设置" }));
		expect(screen.getByText("服务地址")).toBeTruthy();
		await userEvent.setup().click(screen.getByRole("button", { name: "收起设置" }));
		expect(screen.queryByText("服务地址")).toBeNull();

		// 取消流照旧：调 cancel(r1)，已收文本保留并标「已取消」。
		await userEvent.setup().click(screen.getByRole("button", { name: "取消" }));
		expect(harness.api.cancel).toHaveBeenCalledWith("r1");
		expect(screen.getByText("部分回答")).toBeTruthy();
		expect(screen.getByText("已取消")).toBeTruthy();

		// 展开后侧栏恢复且列表数据在。
		await userEvent.setup().click(toggleButton());
		const nav = screen.getByRole("navigation", { name: "历史会话" });
		expect(within(nav).getByRole("button", { name: /会话 s1/ })).toBeTruthy();
	});

	it("侧栏空白处右键不弹菜单；菜单只在会话行上出现（01-spec 假设 2 / AC-6）", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		renderFlow();
		await waitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });
		await within(nav).findByRole("button", { name: /会话 s1/ });

		fireEvent.contextMenu(nav, { clientX: 200, clientY: 200 });
		expect(screen.queryByRole("menu")).toBeNull();

		// 行上右键才有菜单（对照组）。
		await rightClickSession(nav, /会话 s1/);
		expect(screen.getByRole("menu")).toBeTruthy();
	});

	it("删除失败出内联错误；下一次（另一会话的）删除开始后错误块清除、失败目标行保留（AC-11）", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		harness.addSession({ id: "s2", title: "会话 s2", updated_at: "2026-10-19T10:00:00" });
		// s1 永远失败（本用例不重试它）；其余成功。
		harness.api.deleteSession = vi.fn(async ({ sessionId }: { sessionId: string }) => {
			harness.ops.push(`delete:${sessionId}`);
			if (sessionId === "s1") throw new Error("network");
			harness.state.sessions = harness.state.sessions.filter((session) => session.id !== sessionId);
		}) as unknown as WeKnoraApi["deleteSession"];
		renderFlow();
		await waitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });
		await within(nav).findByRole("button", { name: /会话 s1/ });

		// s1 删除失败：内联错误出现，弹窗保持（关掉以便后续右键）。
		const dialog = await openDeleteDialog(nav);
		await userEvent.setup().click(within(dialog).getByRole("button", { name: "删除" }));
		await waitFor(() => expect(screen.getByText(/删除失败/)).toBeTruthy());
		await userEvent.setup().click(within(screen.getByRole("dialog")).getByRole("button", { name: "取消" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(within(nav).getByRole("button", { name: /会话 s1/ })).toBeTruthy();

		// s2 删除成功：错误块与重试入口随新删除开始而消失，失败的 s1 行原样保留。
		await rightClickSession(nav, /会话 s2/);
		fireEvent.click(screen.getByRole("menuitem", { name: "删除会话" }));
		const dialog2 = await screen.findByRole("dialog");
		await userEvent.setup().click(within(dialog2).getByRole("button", { name: "删除" }));
		await waitFor(() => expect(within(nav).queryByRole("button", { name: /会话 s2/ })).toBeNull());
		await waitFor(() => expect(screen.queryByText(/删除失败/)).toBeNull());
		expect(screen.queryByRole("button", { name: "重试" })).toBeNull();
		expect(within(nav).getByRole("button", { name: /会话 s1/ })).toBeTruthy();
	});
});

describe("智能客服 · en 语言全链路文案（AC-13 消费侧证据）", () => {
	beforeAll(async () => {
		await i18n.changeLanguage("en");
	});

	afterAll(async () => {
		await i18n.changeLanguage("zh");
	});

	it("开关/思考中/禁删/菜单/确认弹窗/失败错误/重试全部取自 en 资源", async () => {
		const harness = installFake();
		harness.api.deleteSession = vi.fn(async () => {
			throw new Error("network");
		}) as unknown as WeKnoraApi["deleteSession"];
		renderFlow();
		await waitFor(() => expect(screen.getByRole("button", { name: "Agent A" })).toBeTruthy());

		// 开关：aria 名称与状态切换走 en。
		const toggle = screen.getByRole("button", { name: "Hide history" });
		expect(toggle.getAttribute("aria-expanded")).toBe("true");
		await userEvent.setup().click(toggle);
		expect(screen.queryByRole("navigation", { name: "History" })).toBeNull();
		const expandToggle = screen.getByRole("button", { name: "Show history" });
		expect(expandToggle.getAttribute("aria-expanded")).toBe("false");
		await userEvent.setup().click(expandToggle);
		const nav = screen.getByRole("navigation", { name: "History" });

		// 提问 → 当前行「Thinking」（含新建会话落列表后的行级指示）。
		await askViaUi("hello", { placeholder: "Ask a question…", send: "Send" });
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "partial" }));
		const row = await within(nav).findByRole("button", { name: /会话 s1/ });
		expect(within(row).getByText("Thinking")).toBeTruthy();

		// 流式中右键：禁删项的 en 文案与禁用态。
		fireEvent.contextMenu(row, { clientX: 10, clientY: 10 });
		const disabledItem = screen.getByRole("menuitem", { name: /still generating/ }) as HTMLButtonElement;
		expect(disabledItem.disabled).toBe(true);
		fireEvent.keyDown(document.body, { key: "Escape" });
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());

		// 取消当前流：消息标「Cancelled」，行指示消失。
		await userEvent.setup().click(screen.getByRole("button", { name: "Cancel" }));
		expect(screen.getByText("Cancelled")).toBeTruthy();
		await waitFor(() => {
			const settledRow = within(nav).getByRole("button", { name: /会话 s1/ });
			expect(within(settledRow).queryByText("Thinking")).toBeNull();
		});

		// 右键 → 菜单/确认弹窗 en 文案 → 删除失败：内联错误与 Retry 的 en 文案。
		fireEvent.contextMenu(within(nav).getByRole("button", { name: /会话 s1/ }), { clientX: 10, clientY: 10 });
		fireEvent.click(screen.getByRole("menuitem", { name: "Delete conversation" }));
		const dialog = await screen.findByRole("dialog");
		expect(within(dialog).getByText(/cannot be undone/)).toBeTruthy();
		await userEvent.setup().click(within(dialog).getByRole("button", { name: "Delete" }));
		await waitFor(() => expect(screen.getByText(/was not removed/)).toBeTruthy());
		// 弹窗开着时 radix 会把侧栏 aria-hidden（role 查询默认排除），关窗后再断言错误块。
		await userEvent.setup().click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
		expect(within(nav).getByRole("button", { name: /会话 s1/ })).toBeTruthy();
	});
});
