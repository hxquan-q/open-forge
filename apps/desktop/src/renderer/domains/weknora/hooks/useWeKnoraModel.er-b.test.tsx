// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import type { DesktopApi, WeKnoraAgent, WeKnoraMessage, WeKnoraSession, WeKnoraStreamEvent } from "@preload/api";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useWeKnoraModel } from "./useWeKnoraModel";

/**
 * 外部审查修复轮票 B（ER-B F5）的实现者用例：删除**在途**切会话的竞态。
 *
 * 缺陷：单删 / 批删完成后用闭包快照的 `chat.sessionId` 判定「删的是不是当前会话」；若删除在途时
 * 用户切到另一会话，返回后会 `newConversation()` 把**新打开的会话**清掉。修法：完成时从 store
 * 读**最新**当前会话 id（`readCurrentSessionId`）。本文件专压这条竞态 + 正常路径不回归。
 */

type WeKnoraApi = DesktopApi["weknora"];

const CONFIGURED = { baseUrl: "http://host:8083", defaultAgentId: "A", pageSize: 50, hasApiKey: true };

function agent(id: string): WeKnoraAgent {
	return { id, name: `Agent ${id}` };
}

function session(id: string, title: string): WeKnoraSession {
	return { id, title };
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
		listSessions: vi.fn(async () => [session("s1", "会话 s1"), session("s2", "会话 s2")]),
		loadMessages: vi.fn(async ({ sessionId }) =>
			sessionId === "s1" ? [message("a1", "user", "s1 的问")] : [message("b1", "user", "s2 的问")],
		),
		deleteSession: vi.fn(async () => undefined),
		getChunk: vi.fn(async () => ({ content: "chunk" })),
		getFile: vi.fn(async () => ({ dataUrl: "data:image/png;base64,", contentType: "image/png" })),
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

function wrapperFor(store: ReturnType<typeof createStore>) {
	return function TestProvider({ children }: { children: ReactNode }): JSX.Element {
		return <Provider store={store}>{children}</Provider>;
	};
}

async function renderReady() {
	const rendered = renderHook(() => useWeKnoraModel(), { wrapper: wrapperFor(createStore()) });
	await waitFor(() => expect(rendered.result.current.agentsStatus).toBe("ready"));
	return rendered;
}

/** 把 deleteSession 换成一个由测试手动放行的挂起 Promise（模拟删除在途）。 */
function installPendingDelete(api: WeKnoraApi): { release: () => void } {
	let release: (() => void) | null = null;
	api.deleteSession = vi.fn(
		() =>
			new Promise<void>((resolve) => {
				release = resolve;
			}),
	) as unknown as WeKnoraApi["deleteSession"];
	return { release: () => release?.() };
}

describe("useWeKnoraModel · 删除在途切会话竞态（ER-B F5）", () => {
	it("单删在途切到另一会话：删除返回后**新会话不被清空**", async () => {
		const { api } = installApi();
		const { result } = await renderReady();
		await act(async () => {
			await result.current.actions.openSession("s1");
		});
		expect(result.current.currentSessionId).toBe("s1");

		// 发起删除 s1（挂起），随后切到 s2。
		const pending = installPendingDelete(api);
		let deletePromise: Promise<boolean> | null = null;
		act(() => {
			deletePromise = result.current.actions.deleteSession("s1");
		});
		await act(async () => {
			await result.current.actions.openSession("s2");
		});
		expect(result.current.currentSessionId).toBe("s2");
		expect(result.current.messages.map((item) => item.text)).toEqual(["s2 的问"]);

		// 删除返回：不得把新打开的 s2 清成空态。
		await act(async () => {
			pending.release();
			await deletePromise;
		});
		expect(result.current.currentSessionId).toBe("s2");
		expect(result.current.messages.map((item) => item.text)).toEqual(["s2 的问"]);
	});

	it("批删在途切到另一会话：删除返回后**新会话不被清空**", async () => {
		const { api } = installApi();
		const { result } = await renderReady();
		await act(async () => {
			await result.current.actions.openSession("s1");
		});
		expect(result.current.currentSessionId).toBe("s1");

		const pending = installPendingDelete(api);
		let batchPromise: Promise<unknown> | null = null;
		act(() => {
			batchPromise = result.current.actions.deleteSessions(["s1"]);
		});
		await act(async () => {
			await result.current.actions.openSession("s2");
		});
		expect(result.current.currentSessionId).toBe("s2");

		await act(async () => {
			pending.release();
			await batchPromise;
		});
		expect(result.current.currentSessionId).toBe("s2");
		expect(result.current.messages.map((item) => item.text)).toEqual(["s2 的问"]);
	});

	it("正常路径不变：删的是当前会话 → 回「新对话」空态（单删）", async () => {
		const { api } = installApi();
		const { result } = await renderReady();
		await act(async () => {
			await result.current.actions.openSession("s1");
		});
		expect(result.current.currentSessionId).toBe("s1");

		await act(async () => {
			await result.current.actions.deleteSession("s1");
		});
		expect(api.deleteSession).toHaveBeenCalledWith({ sessionId: "s1" });
		expect(result.current.currentSessionId).toBeNull();
		expect(result.current.messages).toEqual([]);
	});

	it("正常路径不变：删的是当前会话 → 回「新对话」空态（批删）", async () => {
		const { api } = installApi();
		const { result } = await renderReady();
		await act(async () => {
			await result.current.actions.openSession("s1");
		});
		expect(result.current.currentSessionId).toBe("s1");

		await act(async () => {
			await result.current.actions.deleteSessions(["s1"]);
		});
		expect(api.deleteSession).toHaveBeenCalledWith({ sessionId: "s1" });
		expect(result.current.currentSessionId).toBeNull();
		expect(result.current.messages).toEqual([]);
	});

	it("正常路径不变：批删未含当前会话 → 当前会话原样保留", async () => {
		const { api } = installApi();
		const { result } = await renderReady();
		await act(async () => {
			await result.current.actions.openSession("s2");
		});
		expect(result.current.currentSessionId).toBe("s2");

		await act(async () => {
			await result.current.actions.deleteSessions(["s1"]);
		});
		expect(api.deleteSession).toHaveBeenCalledWith({ sessionId: "s1" });
		expect(result.current.currentSessionId).toBe("s2");
		expect(result.current.messages.map((item) => item.text)).toEqual(["s2 的问"]);
	});
});
