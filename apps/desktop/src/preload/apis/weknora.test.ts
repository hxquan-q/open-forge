// Copyright The Open Forge contributors.
import { randomUUID } from "node:crypto";
import type { IpcRenderer } from "electron";
import { describe, expect, it, vi } from "vitest";
import { createWeKnoraApi } from "./weknora.js";

/**
 * weknora preload 桥的通道合同（测试相位新增，AC-14）：渲染层拿到的每个方法都必须落在
 * 约定通道上、参数原样下传。此前该桥（含 T02 新增的 deleteSession）没有 preload 级合同测试，
 * 通道名拼错只能靠实机才能发现。
 *
 * 红线 C2：Key 入参用 randomUUID() 运行时生成，夹具里不出现任何 Key 字面量。
 */
describe("weknora preload contract", () => {
	it("每个方法都调用自己的 vetta:weknora:* 通道，参数原样下传", async () => {
		const invoke = vi.fn(async () => undefined);
		const ipc = { invoke } as unknown as IpcRenderer;
		const weknora = createWeKnoraApi(ipc).weknora;
		const apiKey = randomUUID();

		await weknora.getConfig();
		await weknora.setConfig({ defaultAgentId: "agent-1" });
		await weknora.setApiKey(apiKey);
		await weknora.listAgents({ page: 1, pageSize: 50 });
		await weknora.listSessions({ page: 1, pageSize: 20 });
		await weknora.loadMessages({ sessionId: "s1", limit: 20 });
		await weknora.deleteSession({ sessionId: "s1" });
		await weknora.ask({ query: "你好", agentId: "agent-1" });
		await weknora.cancel("r1");

		expect(invoke).toHaveBeenNthCalledWith(1, "vetta:weknora:get-config");
		expect(invoke).toHaveBeenNthCalledWith(2, "vetta:weknora:set-config", { defaultAgentId: "agent-1" });
		expect(invoke).toHaveBeenNthCalledWith(3, "vetta:weknora:set-api-key", apiKey);
		expect(invoke).toHaveBeenNthCalledWith(4, "vetta:weknora:list-agents", { page: 1, pageSize: 50 });
		expect(invoke).toHaveBeenNthCalledWith(5, "vetta:weknora:list-sessions", { page: 1, pageSize: 20 });
		expect(invoke).toHaveBeenNthCalledWith(6, "vetta:weknora:load-messages", { sessionId: "s1", limit: 20 });
		expect(invoke).toHaveBeenNthCalledWith(7, "vetta:weknora:delete-session", { sessionId: "s1" });
		expect(invoke).toHaveBeenNthCalledWith(8, "vetta:weknora:ask", { query: "你好", agentId: "agent-1" });
		expect(invoke).toHaveBeenNthCalledWith(9, "vetta:weknora:cancel", { requestId: "r1" });
	});
});
