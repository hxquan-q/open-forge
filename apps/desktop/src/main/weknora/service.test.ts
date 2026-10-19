// Copyright The Open Forge contributors.

import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { WeKnoraHttpClient } from "./http.js";
import { createWeKnoraService, type WeKnoraService } from "./service.js";
import type { WeKnoraStreamEvent } from "./types.js";

/**
 * 主进程业务编排（service.ts）的独立契约测试。
 *
 * 与既有 http.test.ts（单方法）/ ipc weknora.test.ts（IPC 边界）互补：这里用**真实 WeKnoraHttpClient +
 * 假 fetch**，断言 `ask` 的**编排行为**（建会话 / 提问的顺序、请求体、复用会话、超时来源），
 * 是 AC-4 / AC-5 / AC-6 / AC-11 / AC-12 / AC-18 的直接证据。
 *
 * 红线 C2：Key 一律用 `randomUUID()` 运行时生成，夹具里不出现任何 Key 字面量。
 */

const BASE_URL = "http://weknora.test:8083";
const CONFIG = { baseUrl: BASE_URL, defaultAgentId: "agent-default", pageSize: 50 };

interface Call {
	url: string;
	init: RequestInit | undefined;
}

/** 可手动推进 / 收尾的 SSE body，模拟 `response.body.getReader()` 的增量读取。 */
function controllableSse(): { stream: ReadableStream<Uint8Array>; push: (text: string) => void; close: () => void } {
	let controller!: ReadableStreamDefaultController<Uint8Array>;
	const stream = new ReadableStream<Uint8Array>({
		start: (c) => {
			controller = c;
		},
	});
	const encoder = new TextEncoder();
	return {
		stream,
		push: (text) => controller.enqueue(encoder.encode(text)),
		close: () => controller.close(),
	};
}

function jsonResponse(status: number, payload: unknown): Response {
	return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

interface Harness {
	service: WeKnoraService;
	calls: Call[];
	events: WeKnoraStreamEvent[];
	/** `manual` 模式下每次 agent-chat 的 SSE body，按顺序。 */
	bodies: ReturnType<typeof controllableSse>[];
}

function createHarness(options: { apiKey?: string; streamMode?: "complete" | "manual" } = {}): Harness {
	const calls: Call[] = [];
	const events: WeKnoraStreamEvent[] = [];
	const bodies: ReturnType<typeof controllableSse>[] = [];
	let sessionCounter = 0;

	const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		calls.push({ url, init });
		if (url.endsWith("/api/v1/sessions")) {
			sessionCounter += 1;
			return jsonResponse(201, { success: true, data: { id: `s${sessionCounter}` } });
		}
		if (url.includes("/api/v1/agent-chat/")) {
			if (options.streamMode === "manual") {
				const body = controllableSse();
				bodies.push(body);
				return new Response(body.stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
			}
			// 默认：一条立即收敛的 SSE 流（只发 complete），避免残留超时计时器。
			return new Response('data: {"response_type":"complete"}\n\n', {
				status: 200,
				headers: { "Content-Type": "text/event-stream" },
			});
		}
		throw new Error(`unexpected url: ${url}`);
	}) as typeof fetch;

	let requestCounter = 0;
	const service = createWeKnoraService({
		readConfig: async () => ({ ...CONFIG }),
		hasApiKey: () => options.apiKey !== undefined,
		readApiKey: () => options.apiKey,
		createClient: (clientOptions) => new WeKnoraHttpClient({ ...clientOptions, fetchImpl }),
		generateRequestId: () => {
			requestCounter += 1;
			return `req-${requestCounter}`;
		},
	});
	service.onStreamEvent((event) => events.push(event));
	return { service, calls, events, bodies };
}

function sessionPosts(calls: Call[]): Call[] {
	return calls.filter((call) => call.url.endsWith("/api/v1/sessions"));
}

function agentChatCalls(calls: Call[]): Call[] {
	return calls.filter((call) => call.url.includes("/api/v1/agent-chat/"));
}

function headerOf(call: Call, name: string): string | undefined {
	return (call.init?.headers as Record<string, string> | undefined)?.[name];
}

function bodyOf(call: Call): Record<string, unknown> {
	return JSON.parse(String(call.init?.body ?? "{}")) as Record<string, unknown>;
}

async function waitForCompletions(harness: Harness, count: number): Promise<void> {
	await vi.waitFor(() => {
		expect(harness.events.filter((event) => event.type === "turn.completed")).toHaveLength(count);
	});
}

