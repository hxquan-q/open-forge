// Copyright The Open Forge contributors.
//
// T03 合同补齐：`load-messages` 的 `beforeTime` 游标从 IPC 透传到 service / HTTP 客户端。
// 本文件为纯新增用例（不改 weknora.test.ts 的既有断言）；只捕获 ipcMain 句柄，不加载 electron。

import { randomUUID } from "node:crypto";
import type { WebContents } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WeKnoraHttpClient } from "../weknora/http.js";
import { createWeKnoraService, type WeKnoraService } from "../weknora/service.js";
import type { WeKnoraMessage } from "../weknora/types.js";

const mocks = vi.hoisted(() => ({
	handlers: new Map<string, (...args: unknown[]) => unknown>(),
	removeHandler: vi.fn(),
}));

vi.mock("electron", () => ({
	ipcMain: {
		handle: (channel: string, handler: (...args: unknown[]) => unknown) => mocks.handlers.set(channel, handler),
		removeHandler: mocks.removeHandler,
	},
	// credentials.ts 的传递导入在模块求值期会读 safeStorage；本套用例注入假凭据，不会真正使用它。
	safeStorage: {
		isEncryptionAvailable: () => false,
		encryptString: (value: string) => Buffer.from(value, "utf8"),
		decryptString: (value: Buffer) => value.toString("utf8"),
	},
}));

const { registerWeKnoraIpc, WEKNORA_CHANNELS } = await import("./weknora.js");

interface LoadCall {
	sessionId: string;
	params: { limit?: number; beforeTime?: string };
}

interface Harness {
	calls: LoadCall[];
	service: WeKnoraService;
	webContents: WebContents;
}

function createHarness(): Harness {
	const calls: LoadCall[] = [];
	const fakeClient = {
		loadMessages: async (sessionId: string, params: LoadCall["params"]): Promise<WeKnoraMessage[]> => {
			calls.push({ sessionId, params });
			return [];
		},
	} as unknown as WeKnoraHttpClient;
	const service = createWeKnoraService({
		readConfig: async () => ({ baseUrl: "http://weknora.test:8083", defaultAgentId: "agent-default", pageSize: 50 }),
		// 用运行时生成的值当 Key，避免任何 Key 字面量进入测试夹具（红线 C2）。
		readApiKey: () => randomUUID(),
		createClient: () => fakeClient,
	});
	const webContents = { send: () => {} } as unknown as WebContents;
	return { calls, service, webContents };
}

beforeEach(() => {
	mocks.handlers.clear();
	mocks.removeHandler.mockClear();
});

describe("load-messages · beforeTime 透传(AC-6 分页游标合同补齐)", () => {
	it("beforeTime 经 IPC 校验后原样下传 service 与 HTTP 客户端", async () => {
		const { calls, service, webContents } = createHarness();
		registerWeKnoraIpc(webContents, service);

		await mocks.handlers.get(WEKNORA_CHANNELS.LOAD_MESSAGES)?.(
			{},
			{ sessionId: "sess-1", limit: 50, beforeTime: "2026-10-20T10:00:00Z" },
		);

		expect(calls).toEqual([{ sessionId: "sess-1", params: { limit: 50, beforeTime: "2026-10-20T10:00:00Z" } }]);
	});

	it("缺省 beforeTime 时不下传该字段(既有单页调用零回归)", async () => {
		const { calls, service, webContents } = createHarness();
		registerWeKnoraIpc(webContents, service);

		await mocks.handlers.get(WEKNORA_CHANNELS.LOAD_MESSAGES)?.({}, { sessionId: "sess-1" });

		expect(calls).toEqual([{ sessionId: "sess-1", params: {} }]);
	});

	it("beforeTime 非法(空串 / 非字符串)明确报错,不静默", async () => {
		const { service, webContents } = createHarness();
		registerWeKnoraIpc(webContents, service);
		const load = mocks.handlers.get(WEKNORA_CHANNELS.LOAD_MESSAGES);

		await expect(load?.({}, { sessionId: "s", beforeTime: "" })).rejects.toThrow(
			"beforeTime must be a non-empty string",
		);
		await expect(load?.({}, { sessionId: "s", beforeTime: 42 })).rejects.toThrow(
			"beforeTime must be a non-empty string",
		);
	});
});
