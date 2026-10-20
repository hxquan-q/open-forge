// Copyright The Open Forge contributors.
import { randomUUID } from "node:crypto";
import type { WebContents } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WeKnoraHttpClient } from "../weknora/http.js";
import { createWeKnoraService, type WeKnoraService } from "../weknora/service.js";
import type { WeKnoraStreamEvent } from "../weknora/types.js";

// 只捕获 ipcMain 句柄；测试不加载真实 electron 二进制。
const mocks = vi.hoisted(() => ({
	handlers: new Map<string, (...args: unknown[]) => unknown>(),
	removeHandler: vi.fn(),
}));

vi.mock("electron", () => ({
	ipcMain: {
		handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
			mocks.handlers.set(channel, handler);
		},
		removeHandler: mocks.removeHandler,
	},
	// credentials.ts 的传递导入在模块求值期会读到 safeStorage；本套用例注入假凭据，不会真正使用它。
	safeStorage: {
		isEncryptionAvailable: () => false,
		encryptString: (value: string) => Buffer.from(value, "utf8"),
		decryptString: (value: Buffer) => value.toString("utf8"),
	},
}));

const { registerWeKnoraIpc, WEKNORA_CHANNELS, WEKNORA_INVOKE_CHANNELS } = await import("./weknora.js");

interface Harness {
	service: WeKnoraService;
	webContents: WebContents;
	/** webContents.send 收到的 (channel, payload)。 */
	sent: Array<{ channel: string; payload: unknown }>;
	/** 假客户端收到的删除请求（按序）。 */
	deleted: string[];
	/** 假客户端收到的 chunk 取数请求（按序）。 */
	fetchedChunks: string[];
}

const DEFAULT_CONFIG = { baseUrl: "http://weknora.test:8083", defaultAgentId: "agent-default", pageSize: 50 };

function createHarness(): Harness {
	let config = { ...DEFAULT_CONFIG };
	let apiKey: string | undefined;
	const sent: Array<{ channel: string; payload: unknown }> = [];

	// 假客户端：建会话返回固定 id；流式同步吐出 4 个事件（含 2 个 answer.delta）。
	const deleted: string[] = [];
	const fetchedChunks: string[] = [];
	const fakeClient = {
		createSession: async () => ({ id: "session-created" }),
		deleteSession: async (sessionId: string) => {
			deleted.push(sessionId);
		},
		getChunkById: async (chunkId: string) => {
			fetchedChunks.push(chunkId);
			return { content: "chunk 原文", knowledgeId: "k-1", kbId: "kb-1" };
		},
		streamAgentChat: async (input: {
			requestId: string;
			sessionId: string;
			onEvent: (event: WeKnoraStreamEvent) => void;
		}) => {
			input.onEvent({ type: "turn.started", requestId: input.requestId, sessionId: input.sessionId });
			input.onEvent({ type: "answer.delta", requestId: input.requestId, text: "你" });
			input.onEvent({ type: "answer.delta", requestId: input.requestId, text: "好" });
			input.onEvent({ type: "turn.completed", requestId: input.requestId });
		},
	} as unknown as WeKnoraHttpClient;

	const service = createWeKnoraService({
		readConfig: async () => ({ ...config }),
		writeConfig: async (patch) => {
			config = { ...config, ...patch };
			return { ...config };
		},
		hasApiKey: () => apiKey !== undefined,
		readApiKey: () => apiKey,
		writeApiKey: (value) => {
			apiKey = value;
		},
		createClient: () => fakeClient,
		generateRequestId: () => "req-1",
	});

	const webContents = {
		send: (channel: string, payload: unknown) => {
			sent.push({ channel, payload });
		},
	} as unknown as WebContents;

	return { service, webContents, sent, deleted, fetchedChunks };
}

/**
 * 真实 `WeKnoraHttpClient` + 假 fetch 的装配：`ask` 频道 → service → http 客户端一路走通，
 * 从而能断言**真实请求体**里的 `agent_id`（AC-18 v5 端到端，补上 T03 遗留的测试缺口）。
 */
interface BodyHarness {
	service: WeKnoraService;
	webContents: WebContents;
	/** 每次 fetch 的 (url, init)；用 `init.body` 断言真实请求体。 */
	calls: Array<{ url: string; init: RequestInit | undefined }>;
	/** webContents.send 收到的流事件载荷。 */
	sent: Array<{ channel: string; payload: unknown }>;
}

