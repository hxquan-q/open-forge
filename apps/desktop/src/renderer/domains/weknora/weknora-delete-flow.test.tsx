// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { randomUUID } from "node:crypto";
import type { DesktopApi, WeKnoraAgent, WeKnoraMessage, WeKnoraSession, WeKnoraStreamEvent } from "@preload/api";
import { i18n, initI18n } from "@shared/i18n";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * B 组「右键删除历史会话」的用户流程级用例（AC-6~13，T02）。
 *
 * 沿 weknora-flow / weknora-background-flow 的路线：整页装配 + 有状态假后端，
 * 按真实用户路径（右键 → 菜单 → 确认 → 结果）断言可观察行为——「确认后该调的没调」
 * 「失败时列表假装删掉」这类流程缺陷在纯函数级测不出（R2 教训）。
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
	delete: string[];
}

interface FakeHarness {
	api: WeKnoraApi;
	state: FakeState;
	counters: FakeCounters;
	emit: (event: WeKnoraStreamEvent) => void;
	/** 手动把一个会话塞进服务端列表。 */
	addSession: (session: WeKnoraSession) => void;
}

/** 有状态的假后端（沿用 flow 测试形态）：删除成功即从服务端列表移除（重拉后消失）。 */
function installFake(): FakeHarness {
	const state: FakeState = { sessions: [], messagesBySession: {} };
	const counters: FakeCounters = { listSessions: 0, loadMessages: [], delete: [] };
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
		deleteSession: vi.fn(async ({ sessionId }: { sessionId: string }) => {
			counters.delete.push(sessionId);
			state.sessions = state.sessions.filter((session) => session.id !== sessionId);
		}),
		getChunk: vi.fn(async () => ({ content: "chunk" })),
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

/** 右键某条历史会话行，弹出上下文菜单（AC-6）。 */
async function rightClickSession(nav: HTMLElement, name: RegExp | string): Promise<void> {
	fireEvent.contextMenu(within(nav).getByRole("button", { name }), { clientX: 12, clientY: 12 });
	await screen.findByRole("menu");
}

/** 右键 → 菜单「删除会话」→ 确认弹窗（不点确认；返回弹窗供调用方断言/操作）。 */
async function openDeleteDialog(nav: HTMLElement, name: RegExp | string): Promise<HTMLElement> {
	await rightClickSession(nav, name);
	fireEvent.click(screen.getByRole("menuitem", { name: "删除会话" }));
	return screen.findByRole("dialog");
}

/** 等外点监听挂载（菜单延后一拍挂 mousedown，见 WeKnoraSessionContextMenu）。 */
async function tick(): Promise<void> {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

describe("智能客服 · 右键删除历史会话（B 组用户流程）", () => {
	it("右键弹菜单（仅「删除会话」一项）；Escape 与点击菜单外任意处关闭（AC-6）", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		renderFlow();
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });
		const row = await within(nav).findByRole("button", { name: /会话 s1/ });

		await rightClickSession(nav, /会话 s1/);
		const menu = screen.getByRole("menu");
		expect(within(menu).getAllByRole("menuitem")).toHaveLength(1);
		expect(within(menu).getByRole("menuitem", { name: "删除会话" })).toBeTruthy();

		// Escape 关闭。
		fireEvent.keyDown(document.body, { key: "Escape" });
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());

		// 再开，点菜单外任意处关闭。
		await rightClickSession(nav, /会话 s1/);
		await tick();
		fireEvent.mouseDown(document.body);
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
		expect(row).toBeTruthy();
	});

	it("确认弹窗注明不可恢复：取消零变更；确认后真删 + 从 WeKnora 重拉列表（AC-7/8）", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		renderFlow();
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });
		await within(nav).findByRole("button", { name: /会话 s1/ });
		const baseline = harness.counters.listSessions;

		// 取消：不删除、无任何状态变更。
		const dialog = await openDeleteDialog(nav, /会话 s1/);
		expect(within(dialog).getByText(/不可恢复/)).toBeTruthy();
		await userEvent.setup().click(within(dialog).getByRole("button", { name: "取消" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(harness.counters.delete).toHaveLength(0);
		expect(harness.counters.listSessions).toBe(baseline);
		expect(within(nav).getByRole("button", { name: /会话 s1/ })).toBeTruthy();

		// 确认：DELETE 请求发到服务端，成功后重拉列表，会话消失。
		const dialogAgain = await openDeleteDialog(nav, /会话 s1/);
		await userEvent.setup().click(within(dialogAgain).getByRole("button", { name: "删除" }));
		await waitFor(() => expect(within(nav).queryByRole("button", { name: /会话 s1/ })).toBeNull());
		expect(harness.api.deleteSession).toHaveBeenCalledWith({ sessionId: "s1" });
		expect(harness.counters.delete).toEqual(["s1"]);
		// 重拉发生在删除之后（AC-8：从 WeKnora 事实源刷新，不是本地过滤）。
		expect(harness.counters.listSessions).toBeGreaterThan(baseline);
	});

	it("删的是当前打开的会话：聊天区重置为「新对话」空态，消息清空（AC-9）", async () => {
		const harness = installFake();
		renderFlow();
		await configureAndWaitReady();

		await askViaUi("一问");
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲" }));
		act(() => harness.emit({ type: "turn.completed", requestId: "r1" }));
		const nav = await screen.findByRole("navigation", { name: "历史会话" });
		await within(nav).findByRole("button", { name: /会话 s1/ });
		expect(screen.getByText("一问")).toBeTruthy();

		const dialog = await openDeleteDialog(nav, /会话 s1/);
		await userEvent.setup().click(within(dialog).getByRole("button", { name: "删除" }));

		await waitFor(() => expect(screen.queryByText("一问")).toBeNull());
		await waitFor(() => expect(within(nav).queryByRole("button", { name: /会话 s1/ })).toBeNull());
		// 空态可继续提问（新对话语义）。
		expect(screen.getByPlaceholderText("输入你的问题…")).toBeTruthy();
		expect(harness.counters.delete).toEqual(["s1"]);
	});

	it("思考中的会话（含切走后的后台流）删除项禁用并说明原因；其他会话不受影响（AC-10）", async () => {
		const harness = installFake();
		// s2 是空闲的对照会话：先塞进服务端列表再渲染（挂载时的首次拉取即可见）。
		harness.addSession({ id: "s2", title: "会话 s2", updated_at: "2026-10-19T10:00:00" });
		renderFlow();
		await configureAndWaitReady();

		await askViaUi("一问");
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲" }));
		const nav = await screen.findByRole("navigation", { name: "历史会话" });
		await within(nav).findByRole("button", { name: /会话 s2/ });

		// 当前会话 s1 流式中：菜单项禁用，原因写在项上（照「运行中禁归档」先例），点击无效。
		await rightClickSession(nav, /会话 s1/);
		const disabledItem = screen.getByRole("menuitem", { name: /回答生成中/ }) as HTMLButtonElement;
		expect(disabledItem.disabled).toBe(true);
		fireEvent.click(disabledItem);
		expect(screen.queryByRole("dialog")).toBeNull();

		// 切到新对话：s1 转后台仍在思考，依旧禁删。
		await userEvent.setup().click(screen.getByRole("button", { name: "新建对话" }));
		await rightClickSession(nav, /会话 s1/);
		const backgroundItem = screen.getByRole("menuitem", { name: /回答生成中/ }) as HTMLButtonElement;
		expect(backgroundItem.disabled).toBe(true);

		// 其他会话（s2）不受影响：可正常发起删除。
		fireEvent.keyDown(document.body, { key: "Escape" });
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
		const dialog = await openDeleteDialog(nav, /会话 s2/);
		expect(within(dialog).getByRole("button", { name: "删除" })).toBeTruthy();
	});

	it("删除失败：会话行不被移除（不假装删掉），内联错误 + 重试成功后消失（AC-11）", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		let failFirstDelete = true;
		harness.api.deleteSession = vi.fn(async ({ sessionId }: { sessionId: string }) => {
			harness.counters.delete.push(sessionId);
			if (failFirstDelete) {
				failFirstDelete = false;
				throw new Error("network");
			}
			harness.state.sessions = harness.state.sessions.filter((session) => session.id !== sessionId);
		}) as unknown as WeKnoraApi["deleteSession"];
		renderFlow();
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });
		await within(nav).findByRole("button", { name: /会话 s1/ });

		const dialog = await openDeleteDialog(nav, /会话 s1/);
		await userEvent.setup().click(within(dialog).getByRole("button", { name: "删除" }));

		// 失败：弹窗保持打开（确认按钮恢复可用），内联错误出现。
		await waitFor(() => expect(screen.getByText(/删除失败/)).toBeTruthy());
		expect(screen.getByRole("dialog")).toBeTruthy();
		expect(within(screen.getByRole("dialog")).getByRole("button", { name: "删除" })).toBeTruthy();

		// 关掉弹窗再核对会话行：原样保留（列表绝不假装删掉）。注：弹窗开着时 radix 会把
		// 弹窗外子树 aria-hidden，role 查询默认排除，故行存在性在关窗后断言。
		await userEvent.setup().click(within(screen.getByRole("dialog")).getByRole("button", { name: "取消" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(within(nav).getByRole("button", { name: /会话 s1/ })).toBeTruthy();

		// 从内联错误块重试：这次成功，会话消失、错误块消失。
		await userEvent.setup().click(screen.getByRole("button", { name: "重试" }));
		await waitFor(() => expect(within(nav).queryByRole("button", { name: /会话 s1/ })).toBeNull());
		await waitFor(() => expect(screen.queryByText(/删除失败/)).toBeNull());
		expect(harness.counters.delete).toEqual(["s1", "s1"]);
	});

	it("请求进行中确认按钮防重复；失败后恢复可用（AC-12）", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		let rejectDelete: ((reason: Error) => void) | null = null;
		harness.api.deleteSession = vi.fn(
			({ sessionId }: { sessionId: string }) =>
				new Promise<void>((_resolve, reject) => {
					harness.counters.delete.push(sessionId);
					rejectDelete = reject;
				}),
		) as unknown as WeKnoraApi["deleteSession"];
		renderFlow();
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });

		const dialog = await openDeleteDialog(nav, /会话 s1/);
		await userEvent.setup().click(within(dialog).getByRole("button", { name: "删除" }));

		// 进行中：按钮转「删除中…」并禁用；连点不会再发请求。
		const busy = within(screen.getByRole("dialog")).getByRole("button", { name: "删除中…" }) as HTMLButtonElement;
		expect(busy.disabled).toBe(true);
		fireEvent.click(busy);
		await act(async () => {
			await Promise.resolve();
		});
		expect(harness.counters.delete).toEqual(["s1"]);

		// 失败：按钮恢复「删除」且可用（可再试或取消）。
		await act(async () => {
			rejectDelete?.(new Error("boom"));
			await Promise.resolve();
		});
		const restored = within(screen.getByRole("dialog")).getByRole("button", { name: "删除" }) as HTMLButtonElement;
		expect(restored.disabled).toBe(false);
		expect(harness.counters.delete).toEqual(["s1"]);
	});
});
