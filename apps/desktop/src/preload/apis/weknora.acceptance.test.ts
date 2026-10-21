// Copyright The Open Forge contributors.

import type { IpcRenderer } from "electron";
import { describe, expect, it, vi } from "vitest";
// 跨层只读常量对照:主进程 IPC 的通道表是唯一事实源,preload 侧是手抄副本(C8 防漂移);
// 两份常量不一致时渲染层调用将落到无人注册的通道上,只有这类测试能拦住。
// electron 在测试下解析到 src/test/electron-stub.ts(vitest alias),模块级导入无副作用。
import { WEKNORA_CHANNELS } from "../../main/ipc/weknora.js";
import { createWeKnoraApi } from "./weknora.js";

/**
 * flow-tester 独立验收测试(weknora-kb-citation,AC-14 四层一条线的 preload 缺口)。
 *
 * 既有 preload 合同测试(weknora.test.ts)的调用清单**漏了 getChunk**(该文件成于上一
 * feature 的测试相位);T02 只补了渲染层桩。本文件补齐:getChunk 必须落在
 * vetta:weknora:get-chunk 通道、参数原样下传,并与主进程通道常量逐字相等。
 */

describe("weknora preload 验收 · getChunk 桥(AC-14)", () => {
	it("getChunk 落在约定通道,入参原样下传", async () => {
		const invoke = vi.fn(async () => undefined);
		const ipc = { invoke } as unknown as IpcRenderer;
		const weknora = createWeKnoraApi(ipc).weknora;

		await weknora.getChunk({ chunkId: "chunk-acc-1" });

		expect(invoke).toHaveBeenCalledTimes(1);
		expect(invoke).toHaveBeenCalledWith("vetta:weknora:get-chunk", { chunkId: "chunk-acc-1" });
	});

	it("主进程通道常量与 preload 落点一致(两份手抄副本防漂移)", async () => {
		const invoke = vi.fn(async (_channel: string, _input?: unknown) => undefined);
		const ipc = { invoke } as unknown as IpcRenderer;
		const weknora = createWeKnoraApi(ipc).weknora;

		// 事实源:主进程注册用的常量。
		expect(WEKNORA_CHANNELS.GET_CHUNK).toBe("vetta:weknora:get-chunk");
		// preload 实际调用的通道必须逐字相同。
		await weknora.getChunk({ chunkId: "c" });
		expect(invoke.mock.calls[0]?.[0]).toBe(WEKNORA_CHANNELS.GET_CHUNK);
	});
});
