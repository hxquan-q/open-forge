// Copyright The Open Forge contributors.

import { describe, expect, it } from "vitest";
import { WeKnoraHttpClient } from "./http.js";
import type { WeKnoraError, WeKnoraStreamEvent } from "./types.js";

const BASE_URL = "http://weknora.example:8083";
const API_KEY = "tenant-api-key-placeholder";

interface Call {
	url: string;
	init: RequestInit | undefined;
}

function capturingFetch(handler: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response>): {
	fetchImpl: typeof fetch;
	calls: Call[];
} {
	const calls: Call[] = [];
	const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
		calls.push({ url: String(input), init });
		return handler(input, init);
	}) as typeof fetch;
	return { fetchImpl, calls };
}

function jsonResponse(status: number, payload: unknown): Response {
	return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function jsonFetch(status: number, payload: unknown): { fetchImpl: typeof fetch; calls: Call[] } {
	return capturingFetch(async () => jsonResponse(status, payload));
}

function clientWith(fetchImpl: typeof fetch, timeoutMs?: number): WeKnoraHttpClient {
	return new WeKnoraHttpClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl, timeoutMs });
}

function abortError(): DOMException {
	return new DOMException("The operation was aborted.", "AbortError");
}

/** 可手动推块 / 收尾的 SSE body；用于模拟 `response.body.getReader()`。 */
class FakeSseBody {
	private controller!: ReadableStreamDefaultController<Uint8Array>;
	readonly stream = new ReadableStream<Uint8Array>({
		start: (controller) => {
			this.controller = controller;
		},
	});
	private readonly encoder = new TextEncoder();

	push(text: string): void {
		this.controller.enqueue(this.encoder.encode(text));
	}

	close(): void {
		this.controller.close();
	}

	error(reason: unknown): void {
		this.controller.error(reason);
	}
}

/** 把 `init.signal` 的中止接到 body 上，模拟真实 fetch 的中止语义。 */
function streamFetch(body: FakeSseBody, status = 200): { fetchImpl: typeof fetch; calls: Call[] } {
	return capturingFetch(async (_input, init) => {
		const signal = init?.signal;
		if (signal) {
			const fail = () => {
				try {
					body.error(abortError());
				} catch {
					// body 已关闭
				}
			};
			if (signal.aborted) fail();
			else signal.addEventListener("abort", fail, { once: true });
		}
		return new Response(body.stream, { status });
	});
}

function collect(events: WeKnoraStreamEvent[]): (event: WeKnoraStreamEvent) => void {
	return (event) => {
		events.push(event);
	};
}

async function streamError(input: {
	fetchImpl: typeof fetch;
	timeoutMs?: number;
	signal?: AbortSignal;
	onEvent?: (event: WeKnoraStreamEvent) => void;
}): Promise<WeKnoraStreamEvent[]> {
	const events: WeKnoraStreamEvent[] = [];
	await clientWith(input.fetchImpl, input.timeoutMs).streamAgentChat({
		sessionId: "s1",
		agentId: "a1",
		query: "q",
		requestId: "r1",
		signal: input.signal,
		onEvent: input.onEvent ?? collect(events),
	});
	return events;
}

