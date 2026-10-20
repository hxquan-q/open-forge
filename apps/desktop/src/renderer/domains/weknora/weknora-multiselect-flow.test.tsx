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
 * T04 多选模式与批量删除的用户流程级用例（AC-8 / AC-10）。
 *
 * 沿 weknora-delete-flow 的路线：整页装配 + 有状态假后端，按真实用户路径
 * （右键 → 多选 → 勾选 → 批量删除 → 确认/取消 → 结果）断言可观察行为。
 * 「计数虚高」「失败会话被假装删掉」「streaming 会话可被勾选」这类缺陷只有流程级能测出。
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

/** 红线 C2：测试夹具不出现任何 Key 字面量，一律运行时生成。 */
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
	delete: string[];
}

interface FakeHarness {
	api: WeKnoraApi;
	state: FakeState;
	counters: FakeCounters;
	emit: (event: WeKnoraStreamEvent) => void;
	addSession: (session: WeKnoraSession) => void;
}

/** 有状态的假后端（沿用 flow 测试形态）：删除成功即从服务端列表移除（重拉后消失）。 */
function installFake(): FakeHarness {
	const state: FakeState = { sessions: [], messagesBySession: {} };
	const counters: FakeCounters = { listSessions: 0, delete: [] };
	let handler: ((event: WeKnoraStreamEvent) => void) | null = null;
	let sessionSeq = 0;
	let messageSeq = 0;
	let askSeq = 0;

	const api: WeKnoraApi = {
		getConfig: vi.fn(async () => ({
			baseUrl: "http://host:8083",
			defaultAgentId: "",
			pageSize: 50,
			hasApiKey: true,
		})),
		setConfig: vi.fn(async () => undefined),
		setApiKey: vi.fn(async () => undefined),
		listAgents: vi.fn(async () => [agent("A")]),
		listSessions: vi.fn(async () => {
			counters.listSessions += 1;
			return [...state.sessions];
		}),
		loadMessages: vi.fn(async ({ sessionId }) => state.messagesBySession[sessionId] ?? []),
		deleteSession: vi.fn(async ({ sessionId }: { sessionId: string }) => {
			counters.delete.push(sessionId);
			state.sessions = state.sessions.filter((session) => session.id !== sessionId);
		}),
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

/** 右键 → 菜单「多选」→ 进入多选模式。 */
async function enterMultiSelect(nav: HTMLElement, name: RegExp | string): Promise<void> {
	await rightClickSession(nav, name);
	fireEvent.click(screen.getByRole("menuitem", { name: "多选" }));
	await screen.findByRole("button", { name: "批量删除" });
}

/** 勾选某会话行（多选模式）。 */
function selectRow(nav: HTMLElement, name: RegExp | string): void {
	fireEvent.click(within(nav).getByRole("button", { name }));
}

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

describe("智能客服 · 多选模式与批量删除（T04 / AC-8 / AC-10）", () => {
	it("右键「多选」进入多选模式：操作条显示已选数，勾选后计数递增（AC-8）", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		harness.addSession({ id: "s2", title: "会话 s2", updated_at: "2026-10-19T08:00:00" });
		renderFlow();
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });

		await enterMultiSelect(nav, /会话 s1/);
		expect(screen.getByText("已选 0")).toBeTruthy();

		selectRow(nav, /会话 s1/);
		expect(screen.getByText("已选 1")).toBeTruthy();

		selectRow(nav, /会话 s2/);
		expect(screen.getByText("已选 2")).toBeTruthy();

		// 再点一次取消勾选。
		selectRow(nav, /会话 s2/);
		expect(screen.getByText("已选 1")).toBeTruthy();
	});

	it("全选勾选所有可选会话（AC-8）", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		harness.addSession({ id: "s2", title: "会话 s2", updated_at: "2026-10-19T08:00:00" });
		renderFlow();
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });

		await enterMultiSelect(nav, /会话 s1/);
		fireEvent.click(screen.getByRole("button", { name: "全选" }));
		expect(screen.getByText("已选 2")).toBeTruthy();
	});

	it("Esc 退出多选模式；「取消」按钮同样退出（AC-8）", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		renderFlow();
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });

		await enterMultiSelect(nav, /会话 s1/);
		selectRow(nav, /会话 s1/);
		expect(screen.getByText("已选 1")).toBeTruthy();

		fireEvent.keyDown(document.body, { key: "Escape" });
		await waitFor(() => expect(screen.queryByRole("button", { name: "批量删除" })).toBeNull());
		// 退出后恢复「新建对话」，行点击回到直接切换会话。
		expect(screen.getByRole("button", { name: "新建对话" })).toBeTruthy();

		// 再进一次，用「取消」退出。
		await enterMultiSelect(nav, /会话 s1/);
		fireEvent.click(screen.getByRole("button", { name: "取消" }));
		await waitFor(() => expect(screen.queryByRole("button", { name: "批量删除" })).toBeNull());
	});

	it("批量删除确认弹窗含数量与「不可恢复」；取消零变更（AC-10）", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		harness.addSession({ id: "s2", title: "会话 s2", updated_at: "2026-10-19T08:00:00" });
		renderFlow();
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });
		const baseline = harness.counters.listSessions;

		await enterMultiSelect(nav, /会话 s1/);
		selectRow(nav, /会话 s1/);
		selectRow(nav, /会话 s2/);
		fireEvent.click(screen.getByRole("button", { name: "批量删除" }));

		const dialog = await screen.findByRole("dialog");
		expect(within(dialog).getByText(/2/)).toBeTruthy();
		expect(within(dialog).getByText(/不可恢复/)).toBeTruthy();

		await userEvent.setup().click(within(dialog).getByRole("button", { name: "取消" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

		// 取消：零删除、零重拉，会话原样保留，仍停在多选模式（选择不丢）。
		expect(harness.counters.delete).toHaveLength(0);
		expect(harness.counters.listSessions).toBe(baseline);
		expect(within(nav).getByRole("button", { name: /会话 s1/ })).toBeTruthy();
		expect(within(nav).getByRole("button", { name: /会话 s2/ })).toBeTruthy();
		expect(screen.getByText("已选 2")).toBeTruthy();
	});

	it("确认批量删除：真删所选会话 + 重拉列表（AC-10）", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		harness.addSession({ id: "s2", title: "会话 s2", updated_at: "2026-10-19T08:00:00" });
		harness.addSession({ id: "s3", title: "会话 s3", updated_at: "2026-10-19T07:00:00" });
		renderFlow();
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });

		await enterMultiSelect(nav, /会话 s1/);
		selectRow(nav, /会话 s1/);
		selectRow(nav, /会话 s2/);
		fireEvent.click(screen.getByRole("button", { name: "批量删除" }));
		const dialog = await screen.findByRole("dialog");
		await userEvent.setup().click(within(dialog).getByRole("button", { name: "删除" }));

		// 结果弹窗：成功 2 个。
		const result = await screen.findByRole("dialog");
		expect(within(result).getByText(/成功删除 2 个会话/)).toBeTruthy();
		expect(harness.counters.delete).toEqual(["s1", "s2"]);

		await userEvent.setup().click(within(result).getByRole("button", { name: "关闭" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

		// 列表如实刷新：s1 / s2 消失，s3 保留；已退出多选模式。
		expect(within(nav).queryByRole("button", { name: /会话 s1/ })).toBeNull();
		expect(within(nav).queryByRole("button", { name: /会话 s2/ })).toBeNull();
		expect(within(nav).getByRole("button", { name: /会话 s3/ })).toBeTruthy();
		expect(screen.getByRole("button", { name: "新建对话" })).toBeTruthy();
	});

	it("部分失败：聚合「成功 N / 失败 M（名 + 错误）」且失败会话不被移除（AC-10 / D5）", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		harness.addSession({ id: "s2", title: "会话 s2", updated_at: "2026-10-19T08:00:00" });
		// s2 删除失败（network），s1 成功。
		harness.api.deleteSession = vi.fn(async ({ sessionId }: { sessionId: string }) => {
			harness.counters.delete.push(sessionId);
			if (sessionId === "s2") throw new Error("network");
			harness.state.sessions = harness.state.sessions.filter((session) => session.id !== sessionId);
		}) as unknown as WeKnoraApi["deleteSession"];
		renderFlow();
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });

		await enterMultiSelect(nav, /会话 s1/);
		selectRow(nav, /会话 s1/);
		selectRow(nav, /会话 s2/);
		fireEvent.click(screen.getByRole("button", { name: "批量删除" }));
		const dialog = await screen.findByRole("dialog");
		await userEvent.setup().click(within(dialog).getByRole("button", { name: "删除" }));

		const result = await screen.findByRole("dialog");
		expect(within(result).getByText(/成功删除 1 个会话/)).toBeTruthy();
		expect(within(result).getByText(/以下 1 个会话删除失败/)).toBeTruthy();
		// 失败明细带会话名 + 归一化错误文案（名 + 错误）。
		expect(within(result).getByText(/会话 s2/)).toBeTruthy();
		expect(within(result).getByText(/网络不可达/)).toBeTruthy();

		await userEvent.setup().click(within(result).getByRole("button", { name: "关闭" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

		// 失败的 s2 仍在列表（列表绝不假装删掉），成功的 s1 已消失。
		expect(within(nav).queryByRole("button", { name: /会话 s1/ })).toBeNull();
		expect(within(nav).getByRole("button", { name: /会话 s2/ })).toBeTruthy();
	});

	it("streaming 中的会话在多选模式下禁选（AC-10）", async () => {
		const harness = installFake();
		harness.addSession({ id: "s2", title: "会话 s2", updated_at: "2026-10-19T08:00:00" });
		renderFlow();
		await configureAndWaitReady();

		// s1 处于流式中（含后台流）：ask + delta 让它进入 streamingSessionIds。
		await askViaUi("一问");
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲" }));
		const nav = await screen.findByRole("navigation", { name: "历史会话" });
		await within(nav).findByRole("button", { name: /会话 s2/ });

		await enterMultiSelect(nav, /会话 s2/);

		const streamingRow = within(nav).getByRole("button", { name: /会话 s1/ }) as HTMLButtonElement;
		expect(streamingRow.disabled).toBe(true);
		fireEvent.click(streamingRow);
		expect(screen.getByText("已选 0")).toBeTruthy();

		// 非流式的 s2 可选。
		selectRow(nav, /会话 s2/);
		expect(screen.getByText("已选 1")).toBeTruthy();
	});
});
