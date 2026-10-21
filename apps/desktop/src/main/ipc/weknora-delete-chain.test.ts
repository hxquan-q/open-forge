// Copyright The Open Forge contributors.
import { randomUUID } from "node:crypto";
import type { WebContents } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WeKnoraHttpClient } from "../weknora/http.js";
import { createWeKnoraService } from "../weknora/service.js";

/**
 * delete-session 的主进程全链合同（测试相位新增，AC-8/14）：IPC handler → service →
 * **真实 WeKnoraHttpClient** + 假 fetch。既有用例分层验证过各层，这里证明三段接起来后
 * 请求形状（URL / DELETE / 租户 Key）与错误归一化（404 → unknown + 服务端 detail）在
 * 整条链上不变形。
 *
 * 红线 C2：Key 用 randomUUID() 运行时生成，夹具里不出现任何 Key 字面量。
 */

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

const { registerWeKnoraIpc, WEKNORA_CHANNELS } = await import("./weknora.js");

interface ChainHarness {
	invokeDelete: (...args: unknown[]) => Promise<unknown>;
	calls: Array<{ url: string; init: RequestInit | undefined }>;
	apiKey: string;
}

function chainHarness(options: { status: number; payload: unknown; hasApiKey?: boolean }): ChainHarness {
	const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
	// 红线 C2：运行时生成的占位 Key，绝不落任何字面量。
	const apiKey = randomUUID();
	const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
		calls.push({ url: String(input), init });
		return new Response(JSON.stringify(options.payload), {
			status: options.status,
			headers: { "Content-Type": "application/json" },
		});
	}) as typeof fetch;

	const service = createWeKnoraService({
		readConfig: async () => ({ baseUrl: "http://weknora.test:8083", defaultAgentId: "agent-default", pageSize: 50 }),
		// hasApiKey / readApiKey 两个口径保持一致（service.requireCredentials 读的是 readApiKey）。
		hasApiKey: () => options.hasApiKey ?? true,
		readApiKey: () => ((options.hasApiKey ?? true) ? apiKey : undefined),
		createClient: (clientOptions) => new WeKnoraHttpClient({ ...clientOptions, fetchImpl }),
	});
	const webContents = { send: () => undefined } as unknown as WebContents;
	registerWeKnoraIpc(webContents, service);
	const handler = mocks.handlers.get(WEKNORA_CHANNELS.DELETE_SESSION);
	if (!handler) throw new Error("delete-session handler not registered");
	const invokeDelete = (...args: unknown[]) => handler(...args) as Promise<unknown>;
	return { invokeDelete, calls, apiKey };
}

function headerOf(call: { init: RequestInit | undefined }, name: string): string | undefined {
	return (call.init?.headers as Record<string, string> | undefined)?.[name];
}

beforeEach(() => {
	mocks.handlers.clear();
	mocks.removeHandler.mockClear();
});

describe("delete-session 全链（IPC handler → service → 真实 HTTP 客户端）", () => {
	it("成功：DELETE 方法与租户 Key 直达 HTTP 层，resolve undefined（AC-8/14）", async () => {
		const harness = chainHarness({
			status: 200,
			payload: { success: true, message: "Session deleted successfully" },
		});

		await expect(harness.invokeDelete({}, { sessionId: "sess-1" })).resolves.toBeUndefined();

		expect(harness.calls).toHaveLength(1);
		expect(harness.calls[0]?.url).toBe("http://weknora.test:8083/api/v1/sessions/sess-1");
		expect(harness.calls[0]?.init?.method).toBe("DELETE");
		expect(headerOf(harness.calls[0]!, "X-API-Key")).toBe(harness.apiKey);
	});

	it("404：归一化错误穿透 handler——code unknown、status 404、detail 含服务端错误体（AC-14；夹具为 T00 实测形态）", async () => {
		const harness = chainHarness({
			status: 404,
			payload: { error: { code: 1003, details: null, message: "session not found" }, success: false },
		});

		await expect(harness.invokeDelete({}, { sessionId: "missing" })).rejects.toMatchObject({
			weknora: { code: "unknown", status: 404, detail: expect.stringContaining("session not found") },
		});
	});

	it("未配置凭据：not_configured 且一个请求都不发（AC-2 对删除同样成立）", async () => {
		const harness = chainHarness({ status: 200, payload: { success: true }, hasApiKey: false });

		await expect(harness.invokeDelete({}, { sessionId: "sess-1" })).rejects.toMatchObject({
			weknora: { code: "not_configured" },
		});
		expect(harness.calls).toHaveLength(0);
	});
});