describe("WeKnoraHttpClient · REST", () => {
	it("createSession:POST /api/v1/sessions，返回 data.id，带 X-API-Key", async () => {
		const { fetchImpl, calls } = jsonFetch(201, { success: true, data: { id: "sess-1", title: "t" } });
		const session = await clientWith(fetchImpl).createSession({ title: "t" });
		expect(session.id).toBe("sess-1");
		expect(calls[0]?.url).toBe(`${BASE_URL}/api/v1/sessions`);
		expect(calls[0]?.init?.method).toBe("POST");
		expect(calls[0]?.init?.body).toBe('{"title":"t"}');
		expect((calls[0]?.init?.headers as Record<string, string>)["X-API-Key"]).toBe(API_KEY);
	});

	it("listSessions:URL 不含 agent_id（v4）", async () => {
		const { fetchImpl, calls } = jsonFetch(200, { success: true, data: [] });
		await clientWith(fetchImpl).listSessions();
		expect(calls[0]?.url).toBe(`${BASE_URL}/api/v1/sessions?page=1&page_size=50`);
		expect(calls[0]?.url).not.toContain("agent_id");
	});

	it("loadMessages:解析消息序列", async () => {
		const { fetchImpl, calls } = jsonFetch(200, {
			success: true,
			data: [
				{ id: "m1", role: "user", content: "问" },
				{ id: "m2", role: "assistant", content: "答", knowledge_references: [{ url: "https://a" }] },
			],
		});
		const messages = await clientWith(fetchImpl).loadMessages("sess-1", { limit: 20 });
		expect(messages).toEqual([
			{ id: "m1", role: "user", content: "问" },
			{ id: "m2", role: "assistant", content: "答", knowledge_references: [{ url: "https://a" }] },
		]);
		expect(calls[0]?.url).toBe(`${BASE_URL}/api/v1/messages/sess-1/load?limit=20`);
	});

	it("listAgents:解析 {id,name,description}[]", async () => {
		const { fetchImpl, calls } = jsonFetch(200, {
			data: [
				{ id: "a1", name: "智能推理", description: "d" },
				{ id: "a2", name: "allstar" },
			],
		});
		const agents = await clientWith(fetchImpl).listAgents();
		expect(agents).toEqual([
			{ id: "a1", name: "智能推理", description: "d" },
			{ id: "a2", name: "allstar" },
		]);
		expect(calls[0]?.url).toBe(`${BASE_URL}/api/v1/agents?page=1&page_size=50`);
	});

	it("listAgents:空列表是合法结果，不报错（AC-19）", async () => {
		const { fetchImpl } = jsonFetch(200, { data: [] });
		await expect(clientWith(fetchImpl).listAgents()).resolves.toEqual([]);
	});

	it("listAgents:403 → capability_missing，标记缺 read_agents", async () => {
		const { fetchImpl } = jsonFetch(403, { error: "forbidden" });
		await expect(clientWith(fetchImpl).listAgents()).rejects.toMatchObject({
			weknora: { code: "capability_missing", missingCapability: "read_agents", status: 403 },
		});
	});

	it("401 → unauthorized", async () => {
		const { fetchImpl } = jsonFetch(401, { error: "unauthorized" });
		await expect(clientWith(fetchImpl).createSession()).rejects.toMatchObject({
			weknora: { code: "unauthorized", status: 401 },
		});
	});

	it("409 + TENANT_REQUIRED → tenant_required", async () => {
		const { fetchImpl } = jsonFetch(409, { code: "TENANT_REQUIRED" });
		await expect(clientWith(fetchImpl).createSession()).rejects.toMatchObject({
			weknora: { code: "tenant_required", status: 409 },
		});
	});

	it("超时 → timeout", async () => {
		const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) =>
			new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () => reject(abortError()), { once: true });
			})) as typeof fetch;
		await expect(clientWith(fetchImpl, 10).createSession()).rejects.toMatchObject({
			weknora: { code: "timeout" },
		});
	});
});

