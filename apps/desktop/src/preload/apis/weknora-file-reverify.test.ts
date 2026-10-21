// Copyright The Open Forge contributors.

import type { IpcRenderer } from "electron";
import { describe, expect, it, vi } from "vitest";
// 跨层只读常量对照:主进程 IPC 通道表是唯一事实源,preload 侧是手抄副本(C8 防漂移)。
import { WEKNORA_CHANNELS } from "../../main/ipc/weknora.js";
import { createWeKnoraApi } from "./weknora.js";

/**
 * flow-tester 独立复验 · preload `getFile` 桥(F3 v2 数据面第 3 层:安全上下文桥接)。
 *
 * 与实现者用例(`weknora-file.test.ts`)的角度差异:断言「渲染层唯一可见的入口是这一个通道」——
 * 逐字比对落点通道、入参对象**引用直传**(不克隆/不改写)、并做 C8 防漂移(两份手抄副本一致)。
 * 假 IPC,无 Key(C1/C2)。
 */

describe("weknora preload 复验 · getFile(F3 v2)", () => {
	it("getFile 落在 vetta:weknora:get-file 通道,入参对象原样下传", async () => {
		const invoke = vi.fn(async (_channel: string, _input?: unknown) => undefined);
		const api = createWeKnoraApi({ invoke } as unknown as IpcRenderer).weknora;
		const input = { fileRef: "minio://images/10001/exports/f3-reverify.png" };

		await api.getFile(input);

		expect(invoke).toHaveBeenCalledTimes(1);
		expect(invoke).toHaveBeenCalledWith("vetta:weknora:get-file", input);
		// 入参引用直传(桥不做加工)。
		expect(invoke.mock.calls[0]?.[1]).toBe(input);
	});

	it("C8 防漂移:preload 落点与主进程通道常量逐字一致", async () => {
		const invoke = vi.fn(async (_channel: string, _input?: unknown) => undefined);
		const api = createWeKnoraApi({ invoke } as unknown as IpcRenderer).weknora;

		expect(WEKNORA_CHANNELS.GET_FILE).toBe("vetta:weknora:get-file");
		await api.getFile({ fileRef: "minio://x/a.png" });
		expect(invoke.mock.calls[0]?.[0]).toBe(WEKNORA_CHANNELS.GET_FILE);
	});
});