describe("createWeKnoraService · ask 编排", () => {
	it("AC-4:新对话首问先 POST /sessions 再 POST /agent-chat/{id},两次都带 X-API-Key", async () => {
		const apiKey = randomUUID();
		const harness = createHarness({ apiKey });

		const result = await harness.service.ask({ query: "你好", agentId: "agent-A" });

		// 建会话读返回的 data.id。
		expect(result.sessionId).toBe("s1");
		expect(harness.calls[0]?.url).toBe(`${BASE_URL}/api/v1/sessions`);
		expect(harness.calls[0]?.init?.method).toBe("POST");
		expect(headerOf(harness.calls[0]!, "X-API-Key")).toBe(apiKey);
		// 再提问到该 session。
		expect(harness.calls[1]?.url).toBe(`${BASE_URL}/api/v1/agent-chat/s1`);
		expect(harness.calls[1]?.init?.method).toBe("POST");
		expect(headerOf(harness.calls[1]!, "X-API-Key")).toBe(apiKey);

		await waitForCompletions(harness, 1);
	});

	it("AC-5:提问请求体为 { query, agent_id, channel: 'api' }", async () => {
		const harness = createHarness({ apiKey: randomUUID() });

		await harness.service.ask({ query: "问题内容", agentId: "agent-A" });

		const [chatCall] = agentChatCalls(harness.calls);
		expect(bodyOf(chatCall!)).toEqual({ query: "问题内容", agent_id: "agent-A", channel: "api" });
		await waitForCompletions(harness, 1);
	});

	it("AC-18:显式 agentId 优先进入请求体;缺省时回落 config.defaultAgentId", async () => {
		const harness = createHarness({ apiKey: randomUUID() });

		await harness.service.ask({ query: "显式", agentId: "agent-B" });
		await harness.service.ask({ query: "缺省" });

		const bodies = agentChatCalls(harness.calls).map((call) => bodyOf(call).agent_id);
		expect(bodies).toEqual(["agent-B", "agent-default"]);
		await waitForCompletions(harness, 2);
	});

	it("AC-11:同一会话连问两次,建会话接口只被调用一次", async () => {
		const harness = createHarness({ apiKey: randomUUID() });

		const first = await harness.service.ask({ query: "第一问", agentId: "agent-A" });
		await harness.service.ask({ query: "第二问", sessionId: first.sessionId, agentId: "agent-A" });

		expect(sessionPosts(harness.calls)).toHaveLength(1);
		const chats = agentChatCalls(harness.calls);
		expect(chats).toHaveLength(2);
		expect(chats[1]?.url).toBe(`${BASE_URL}/api/v1/agent-chat/s1`);
		await waitForCompletions(harness, 2);
	});

	it("AC-12:新对话(不带 sessionId)会新建会话,建会话被调用两次", async () => {
		const harness = createHarness({ apiKey: randomUUID() });

		const first = await harness.service.ask({ query: "会话一", agentId: "agent-A" });
		const second = await harness.service.ask({ query: "会话二", agentId: "agent-A" });

		expect(first.sessionId).toBe("s1");
		expect(second.sessionId).toBe("s2");
		expect(sessionPosts(harness.calls)).toHaveLength(2);
		await waitForCompletions(harness, 2);
	});

	it("AC-2:未配置凭据时 ask 抛 not_configured,且一个请求都不发", async () => {
		const harness = createHarness(); // 无 apiKey

		await expect(harness.service.ask({ query: "你好" })).rejects.toMatchObject({
			weknora: { code: "not_configured" },
		});
		expect(harness.calls).toHaveLength(0);
	});
});

describe("createWeKnoraService · AC-6 流式增量", () => {
	it("每收到一个 answer 事件即时透传(不等流结束),complete 后收敛", async () => {
		const harness = createHarness({ apiKey: randomUUID(), streamMode: "manual" });

		const asking = harness.service.ask({ query: "q", agentId: "agent-A" });
		await vi.waitFor(() => expect(harness.bodies).toHaveLength(1));
		const body = harness.bodies[0]!;

		body.push('data: {"response_type":"answer","content":"第一片"}\n\n');
		await vi.waitFor(() => expect(harness.events.some((event) => event.type === "answer.delta")).toBe(true));

		// 尚未收到 complete：增量已经产出（证明未缓冲到流结束）。
		expect(harness.events.filter((event) => event.type === "answer.delta").map((event) => event.text)).toEqual([
			"第一片",
		]);
		expect(harness.events.some((event) => event.type === "turn.completed")).toBe(false);

		body.push('data: {"response_type":"answer","content":"第二片"}\n\n');
		body.push('data: {"response_type":"complete"}\n\n');
		body.close();
		await asking;
		await waitForCompletions(harness, 1);

		expect(harness.events.filter((event) => event.type === "answer.delta").map((event) => event.text)).toEqual([
			"第一片",
			"第二片",
		]);
	});
});