describe("WeKnoraHttpClient · streamAgentChat", () => {
	it("完整流:agent_query → turn.started；answer 增量；tool_* 忽略；complete 收敛", async () => {
		const body = new FakeSseBody();
		body.push(
			'event: message\ndata: {"response_type":"agent_query","session_id":"s1","assistant_message_id":"m1"}\n\n',
		);
		body.push('data: {"response_type":"answer","content":"he"}\n\n');
		body.push('data: {"response_type":"tool_call","content":"c"}\n\n');
		body.push('data: {"response_type":"tool_result","content":"r"}\n\n');
		body.push('data: {"response_type":"answer","content":"llo"}\n\n');
		body.push('data: {"response_type":"complete"}\n\n');
		body.close();
		const { fetchImpl, calls } = streamFetch(body);

		const events = await streamError({ fetchImpl });
		expect(events).toEqual([
			{ type: "turn.started", requestId: "r1", sessionId: "s1" },
			{ type: "answer.delta", requestId: "r1", text: "he" },
			{ type: "answer.delta", requestId: "r1", text: "llo" },
			// AC-25：complete 前发出切分点 —— 最后一次 tool 活动之后的 "llo"（3 字）提升为正式回答。
			{ type: "answer.promoted", requestId: "r1", promotedLength: 3 },
			{ type: "turn.completed", requestId: "r1" },
		]);
		expect(calls[0]?.url).toBe(`${BASE_URL}/api/v1/agent-chat/s1`);
		expect(calls[0]?.init?.body).toBe('{"query":"q","agent_id":"a1","channel":"api"}');
	});

	it("SSE error 事件 → turn.failed stream_error（幂等）", async () => {
		const body = new FakeSseBody();
		body.push('data: {"response_type":"error","content":"boom"}\n\n');
		body.push('data: {"response_type":"error","content":"boom"}\n\n');
		body.close();
		const events = await streamError({ fetchImpl: streamFetch(body).fetchImpl });
		expect(events).toEqual([
			{ type: "turn.failed", requestId: "r1", error: { code: "stream_error", detail: "boom" } },
		]);
	});

	it("无 complete → stream_interrupted（保留已收到的 delta）", async () => {
		const body = new FakeSseBody();
		body.push('data: {"response_type":"answer","content":"partial"}\n\n');
		body.close();
		const events = await streamError({ fetchImpl: streamFetch(body).fetchImpl });
		expect(events).toEqual([
			{ type: "answer.delta", requestId: "r1", text: "partial" },
			{ type: "turn.failed", requestId: "r1", error: { code: "stream_interrupted" } },
		]);
	});

	it("HTTP 非 2xx（403）→ turn.failed capability_missing(chat)", async () => {
		const { fetchImpl } = capturingFetch(async () => jsonResponse(403, { error: "forbidden" }));
		const events = await streamError({ fetchImpl });
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			type: "turn.failed",
			requestId: "r1",
			error: { code: "capability_missing", missingCapability: "chat", status: 403 },
		});
	});

	it("超时 → turn.failed timeout", async () => {
		const body = new FakeSseBody();
		body.push('data: {"response_type":"answer","content":"first"}\n\n');
		// 不 close，模拟长耗时问答
		const events = await streamError({ fetchImpl: streamFetch(body).fetchImpl, timeoutMs: 20 });
		expect(events).toEqual([
			{ type: "answer.delta", requestId: "r1", text: "first" },
			{ type: "turn.failed", requestId: "r1", error: { code: "timeout" } },
		]);
	});

	it("abort 中途取消:读取循环退出，保留已产生的 delta，收敛为 turn.cancelled", async () => {
		const body = new FakeSseBody();
		const controller = new AbortController();
		const { fetchImpl } = streamFetch(body);

		const events: WeKnoraStreamEvent[] = [];
		let signalFirstDelta!: () => void;
		const firstDelta = new Promise<void>((resolve) => {
			signalFirstDelta = resolve;
		});
		const done = streamError({
			fetchImpl,
			signal: controller.signal,
			onEvent: (event) => {
				events.push(event);
				if (event.type === "answer.delta") signalFirstDelta();
			},
		});

		body.push('data: {"response_type":"answer","content":"hello"}\n\n');
		await firstDelta;
		controller.abort();
		await done;

		expect(events.filter((event) => event.type === "answer.delta")).toEqual([
			{ type: "answer.delta", requestId: "r1", text: "hello" },
		]);
		expect(events.at(-1)).toEqual({ type: "turn.cancelled", requestId: "r1" });
	});

	it("未捕获异常不外泄:错误只经事件收敛", async () => {
		const fetchImpl = (async () => {
			throw new TypeError("fetch failed");
		}) as unknown as typeof fetch;
		const events = await streamError({ fetchImpl });
		expect(events).toEqual([
			{ type: "turn.failed", requestId: "r1", error: { code: "network", detail: "fetch failed" } as WeKnoraError },
		]);
	});
});
