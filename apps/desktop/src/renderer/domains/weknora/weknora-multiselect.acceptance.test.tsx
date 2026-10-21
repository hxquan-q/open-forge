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
 * flow-tester 独立验收测试（weknora-session-management，AC-8 / AC-10）。
 *
 * 与实现者用例（weknora-multiselect-flow.test.tsx）的差异角度：
 * - AC-8 断言 `aria-pressed` 勾选态、退出后**行点击恢复为切换会话**（不是切换勾选）、
 *   「全选」**排除 streaming 会话**（可选集合的边界）。
 * - AC-10 建删除失败**原因矩阵**（network / unauthorized 两类文案各自映射），
 *   并断言取消时**零 IPC 调用**（deleteSession 未调用 + listSessions 计数不变）。
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

interface FakeHarness {
	api: WeKnoraApi;
	state: FakeState;
	counters: { listSessions: number; delete: string[]; loadMessages: string[] };
	emit: (event: WeKnoraStreamEvent) => void;
	addSession: (session: WeKnoraSession) => void;
}

function installFake(): FakeHarness {
	const state: FakeState = { sessions: [], messagesBySession: {} };
	const counters = { listSessions: 0, delete: [] as string[], loadMessages: [] as string[] };
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
		loadMessages: vi.fn(async ({ sessionId }: { sessionId: string }) => {
			counters.loadMessages.push(sessionId);
			return state.messagesBySession[sessionId] ?? [];
		}),
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
					{ id: sessionId, title: `会话 ${sessionId}`, updated_at: `2026-10-1${sessionSeq}T09:00:00` },
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

async function rightClickSession(nav: HTMLElement, name: RegExp | string): Promise<void> {
	fireEvent.contextMenu(within(nav).getByRole("button", { name }), { clientX: 12, clientY: 12 });
	await screen.findByRole("menu");
}

async function enterMultiSelect(nav: HTMLElement, name: RegExp | string): Promise<void> {
	await rightClickSession(nav, name);
	fireEvent.click(screen.getByRole("menuitem", { name: "多选" }));
	await screen.findByRole("button", { name: "批量删除" });
}

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

describe("AC-8 · 多选模式", () => {
	it("进入后操作条取代「新建对话」；勾选切换 aria-pressed 且计数递增 / 递减", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		harness.addSession({ id: "s2", title: "会话 s2", updated_at: "2026-10-19T08:00:00" });
		renderFlow();
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });

		await enterMultiSelect(nav, /会话 s1/);
		expect(screen.queryByRole("button", { name: "新建对话" })).toBeNull();
		expect(screen.getByText("已选 0")).toBeTruthy();

		const row = within(nav).getByRole("button", { name: /会话 s1/ });
		fireEvent.click(row);
		expect(screen.getByText("已选 1")).toBeTruthy();
		expect(row.getAttribute("aria-pressed")).toBe("true");

		fireEvent.click(row);
		expect(screen.getByText("已选 0")).toBeTruthy();
		expect(row.getAttribute("aria-pressed")).toBe("false");
	});

	it("Esc 退出后行点击恢复为「切换会话」（不再切换勾选）", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		harness.state.messagesBySession.s1 = [wireMessage("u1", "user", "历史问")];
		renderFlow();
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });

		await enterMultiSelect(nav, /会话 s1/);
		fireEvent.keyDown(document.body, { key: "Escape" });
		await waitFor(() => expect(screen.getByRole("button", { name: "新建对话" })).toBeTruthy());

		fireEvent.click(within(nav).getByRole("button", { name: /会话 s1/ }));
		await waitFor(() => expect(harness.counters.loadMessages).toContain("s1"));
	});

	it("「全选」只选可选集合：streaming 中的会话被排除（AC-10 同源）", async () => {
		const harness = installFake();
		harness.addSession({ id: "s2", title: "会话 s2", updated_at: "2026-10-19T08:00:00" });
		renderFlow();
		await configureAndWaitReady();

		// s1 进入流式（含后台流）。
		await askViaUi("一问");
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲" }));
		const nav = await screen.findByRole("navigation", { name: "历史会话" });
		await within(nav).findByRole("button", { name: /会话 s2/ });

		await enterMultiSelect(nav, /会话 s2/);
		fireEvent.click(screen.getByRole("button", { name: "全选" }));

		// 仅 s2 可选（s1 在流式中）。
		expect(screen.getByText("已选 1")).toBeTruthy();
		expect((within(nav).getByRole("button", { name: /会话 s1/ }) as HTMLButtonElement).disabled).toBe(true);
	});

	it("「取消」按钮退出多选模式", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		renderFlow();
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });

		await enterMultiSelect(nav, /会话 s1/);
		fireEvent.click(screen.getByRole("button", { name: "取消" }));
		await waitFor(() => expect(screen.queryByRole("button", { name: "批量删除" })).toBeNull());
		expect(screen.getByRole("button", { name: "新建对话" })).toBeTruthy();
	});
});

