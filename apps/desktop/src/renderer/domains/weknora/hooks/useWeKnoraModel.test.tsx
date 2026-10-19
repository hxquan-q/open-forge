// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { randomUUID } from "node:crypto";
import type { DesktopApi, WeKnoraAgent, WeKnoraMessage, WeKnoraSession, WeKnoraStreamEvent } from "@preload/api";
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

function session(id: string, overrides: Partial<WeKnoraSession> = {}): WeKnoraSession {
	return { id, ...overrides };
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

	it("智能体列表拉取失败时不可提问且不发请求（AC-19 失败路径）", async () => {
		const { api } = installApi({
			listAgents: vi.fn(async () => {
				throw new Error("network");
			}),
		});
		const { result } = renderModel();
		await waitFor(() => expect(result.current.agentsStatus).toBe("error"));

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

describe("useWeKnoraModel · 历史会话（AC-11/12/13/14/15）", () => {
	it("复用会话：同一对话连问两次，第二次携带第一次返回的 sessionId（AC-11，不新建会话）", async () => {
		const { api, emit } = installApi();
		const { result } = await renderReady();

		await act(async () => {
			await result.current.actions.send("第一问");
		});
		act(() => emit({ type: "turn.completed", requestId: "r1" }));
		expect(result.current.currentSessionId).toBe("s1");

		await act(async () => {
			await result.current.actions.send("第二问");
		});

		expect(api.ask).toHaveBeenCalledTimes(2);
		expect(api.ask).toHaveBeenNthCalledWith(1, expect.not.objectContaining({ sessionId: expect.anything() }));
		expect(api.ask).toHaveBeenNthCalledWith(2, expect.objectContaining({ sessionId: "s1", query: "第二问" }));
	});

	it("新建对话：清空当前会话与消息，且不发起任何请求（AC-12）", async () => {
		const { api, emit } = installApi();
		const { result } = await renderReady();
		await act(async () => {
			await result.current.actions.send("问题");
		});
		act(() => emit({ type: "answer.delta", requestId: "r1", text: "答" }));
		expect(result.current.messages.length).toBe(2);
		expect(result.current.currentSessionId).toBe("s1");
		expect(api.ask).toHaveBeenCalledTimes(1);

		act(() => result.current.actions.newConversation());

		expect(result.current.messages.length).toBe(0);
		expect(result.current.currentSessionId).toBeNull();
		// 未立即建会话 / 未提问。
		expect(api.ask).toHaveBeenCalledTimes(1);
	});

	it("新建对话后，旧 requestId 的流事件不再落到界面（AC-15）", async () => {
		const { emit } = installApi();
		const { result } = await renderReady();
		await act(async () => {
			await result.current.actions.send("问题");
		});

		act(() => result.current.actions.newConversation());
		act(() => emit({ type: "answer.delta", requestId: "r1", text: "旧流" }));

		expect(result.current.messages.length).toBe(0);
	});

	it("列历史：listSessions 带 {page:1, pageSize:20}，不含 agent_id（AC-13 / 1c）", async () => {
		const { api } = installApi({ listSessions: vi.fn(async () => [session("s1")]) });
		const { result } = await renderReady();
		await waitFor(() => expect(result.current.sessionsStatus).toBe("ready"));

		expect(api.listSessions).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
	});

	it("列历史：按更新时间倒序（AC-13）", async () => {
		installApi({
			listSessions: vi.fn(async () => [
				session("old", { updated_at: "2026-01-01T00:00:00.000Z" }),
				session("new", { updated_at: "2026-02-01T00:00:00.000Z" }),
			]),
		});
		const { result } = await renderReady();
		await waitFor(() => expect(result.current.sessionsStatus).toBe("ready"));

		expect(result.current.sessions.map((item) => item.id)).toEqual(["new", "old"]);
	});

	it("未配置时不拉历史会话（AC-2）", async () => {
		const { api } = installApi({ getConfig: vi.fn(async () => ({ ...CONFIGURED, hasApiKey: false })) });
		const { result } = renderModel();
		await waitFor(() => expect(result.current.config).not.toBeNull());

		expect(api.listSessions).not.toHaveBeenCalled();
	});

	it("载入历史会话后追问沿用该 sessionId（AC-14）", async () => {
		const { api } = installApi({
			listSessions: vi.fn(async () => [session("s9", { title: "旧会话" })]),
			loadMessages: vi.fn(async () => [message("m1", "user", "历史提问"), message("m2", "assistant", "历史回答")]),
		});
		const { result } = await renderReady();

		await act(async () => {
			await result.current.actions.openSession("s9");
		});

		expect(api.loadMessages).toHaveBeenCalledWith({ sessionId: "s9", limit: 20 });
		expect(result.current.currentSessionId).toBe("s9");
		expect(result.current.messages.map((item) => item.text)).toEqual(["历史提问", "历史回答"]);

		await act(async () => {
			await result.current.actions.send("追问");
		});
		expect(api.ask).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "s9", query: "追问" }));
	});

	it("切换历史会话后消息整体替换，不残留上一会话（AC-15）", async () => {
		const { api } = installApi({
			listSessions: vi.fn(async () => [session("A"), session("B")]),
			loadMessages: vi.fn(async ({ sessionId }) =>
				sessionId === "A" ? [message("a1", "user", "A 的提问")] : [message("b1", "assistant", "B 的回答")],
			),
		});
		const { result } = await renderReady();

		await act(async () => {
			await result.current.actions.openSession("A");
		});
		expect(result.current.messages.map((item) => item.text)).toEqual(["A 的提问"]);

		await act(async () => {
			await result.current.actions.openSession("B");
		});
		expect(result.current.messages.map((item) => item.text)).toEqual(["B 的回答"]);
		expect(api.loadMessages).toHaveBeenCalledTimes(2);
	});

	// ── 实机缺陷回派（round 1）：该自动刷新时没刷新 ──

	it("保存配置后同时拉取智能体与历史会话（缺陷 1）", async () => {
		const getConfig = vi.fn(async () => ({ ...CONFIGURED, hasApiKey: false }));
		const { api } = installApi({ getConfig });
		const { result } = renderModel();
		await waitFor(() => expect(result.current.config).not.toBeNull());
		// 未配置时一个请求都不发（AC-2）。
		expect(api.listSessions).not.toHaveBeenCalled();

		// 模拟用户实际路径：先开应用（未配置）→ 再填配置保存。
		getConfig.mockImplementation(async () => CONFIGURED);
		await act(async () => {
			// 红线 C2：Key 夹具运行时生成，不写死字面量。
			await result.current.actions.saveSetup({ baseUrl: "http://host:8083", apiKey: randomUUID() });
		});

		expect(api.listAgents).toHaveBeenCalled();
		expect(api.listSessions).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
	});

	it("新建会话提问成功后刷新历史列表（缺陷 2）", async () => {
		const { api } = installApi();
		const { result } = await renderReady();
		await waitFor(() => expect(result.current.sessionsStatus).toBe("ready"));
		expect(api.listSessions).toHaveBeenCalledTimes(1); // 初始化一次

		await act(async () => {
			await result.current.actions.send("第一问");
		});

		await waitFor(() => expect(api.listSessions).toHaveBeenCalledTimes(2));
	});

	it("追问复用会话时不额外刷新历史列表（缺陷 2 的取舍：仅新建时拉）", async () => {
		const { api, emit } = installApi();
		const { result } = await renderReady();
		await waitFor(() => expect(result.current.sessionsStatus).toBe("ready"));

		await act(async () => {
			await result.current.actions.send("第一问");
		});
		act(() => emit({ type: "turn.completed", requestId: "r1" }));
		await waitFor(() => expect(api.listSessions).toHaveBeenCalledTimes(2));

		await act(async () => {
			await result.current.actions.send("第二问");
		});
		expect(api.listSessions).toHaveBeenCalledTimes(2);
	});
});
