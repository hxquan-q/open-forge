// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import type { DesktopApi, WeKnoraAgent, WeKnoraStreamEvent } from "@preload/api";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
	type WeKnoraChatMessage,
	weKnoraActiveRequestIdAtom,
	weKnoraMessagesAtom,
	weKnoraStreamingAtom,
} from "../atoms";
import { useWeKnoraModel } from "./useWeKnoraModel";

type WeKnoraApi = DesktopApi["weknora"];

const CONFIGURED = { baseUrl: "http://host:8083", defaultAgentId: "A", pageSize: 50, hasApiKey: true };

function agent(id: string): WeKnoraAgent {
	return { id, name: `Agent ${id}` };
}

function installApi(): { api: WeKnoraApi; emit: (event: WeKnoraStreamEvent) => void } {
	let handler: ((event: WeKnoraStreamEvent) => void) | null = null;
	const api: WeKnoraApi = {
		getConfig: vi.fn(async () => CONFIGURED),
		setConfig: vi.fn(async () => undefined),
		setApiKey: vi.fn(async () => undefined),
		listAgents: vi.fn(async () => [agent("A"), agent("B")]),
		listSessions: vi.fn(async () => []),
		loadMessages: vi.fn(async () => []),
		deleteSession: vi.fn(async () => undefined),
		getChunk: vi.fn(async () => ({ content: "chunk" })),
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

/**
 * ① 的验收判据（唯一的真 bug）：模拟「流式中 → 卸载 → 重新挂载」，断言重挂后
 * **取消可用 / 可继续接收该流的事件 / 无挂起态**（AC-8 / AC-22）。
 *
 * 根因：`isStreaming` 与 requestId 生命周期不一致 —— 前者在模块级 atom（跨实例存活），
 * 后者在 `useRef`（重挂归 null）。修复后 ref 以 atom 的值起步，并在挂载时收敛「连 requestId
 * 都没有」的残留窗口。
 */
describe("useWeKnoraModel · 跨路由重挂后的流式状态（①）", () => {
	it("重挂后仍可取消进行中的流，取消后收敛到确定终态（AC-8 / AC-22）", async () => {
		const { api, emit } = installApi();
		const store = createStore();

		const first = renderHook(() => useWeKnoraModel(), { wrapper: wrapperFor(store) });
		await waitFor(() => expect(first.result.current.agentsStatus).toBe("ready"));
		await act(async () => {
			await first.result.current.actions.send("问题");
		});
		act(() => emit({ type: "answer.delta", requestId: "r1", text: "部分" }));
		expect(first.result.current.isStreaming).toBe(true);
		expect(first.result.current.messages.at(-1)?.text).toBe("部分");

		// 长回答进行中切走路由：组件卸载，但 atoms（模块级）与主进程的流都还在。
		first.unmount();

		// 切回：同一 store 重新挂载（模拟 weknora 页面重新挂载）。
		const second = renderHook(() => useWeKnoraModel(), { wrapper: wrapperFor(store) });
		await waitFor(() => expect(second.result.current.agentsStatus).toBe("ready"));

		// 修复前：isStreaming=true 但 requestId 已丢 → canAsk 恒 false、取消空转、消息永停 streaming。
		expect(second.result.current.isStreaming).toBe(true);
		expect(second.result.current.canAsk).toBe(false);
		// 仍能接住该流的后续分片：证明请求身份被恢复，而不是被静默丢弃。
		act(() => emit({ type: "answer.delta", requestId: "r1", text: "续" }));
		expect(second.result.current.messages.at(-1)?.text).toBe("部分续");

		// 取消可用（不再空转），并收敛到确定终态。
		act(() => second.result.current.actions.cancel());
		expect(api.cancel).toHaveBeenCalledWith("r1");
		expect(second.result.current.isStreaming).toBe(false);
		expect(second.result.current.canAsk).toBe(true);
		expect(second.result.current.messages.at(-1)?.status).toBe("cancelled");
	});

	it("重挂时若 isStreaming 为真却没有任何可取消的请求，则收敛成确定终态（AC-22）", async () => {
		installApi();
		const store = createStore();
		// 模拟「ask 尚未返回就切走路由」的残留：有 streaming 标记，但没有可取消的 requestId。
		store.set(weKnoraStreamingAtom, true);
		store.set(weKnoraActiveRequestIdAtom, null);
		const stuck: WeKnoraChatMessage = {
			id: "a1",
			role: "assistant",
			text: "半截",
			thinking: "",
			status: "streaming",
		};
		store.set(weKnoraMessagesAtom, [stuck]);

		const rendered = renderHook(() => useWeKnoraModel(), { wrapper: wrapperFor(store) });

		await waitFor(() => expect(rendered.result.current.isStreaming).toBe(false));
		expect(rendered.result.current.messages.at(-1)?.status).toBe("interrupted");
	});
});
