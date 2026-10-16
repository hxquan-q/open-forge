// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import type { DesktopApi, WeKnoraAgent, WeKnoraStreamEvent } from "@preload/api";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useWeKnoraModel } from "./useWeKnoraModel";

type WeKnoraApi = DesktopApi["weknora"];

const CONFIGURED = { baseUrl: "http://host:8083", defaultAgentId: "A", pageSize: 50, hasApiKey: true };

function agent(id: string): WeKnoraAgent {
	return { id, name: `Agent ${id}` };
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
		listSessions: vi.fn(async () => []),
		loadMessages: vi.fn(async () => []),
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

function renderModel() {
	return renderHook(() => useWeKnoraModel(), { wrapper: wrapperFor(createStore()) });
}

async function renderReady(): Promise<ReturnType<typeof renderModel>> {
	const rendered = renderModel();
	await waitFor(() => expect(rendered.result.current.agentsStatus).toBe("ready"));
	return rendered;
}

describe("useWeKnoraModel", () => {
	it("未配置时不发起任何网络请求（AC-2）", async () => {
		const { api } = installApi({ getConfig: vi.fn(async () => ({ ...CONFIGURED, hasApiKey: false })) });
		const { result } = renderModel();
		await waitFor(() => expect(result.current.config).not.toBeNull());

		expect(result.current.configured).toBe(false);
		expect(api.listAgents).not.toHaveBeenCalled();
		await act(async () => {
			await result.current.actions.send("你好");
		});
		expect(api.ask).not.toHaveBeenCalled();
	});

	it("智能体列表为空时不可提问且不发请求（AC-19）", async () => {
		const { api } = installApi({ listAgents: vi.fn(async () => []) });
		const { result } = renderModel();
		await waitFor(() => expect(result.current.agentsStatus).toBe("empty"));

		expect(result.current.canAsk).toBe(false);
		await act(async () => {
			await result.current.actions.send("你好");
		});
		expect(api.ask).not.toHaveBeenCalled();
	});

	it("提问调 ask，逐 chunk 增量追加，turn.completed 后收敛（AC-4/6）", async () => {
		const { api, emit } = installApi();
		const { result } = await renderReady();

		await act(async () => {
			await result.current.actions.send("你好");
		});
		expect(api.ask).toHaveBeenCalledWith(expect.objectContaining({ query: "你好" }));
		expect(result.current.isStreaming).toBe(true);

		act(() => emit({ type: "answer.delta", requestId: "r1", text: "答" }));
		act(() => emit({ type: "answer.delta", requestId: "r1", text: "案" }));
		// 未完成时界面已有拼接文本（不等流结束）。
		expect(result.current.messages.at(-1)?.text).toBe("答案");
		expect(result.current.messages.at(-1)?.status).toBe("streaming");

		act(() => emit({ type: "turn.completed", requestId: "r1" }));
		expect(result.current.messages.at(-1)?.status).toBe("complete");
		expect(result.current.isStreaming).toBe(false);
	});

	it("requestId 不匹配的流事件被丢弃，不串台（AC-15）", async () => {
		const { emit } = installApi();
		const { result } = await renderReady();
		await act(async () => {
			await result.current.actions.send("你好");
		});

		act(() => emit({ type: "answer.delta", requestId: "other", text: "串台" }));
		expect(result.current.messages.at(-1)?.text).toBe("");
	});

	it("取消保留已收到文本并标为「已取消」（AC-8）", async () => {
		const { api, emit } = installApi();
		const { result } = await renderReady();
		await act(async () => {
			await result.current.actions.send("问题");
		});
		act(() => emit({ type: "answer.delta", requestId: "r1", text: "部分" }));

		act(() => result.current.actions.cancel());
		expect(api.cancel).toHaveBeenCalledWith("r1");
		expect(result.current.messages.at(-1)?.text).toBe("部分");
		expect(result.current.messages.at(-1)?.status).toBe("cancelled");
		expect(result.current.isStreaming).toBe(false);
	});

	it("流中断（stream_interrupted）保留部分并标为「未完成」（AC-21⑦）", async () => {
		const { emit } = installApi();
		const { result } = await renderReady();
		await act(async () => {
			await result.current.actions.send("问题");
		});
		act(() => emit({ type: "answer.delta", requestId: "r1", text: "半截" }));
		act(() =>
			emit({
				type: "turn.failed",
				requestId: "r1",
				error: { code: "stream_interrupted" },
			}),
		);
		expect(result.current.messages.at(-1)?.text).toBe("半截");
		expect(result.current.messages.at(-1)?.status).toBe("interrupted");
	});

	it("切换智能体调 set-config({defaultAgentId})，下一条消息即生效（AC-17/18）", async () => {
		const { api } = installApi();
		const { result } = await renderReady();

		act(() => result.current.actions.selectAgent("B"));
		expect(api.setConfig).toHaveBeenCalledWith({ defaultAgentId: "B" });
		expect(result.current.selectedAgentId).toBe("B");

		// T08（AC-18 v5）：提问时把当前选中值显式传给 ask；main 不再隐式读 config。
		await act(async () => {
			await result.current.actions.send("下一个问题");
		});
		expect(api.ask).toHaveBeenCalledWith(expect.objectContaining({ agentId: "B" }));
	});

	it("defaultAgentId 不在列表中时回退到列表第一项（AC-17）", async () => {
		installApi({ getConfig: vi.fn(async () => ({ ...CONFIGURED, defaultAgentId: "missing" })) });
		const { result } = await renderReady();
		expect(result.current.selectedAgentId).toBe("A");
	});

	it("重新进入时沿用已持久化的选中项（AC-17）", async () => {
		installApi({ getConfig: vi.fn(async () => ({ ...CONFIGURED, defaultAgentId: "B" })) });
		const { result } = await renderReady();
		expect(result.current.selectedAgentId).toBe("B");
	});
});