describe("AC-10 · 批量删除", () => {
	it("确认弹窗含数量与「不可恢复」；取消零 IPC 调用、选择保留", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		harness.addSession({ id: "s2", title: "会话 s2", updated_at: "2026-10-19T08:00:00" });
		renderFlow();
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });
		const baseline = harness.counters.listSessions;

		await enterMultiSelect(nav, /会话 s1/);
		fireEvent.click(within(nav).getByRole("button", { name: /会话 s1/ }));
		fireEvent.click(within(nav).getByRole("button", { name: /会话 s2/ }));
		fireEvent.click(screen.getByRole("button", { name: "批量删除" }));

		const dialog = await screen.findByRole("dialog");
		expect(within(dialog).getByText(/2/)).toBeTruthy();
		expect(within(dialog).getByText(/不可恢复/)).toBeTruthy();

		await userEvent.setup().click(within(dialog).getByRole("button", { name: "取消" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

		expect(harness.counters.delete).toHaveLength(0);
		expect(harness.counters.listSessions).toBe(baseline);
		expect(screen.getByText("已选 2")).toBeTruthy();
	});

	it("确认批量删除：真删所选 + 重拉列表 + 退出多选", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		harness.addSession({ id: "s2", title: "会话 s2", updated_at: "2026-10-19T08:00:00" });
		harness.addSession({ id: "s3", title: "会话 s3", updated_at: "2026-10-19T07:00:00" });
		renderFlow();
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });

		await enterMultiSelect(nav, /会话 s1/);
		fireEvent.click(within(nav).getByRole("button", { name: /会话 s1/ }));
		fireEvent.click(within(nav).getByRole("button", { name: /会话 s2/ }));
		fireEvent.click(screen.getByRole("button", { name: "批量删除" }));
		const dialog = await screen.findByRole("dialog");
		await userEvent.setup().click(within(dialog).getByRole("button", { name: "删除" }));

		const result = await screen.findByRole("dialog");
		expect(within(result).getByText(/成功删除 2 个会话/)).toBeTruthy();
		expect(harness.counters.delete).toEqual(["s1", "s2"]);

		await userEvent.setup().click(within(result).getByRole("button", { name: "关闭" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(within(nav).queryByRole("button", { name: /会话 s1/ })).toBeNull();
		expect(within(nav).getByRole("button", { name: /会话 s3/ })).toBeTruthy();
		expect(screen.getByRole("button", { name: "新建对话" })).toBeTruthy();
	});

	it("部分失败原因矩阵：network / unauthorized 各自映射，失败会话不被移除（D5）", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		harness.addSession({ id: "s2", title: "会话 s2", updated_at: "2026-10-19T08:00:00" });
		harness.addSession({ id: "s3", title: "会话 s3", updated_at: "2026-10-19T07:00:00" });
		harness.api.deleteSession = vi.fn(async ({ sessionId }: { sessionId: string }) => {
			harness.counters.delete.push(sessionId);
			if (sessionId === "s2") throw new Error("network");
			if (sessionId === "s3") throw new Error("unauthorized");
			harness.state.sessions = harness.state.sessions.filter((session) => session.id !== sessionId);
		}) as unknown as WeKnoraApi["deleteSession"];
		renderFlow();
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });

		await enterMultiSelect(nav, /会话 s1/);
		for (const name of [/会话 s1/, /会话 s2/, /会话 s3/]) {
			fireEvent.click(within(nav).getByRole("button", { name }));
		}
		fireEvent.click(screen.getByRole("button", { name: "批量删除" }));
		const dialog = await screen.findByRole("dialog");
		await userEvent.setup().click(within(dialog).getByRole("button", { name: "删除" }));

		const result = await screen.findByRole("dialog");
		expect(within(result).getByText(/成功删除 1 个会话/)).toBeTruthy();
		expect(within(result).getByText(/以下 2 个会话删除失败/)).toBeTruthy();
		expect(within(result).getByText(/网络不可达/)).toBeTruthy();
		expect(within(result).getByText(/API Key 无效或权限不足/)).toBeTruthy();

		await userEvent.setup().click(within(result).getByRole("button", { name: "关闭" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		// 失败的 s2 / s3 仍在列表，成功的 s1 已消失。
		expect(within(nav).queryByRole("button", { name: /会话 s1/ })).toBeNull();
		expect(within(nav).getByRole("button", { name: /会话 s2/ })).toBeTruthy();
		expect(within(nav).getByRole("button", { name: /会话 s3/ })).toBeTruthy();
	});

	it("streaming 中的会话在多选模式下禁选（行禁用）", async () => {
		const harness = installFake();
		harness.addSession({ id: "s2", title: "会话 s2", updated_at: "2026-10-19T08:00:00" });
		renderFlow();
		await configureAndWaitReady();

		await askViaUi("一问");
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲" }));
		const nav = await screen.findByRole("navigation", { name: "历史会话" });
		await within(nav).findByRole("button", { name: /会话 s2/ });

		await enterMultiSelect(nav, /会话 s2/);

		const streamingRow = within(nav).getByRole("button", { name: /会话 s1/ }) as HTMLButtonElement;
		expect(streamingRow.disabled).toBe(true);
		fireEvent.click(streamingRow);
		expect(screen.getByText("已选 0")).toBeTruthy();
	});
});