function createBodyHarness(): BodyHarness {
	const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
	const sent: Array<{ channel: string; payload: unknown }> = [];

	const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		calls.push({ url, init });
		if (url.includes("/api/v1/agent-chat/")) {
			// 一条立即结束的 SSE 流：只发 complete，让 ask 的后台流尽快收敛（不残留超时计时器）。
			return new Response('data: {"response_type":"complete"}\n\n', {
				status: 200,
				headers: { "Content-Type": "text/event-stream" },
			});
		}
		return new Response(JSON.stringify({ success: true, data: { id: "session-created" } }), {
			status: 201,
			headers: { "Content-Type": "application/json" },
		});
	}) as typeof fetch;

	const service = createWeKnoraService({
		readConfig: async () => ({ ...DEFAULT_CONFIG }),
		hasApiKey: () => true,
		// 用运行时生成的值当 Key，避免任何 Key 字面量进入测试夹具（红线 C2）。
		readApiKey: () => randomUUID(),
		createClient: (options) => new WeKnoraHttpClient({ ...options, fetchImpl }),
		generateRequestId: () => "req-1",
	});

	const webContents = {
		send: (channel: string, payload: unknown) => {
			sent.push({ channel, payload });
		},
	} as unknown as WebContents;

	return { service, webContents, calls, sent };
}

/** 已落账的 agent-chat 请求体（`init.body` 的 JSON 字符串）。 */
function agentChatBodies(harness: BodyHarness): string[] {
	return harness.calls
		.filter((call) => call.url.includes("/api/v1/agent-chat/"))
		.map((call) => String(call.init?.body ?? ""));
}

/** 等第 `count` 条 agent-chat 请求落账，返回全部请求体。 */
async function waitForAgentChatBodies(harness: BodyHarness, count: number): Promise<string[]> {
	await vi.waitFor(() => {
		expect(agentChatBodies(harness)).toHaveLength(count);
	});
	return agentChatBodies(harness);
}

/** 等 `count` 条流收敛为 `turn.completed`（确保后台流的超时计时器已释放）。 */
async function waitForTurnEnds(harness: BodyHarness, count: number): Promise<void> {
	await vi.waitFor(() => {
		const completed = harness.sent.filter((entry) => (entry.payload as { type?: string }).type === "turn.completed");
		expect(completed).toHaveLength(count);
	});
}

beforeEach(() => {
	mocks.handlers.clear();
	mocks.removeHandler.mockClear();
});

