// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import type { DesktopApi, WeKnoraAgent, WeKnoraMessage, WeKnoraSession, WeKnoraStreamEvent } from "@preload/api";
import { i18n, initI18n } from "@shared/i18n";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * flow-tester 独立验收测试（weknora-session-management，AC-1）。
 *
 * 断言「点历史会话行**直接切换**、任何情况不再出现替换确认」在整页装配下成立，
 * 并覆盖 AC-1 后半句「loading 期间行为与现状一致」：行在载入期间禁用、载入完成后恢复。
 * 与实现者用例（WeKnoraPage.test.tsx）的差异角度：显式断言**载入期间行禁用**的时序。
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

interface Harness {
	api: WeKnoraApi;
	loadCalls: Array<{ sessionId: string; limit?: number; beforeTime?: string }>;
}

function installFake(overrides: Partial<WeKnoraApi> = {}): Harness {
	const loadCalls: Array<{ sessionId: string; limit?: number; beforeTime?: string }> = [];
	let handler: ((event: WeKnoraStreamEvent) => void) | null = null;
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
		listSessions: vi.fn(async () => [
			{ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" },
			{ id: "s2", title: "会话 s2", updated_at: "2026-10-19T08:00:00" },
		]),
		loadMessages: vi.fn(async (input: { sessionId: string; limit?: number; beforeTime?: string }) => {
			loadCalls.push(input);
			return [wireMessage("h1", "user", `历史问题 ${input.sessionId}`)];
		}),
		deleteSession: vi.fn(async () => undefined),
		getChunk: vi.fn(async () => ({ content: "chunk" })),
		getFile: vi.fn(async () => ({ dataUrl: "data:image/png;base64,", contentType: "image/png" })),
		ask: vi.fn(async () => ({ requestId: "r1", sessionId: "s1" })),
		cancel: vi.fn(async () => undefined),
		onStreamEvent: vi.fn((next) => {
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
	void handler;
	return { api, loadCalls };
}

function renderFlow(): void {
	render(
		<Provider store={createStore()}>
			<WeKnoraPage />
		</Provider>,
	);
}

async function waitReady(): Promise<HTMLElement> {
	await waitFor(() => expect(screen.getByRole("button", { name: "Agent A" })).toBeTruthy());
	return await screen.findByRole("navigation", { name: "历史会话" });
}

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

describe("AC-1 · 点历史会话直接切换", () => {
	it("点行立即调 load-messages 并切换内容，全程无替换确认弹窗", async () => {
		const harness = installFake();
		renderFlow();
		const nav = await waitReady();

		fireEvent.click(within(nav).getByRole("button", { name: /会话 s2/ }));

		await waitFor(() => expect(screen.getByText("历史问题 s2")).toBeTruthy());
		expect(harness.loadCalls).toEqual([{ sessionId: "s2", limit: 20 }]);
		// 任何时刻都不出现替换确认弹窗。
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(screen.queryByText(/替换/)).toBeNull();
	});

	it("载入期间该行禁用，载入完成后恢复可用（loading 行为与现状一致）", async () => {
		let release: (() => void) | null = null;
		const harness = installFake({
			loadMessages: vi.fn(async (input: { sessionId: string; limit?: number }) => {
				await new Promise<void>((resolve) => {
					release = resolve;
				});
				return [wireMessage("h1", "user", `历史问题 ${input.sessionId}`)];
			}) as unknown as WeKnoraApi["loadMessages"],
		});
		renderFlow();
		const nav = await waitReady();

		const row = within(nav).getByRole("button", { name: /会话 s2/ }) as HTMLButtonElement;
		fireEvent.click(row);

		// 载入中：行禁用。
		await waitFor(() => expect(row.disabled).toBe(true));
		expect(harness.api.loadMessages).toHaveBeenCalledWith({ sessionId: "s2", limit: 20 });

		await act(async () => {
			release?.();
			await Promise.resolve();
		});
		await waitFor(() => expect(screen.getByText("历史问题 s2")).toBeTruthy());
		expect(row.disabled).toBe(false);
	});
});
