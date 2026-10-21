// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import type { DesktopApi, WeKnoraAgent, WeKnoraMessage, WeKnoraSession, WeKnoraStreamEvent } from "@preload/api";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useWeKnoraModel } from "./useWeKnoraModel";

/**
 * ER 轮独立复验（F5：删除在途切会话竞态）。
 *
 * 独立角度（不照抄实现者用例）：用**三个会话**的不同拓扑压「完成后读最新当前会话 id」这条修复。
 * - 单删在途切到**另一会话**：新会话不被清空，且列表重拉照常发生；
 * - **批删含当前会话**在途切到第三个会话：第三个会话不被清空；
 * - 正常路径回归：删的正是当前会话 → 回空态；批删未含当前会话 → 当前会话原样保留。
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

function installApi(): { api: WeKnoraApi; emit: (event: WeKnoraStreamEvent) => void } {
	let handler: ((event: WeKnoraStreamEvent) => void) | null = null;
	const api: WeKnoraApi = {
		getConfig: vi.fn(async () => CONFIGURED),
		setConfig: vi.fn(async () => undefined),
		setApiKey: vi.fn(async () => undefined),
		listAgents: vi.fn(async () => [agent("A"), agent("B")]),
		listSessions: vi.fn(async () => [session("s1", "会话 s1"), session("s2", "会话 s2"), session("s3", "会话 s3")]),
		loadMessages: vi.fn(async ({ sessionId }: { sessionId: string }) => [message(`${sessionId}-u`, "user", `${sessionId} 的问`)]),
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

/**
 * 把 deleteSession 换成「闸门」：放行前所有调用挂起；一旦放行，当前与后续调用立即 resolve。
 *
 * 批删会**串行**多次调用 deleteSession（s1 完成才轮到 s2），故不能只放行一个 Promise ——
 * 那样第二个调用会永远挂起。闸门保证「放行一次，整批都过」。
 */
function installPendingDelete(api: WeKnoraApi): { release: () => void } {
	let open = false;
	const waiters: Array<() => void> = [];
	api.deleteSession = vi.fn(
		() =>
			new Promise<void>((resolve) => {
				if (open) resolve();
				else waiters.push(resolve);
			}),
	) as unknown as WeKnoraApi["deleteSession"];
	return {
		release: () => {
			open = true;
			for (const resolve of waiters.splice(0)) resolve();
		},
	};
}

describe("useWeKnoraModel 删除在途竞态 · ER 独立复验（F5）", () => {
	it("单删在途切到另一会话：返回后新会话不被清空，且列表重拉照常发生", async () => {
		const { api } = installApi();
		const { result } = await renderReady();
		await act(async () => {
			await result.current.actions.openSession("s1");
		});
		expect(result.current.currentSessionId).toBe("s1");
		const listCallsBefore = (api.listSessions as ReturnType<typeof vi.fn>).mock.calls.length;

		const pending = installPendingDelete(api);
		let deletePromise: Promise<boolean> | null = null;
		act(() => {
			deletePromise = result.current.actions.deleteSession("s1");
		});
		await act(async () => {
			await result.current.actions.openSession("s2");
		});
		expect(result.current.currentSessionId).toBe("s2");
		expect(result.current.messages.map((m) => m.text)).toEqual(["s2 的问"]);

		await act(async () => {
			pending.release();
			await deletePromise;
		});
		// 新会话 s2 原样保留。
		expect(result.current.currentSessionId).toBe("s2");
		expect(result.current.messages.map((m) => m.text)).toEqual(["s2 的问"]);
		// 列表重拉照常（修复未跳过刷新）。
		expect((api.listSessions as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(listCallsBefore);
	});

	it("批删（含当前会话）在途切到第三个会话：返回后第三个会话不被清空", async () => {
		const { api } = installApi();
		const { result } = await renderReady();
		await act(async () => {
			await result.current.actions.openSession("s1");
		});
		expect(result.current.currentSessionId).toBe("s1");

		const pending = installPendingDelete(api);
		let batchPromise: Promise<unknown> | null = null;
		act(() => {
			batchPromise = result.current.actions.deleteSessions(["s1", "s2"]);
		});
		await act(async () => {
			await result.current.actions.openSession("s3");
		});
		expect(result.current.currentSessionId).toBe("s3");
		expect(result.current.messages.map((m) => m.text)).toEqual(["s3 的问"]);

		await act(async () => {
			pending.release();
			await batchPromise;
		});
		// 当前会话 s3 不在被删集合里 → 原样保留（不能被闭包快照的 s1 误清）。
		expect(result.current.currentSessionId).toBe("s3");
		expect(result.current.messages.map((m) => m.text)).toEqual(["s3 的问"]);
	});

	it("正常路径回归：删的正是当前会话 → 回「新对话」空态（单删）", async () => {
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

	it("正常路径回归：批删未含当前会话 → 当前会话原样保留", async () => {
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
		expect(result.current.messages.map((m) => m.text)).toEqual(["s2 的问"]);
	});
});