describe("registerWeKnoraIpc", () => {
	it("注册全部 invoke 频道;teardown 后全部注销", () => {
		const { service, webContents } = createHarness();
		const teardown = registerWeKnoraIpc(webContents, service);

		expect([...mocks.handlers.keys()].sort()).toEqual([...WEKNORA_INVOKE_CHANNELS].sort());
		expect(mocks.handlers.size).toBe(WEKNORA_INVOKE_CHANNELS.length);

		teardown();

		for (const channel of WEKNORA_INVOKE_CHANNELS) expect(mocks.removeHandler).toHaveBeenCalledWith(channel);
		expect(mocks.removeHandler).toHaveBeenCalledTimes(WEKNORA_INVOKE_CHANNELS.length);
	});

	it("get-config 返回体不含 Key;hasApiKey 随凭据存在与否变化", async () => {
		const { service, webContents } = createHarness();
		registerWeKnoraIpc(webContents, service);
		const getConfig = mocks.handlers.get(WEKNORA_CHANNELS.GET_CONFIG);
		const setApiKey = mocks.handlers.get(WEKNORA_CHANNELS.SET_API_KEY);

		const before = await getConfig?.({});
		expect(before).toEqual({ ...DEFAULT_CONFIG, hasApiKey: false });
		expect(Object.keys(before as object).sort()).toEqual(["baseUrl", "defaultAgentId", "hasApiKey", "pageSize"]);

		// 用运行时生成的值当 Key,避免任何 Key 字面量进入测试夹具(红线 C2)。
		const apiKeySentinel = randomUUID();
		await setApiKey?.({}, apiKeySentinel);

		const after = await getConfig?.({});
		expect(after).toEqual({ ...DEFAULT_CONFIG, hasApiKey: true });
		expect(after).not.toHaveProperty("apiKey");
		expect(JSON.stringify(after)).not.toContain(apiKeySentinel);
	});

	it("set-config 持久化:get-config 反映新值", async () => {
		const { service, webContents } = createHarness();
		registerWeKnoraIpc(webContents, service);

		await mocks.handlers.get(WEKNORA_CHANNELS.SET_CONFIG)?.({}, { defaultAgentId: "agent-2", pageSize: 20 });

		await expect(mocks.handlers.get(WEKNORA_CHANNELS.GET_CONFIG)?.({})).resolves.toEqual({
			baseUrl: DEFAULT_CONFIG.baseUrl,
			defaultAgentId: "agent-2",
			pageSize: 20,
			hasApiKey: false,
		});
	});

	it("delete-session 薄层转调:合法入参原样下传 service,不夹带业务", async () => {
		const { service, webContents, deleted } = createHarness();
		registerWeKnoraIpc(webContents, service);
		// deleteSession 走 restClient,需已配置凭据(AC-2);用运行时值写入,不引入 Key 字面量(红线 C2)。
		await mocks.handlers.get(WEKNORA_CHANNELS.SET_API_KEY)?.({}, randomUUID());

		await mocks.handlers.get(WEKNORA_CHANNELS.DELETE_SESSION)?.({}, { sessionId: "sess-1" });

		expect(deleted).toEqual(["sess-1"]);
	});

	it("触发一次流:webContents.send 收到 stream-event,载荷形状符合 WeKnoraStreamEvent", async () => {
		const { service, webContents, sent } = createHarness();
		registerWeKnoraIpc(webContents, service);
		// ask 需要已配置凭据(AC-2);用运行时值写入,不引入任何 Key 字面量(红线 C2)。
		await mocks.handlers.get(WEKNORA_CHANNELS.SET_API_KEY)?.({}, randomUUID());

		const result = (await mocks.handlers.get(WEKNORA_CHANNELS.ASK)?.({}, { query: "你好" })) as {
			requestId: string;
			sessionId: string;
		};
		expect(result).toEqual({ requestId: "req-1", sessionId: "session-created" });

		expect(sent.map((entry) => entry.channel)).toEqual([
			WEKNORA_CHANNELS.STREAM_EVENT,
			WEKNORA_CHANNELS.STREAM_EVENT,
			WEKNORA_CHANNELS.STREAM_EVENT,
			WEKNORA_CHANNELS.STREAM_EVENT,
		]);
		expect(sent[0]?.payload).toEqual({ type: "turn.started", requestId: "req-1", sessionId: "session-created" });
		expect(sent[1]?.payload).toEqual({ type: "answer.delta", requestId: "req-1", text: "你" });
		expect(sent[2]?.payload).toEqual({ type: "answer.delta", requestId: "req-1", text: "好" });
		expect(sent[3]?.payload).toEqual({ type: "turn.completed", requestId: "req-1" });
	});

	it("跨进程入参运行时校验:传错类型明确报错,不静默", async () => {
		const { service, webContents } = createHarness();
		registerWeKnoraIpc(webContents, service);
		const handler = (channel: string): ((...args: unknown[]) => unknown) | undefined => mocks.handlers.get(channel);

		await expect(handler(WEKNORA_CHANNELS.SET_CONFIG)?.({}, "nope")).rejects.toThrow(
			"set-config requires an object argument",
		);
		await expect(handler(WEKNORA_CHANNELS.SET_CONFIG)?.({}, { pageSize: "big" })).rejects.toThrow(
			"pageSize must be a positive integer",
		);
		await expect(handler(WEKNORA_CHANNELS.SET_API_KEY)?.({}, 42)).rejects.toThrow(
			"apiKey must be a non-empty string",
		);
		await expect(handler(WEKNORA_CHANNELS.LIST_AGENTS)?.({}, { page: 0 })).rejects.toThrow(
			"page must be a positive integer",
		);
		await expect(handler(WEKNORA_CHANNELS.LOAD_MESSAGES)?.({}, { limit: 5 })).rejects.toThrow(
			"sessionId must be a non-empty string",
		);
		await expect(handler(WEKNORA_CHANNELS.DELETE_SESSION)?.({}, "nope")).rejects.toThrow(
			"delete-session requires an object argument",
		);
		await expect(handler(WEKNORA_CHANNELS.DELETE_SESSION)?.({}, {})).rejects.toThrow(
			"sessionId must be a non-empty string",
		);
		await expect(handler(WEKNORA_CHANNELS.DELETE_SESSION)?.({}, { sessionId: "  " })).rejects.toThrow(
			"sessionId must be a non-empty string",
		);
		await expect(handler(WEKNORA_CHANNELS.ASK)?.({}, { query: "   " })).rejects.toThrow(
			"query must be a non-empty string",
		);
		await expect(handler(WEKNORA_CHANNELS.CANCEL)?.({}, {})).rejects.toThrow("requestId must be a non-empty string");
	});
});

