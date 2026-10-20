// Copyright The Open Forge contributors.

import type { WebContents } from "electron";
import { describe, expect, it, vi } from "vitest";
import type { WeKnoraService } from "../weknora/service.js";

/**
 * flow-tester 独立复验 · `get-file` IPC 薄层(F3 v2 数据面第 2 层:IPC 桥接)。
 *
 * 与实现者用例(`weknora.test.ts` 的 get-file describe)的角度差异:
 * - 只注册 GET_FILE 关心的最小假 service,断言「薄层转调」——入参**原样**下传(不夹带任何加工),
 *   service 返回值**直返**渲染层;
 * - 入参校验逐畸形枚举(非对象 / 缺字段 / 空串 / 纯空白 / 非字符串),全部明确报错、不静默;
 * - 断言 GET_FILE 是 invoke 频道(teardown 会注销,不留悬挂 handler)。
 *
 * 假 service 无 Key(C1/C2)。electron 以窄 mock 顶替,不加载真实二进制。
 */

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
	// service.js 的传递导入在模块求值期会读 safeStorage;本套用例不真正使用它。
	safeStorage: {
		isEncryptionAvailable: () => false,
		encryptString: (value: string) => Buffer.from(value, "utf8"),
		decryptString: (value: Buffer) => value.toString("utf8"),
	},
}));

const { registerWeKnoraIpc, WEKNORA_CHANNELS, WEKNORA_INVOKE_CHANNELS } = await import("./weknora.js");

/** 只装 GET_FILE 需要的假 service,其余方法用不到即不提供。 */
function registerMinimal(): { getFileData: ReturnType<typeof vi.fn> } {
	mocks.handlers.clear();
	const getFileData = vi.fn(async ({ fileRef }: { fileRef: string }) => ({
		dataUrl: `data:image/png;base64,REF:${fileRef}`,
		contentType: "image/png",
	}));
	const service = {
		onStreamEvent: () => () => {},
		getFileData,
	} as unknown as WeKnoraService;
	const webContents = { send: () => {} } as unknown as WebContents;
	registerWeKnoraIpc(webContents, service);
	return { getFileData };
}

function getFileHandler(): (...args: unknown[]) => unknown {
	const handler = mocks.handlers.get(WEKNORA_CHANNELS.GET_FILE);
	if (!handler) throw new Error("GET_FILE handler not registered");
	return handler;
}

describe("get-file IPC 薄层复验(F3 v2)", () => {
	it("薄层转调:合法入参原样下传 service,返回值直返渲染层", async () => {
		const { getFileData } = registerMinimal();
		const ref = "minio://images/10001/exports/f3-ipc.png";
		const result = await getFileHandler()({}, { fileRef: ref });

		expect(getFileData).toHaveBeenCalledTimes(1);
		expect(getFileData).toHaveBeenCalledWith({ fileRef: ref });
		expect(result).toEqual({ dataUrl: `data:image/png;base64,REF:${ref}`, contentType: "image/png" });
	});

	it("入参校验:非对象 / 缺 fileRef / 空串 / 纯空白 / 非字符串一律明确报错,不静默", async () => {
		registerMinimal();
		const handler = getFileHandler();
		await expect(handler({}, "nope")).rejects.toThrow("get-file requires an object argument");
		await expect(handler({}, null)).rejects.toThrow("get-file requires an object argument");
		await expect(handler({}, [])).rejects.toThrow("get-file requires an object argument");
		await expect(handler({}, {})).rejects.toThrow("fileRef must be a non-empty string");
		await expect(handler({}, { fileRef: "" })).rejects.toThrow("fileRef must be a non-empty string");
		await expect(handler({}, { fileRef: "   " })).rejects.toThrow("fileRef must be a non-empty string");
		await expect(handler({}, { fileRef: 42 })).rejects.toThrow("fileRef must be a non-empty string");
	});

	it("GET_FILE 是 invoke 频道(teardown 会注销,不留悬挂 handler)", () => {
		expect(WEKNORA_INVOKE_CHANNELS).toContain(WEKNORA_CHANNELS.GET_FILE);
		expect(WEKNORA_CHANNELS.GET_FILE).toBe("vetta:weknora:get-file");
	});
});
