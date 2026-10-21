// Copyright The Open Forge contributors.

import type { IpcRenderer } from "electron";
import { describe, expect, it, vi } from "vitest";
// 跨层只读常量对照:主进程 IPC 通道表是唯一事实源,preload 侧是手抄副本(C8 防漂移)。
import { WEKNORA_CHANNELS } from "../../main/ipc/weknora.js";
import { createWeKnoraApi } from "./weknora.js";

/**
 * weknora preload 桥 · getFile(F3 v2):渲染层取内嵌图片必须落在
 * `vetta:weknora:get-file` 通道、参数原样下传,并与主进程通道常量逐字相等。
 * 假 IPC,无 Key(C1/C2)。
 */
describe("weknora preload 合同 · getFile(F3 v2)", () => {
	it("getFile 落在约定通道,入参原样下传", async () => {
		const invoke = vi.fn(async () => undefined);
		const ipc = { invoke } as unknown as IpcRenderer;
		const weknora = createWeKnoraApi(ipc).weknora;

		await weknora.getFile({ fileRef: "minio://images/10001/exports/a.png" });

		expect(invoke).toHaveBeenCalledTimes(1);
		expect(invoke).toHaveBeenCalledWith("vetta:weknora:get-file", {
			fileRef: "minio://images/10001/exports/a.png",
		});
	});

	it("主进程通道常量与 preload 落点一致(两份手抄副本防漂移)", async () => {
		const invoke = vi.fn(async (_channel: string, _input?: unknown) => undefined);
		const ipc = { invoke } as unknown as IpcRenderer;
		const weknora = createWeKnoraApi(ipc).weknora;

		expect(WEKNORA_CHANNELS.GET_FILE).toBe("vetta:weknora:get-file");
		await weknora.getFile({ fileRef: "minio://x/a.png" });
		expect(invoke.mock.calls[0]?.[0]).toBe(WEKNORA_CHANNELS.GET_FILE);
	});
});