describe("registerWeKnoraIpc · ask 显式携带 agentId（AC-18 v5）", () => {
	it("端到端:显式传入的 agentId 进入真实请求 body 的 agent_id", async () => {
		const harness = createBodyHarness();
		registerWeKnoraIpc(harness.webContents, harness.service);

		await mocks.handlers.get(WEKNORA_CHANNELS.ASK)?.({}, { query: "你好", agentId: "agent-B" });

		const [body] = await waitForAgentChatBodies(harness, 1);
		expect(JSON.parse(body ?? "{}")).toEqual({ query: "你好", agent_id: "agent-B", channel: "api" });
		await waitForTurnEnds(harness, 1);
	});

	it("缺省回落:不传 agentId 时请求 body 的 agent_id 用 config.defaultAgentId", async () => {
		const harness = createBodyHarness();
		registerWeKnoraIpc(harness.webContents, harness.service);

		await mocks.handlers.get(WEKNORA_CHANNELS.ASK)?.({}, { query: "你好" });

		const [body] = await waitForAgentChatBodies(harness, 1);
		expect(JSON.parse(body ?? "{}")).toMatchObject({ agent_id: DEFAULT_CONFIG.defaultAgentId });
		await waitForTurnEnds(harness, 1);
	});

	it("切换后即时生效:选 A 提问 → 选 B 提问,两次 body 的 agent_id 分别为 A、B", async () => {
		const harness = createBodyHarness();
		registerWeKnoraIpc(harness.webContents, harness.service);

		await mocks.handlers.get(WEKNORA_CHANNELS.ASK)?.({}, { query: "问A", agentId: "agent-A" });
		await waitForAgentChatBodies(harness, 1);
		await mocks.handlers.get(WEKNORA_CHANNELS.ASK)?.({}, { query: "问B", agentId: "agent-B" });

		const bodies = await waitForAgentChatBodies(harness, 2);
		expect(bodies.map((body) => (JSON.parse(body) as { agent_id?: string }).agent_id)).toEqual([
			"agent-A",
			"agent-B",
		]);
		await waitForTurnEnds(harness, 2);
	});

	it("入参非法:agentId 非字符串或空串时明确报错,不静默", async () => {
		const { service, webContents } = createHarness();
		registerWeKnoraIpc(webContents, service);
		const ask = mocks.handlers.get(WEKNORA_CHANNELS.ASK);

		await expect(ask?.({}, { query: "你好", agentId: "" })).rejects.toThrow("agentId must be a non-empty string");
		await expect(ask?.({}, { query: "你好", agentId: 42 })).rejects.toThrow("agentId must be a non-empty string");
	});
});

describe("registerWeKnoraIpc · get-chunk(AC-14 只读数据面)", () => {
	it("薄层转调:合法入参原样下传 service,归一化结果直返渲染层", async () => {
		const { service, webContents, fetchedChunks } = createHarness();
		registerWeKnoraIpc(webContents, service);
		// getChunkById 走 restClient,需已配置凭据(AC-2);用运行时值写入,不引入 Key 字面量(红线 C2)。
		await mocks.handlers.get(WEKNORA_CHANNELS.SET_API_KEY)?.({}, randomUUID());

		const chunk = await mocks.handlers.get(WEKNORA_CHANNELS.GET_CHUNK)?.({}, { chunkId: "chunk-1" });

		expect(fetchedChunks).toEqual(["chunk-1"]);
		expect(chunk).toEqual({ content: "chunk 原文", knowledgeId: "k-1", kbId: "kb-1" });
	});

	it("入参校验:非对象 / 缺 chunkId / 空串 / 非字符串明确报错,不静默", async () => {
		const { service, webContents } = createHarness();
		registerWeKnoraIpc(webContents, service);
		const getChunk = mocks.handlers.get(WEKNORA_CHANNELS.GET_CHUNK);

		await expect(getChunk?.({}, "nope")).rejects.toThrow("get-chunk requires an object argument");
		await expect(getChunk?.({}, {})).rejects.toThrow("chunkId must be a non-empty string");
		await expect(getChunk?.({}, { chunkId: "  " })).rejects.toThrow("chunkId must be a non-empty string");
		await expect(getChunk?.({}, { chunkId: 42 })).rejects.toThrow("chunkId must be a non-empty string");
	});
});
