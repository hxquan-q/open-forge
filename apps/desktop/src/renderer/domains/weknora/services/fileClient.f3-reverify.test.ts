// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import type { DesktopApi, WeKnoraFileData } from "@preload/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * flow-tester 独立复验 · 渲染层取图缓存 `fileClient`(F3 v2 数据面第 4 层)。
 *
 * 与实现者组件用例的角度差异:直接以纯模块语义钉住 fileClient 的缓存合同——
 * 命中不重复 invoke、并发同 ref 共享单请求、失败不缓存负结果(可重试)、不同 ref 互不串台。
 * 缓存是模块级 Map,每个用例 resetModules 取全新模块,用例间互不渗透。假 IPC,无 Key(C1/C2)。
 */

interface Deferred {
	resolve: (value: WeKnoraFileData) => void;
	reject: (reason: Error) => void;
}

function file(dataUrl: string): WeKnoraFileData {
	return { dataUrl, contentType: "image/png" };
}

function installGetFile(): {
	getFile: ReturnType<typeof vi.fn>;
	calls: Array<{ fileRef: string }>;
	pending: Deferred[];
} {
	const calls: Array<{ fileRef: string }> = [];
	const pending: Deferred[] = [];
	const getFile = vi.fn((input: { fileRef: string }) => {
		calls.push({ fileRef: input.fileRef });
		return new Promise<WeKnoraFileData>((resolve, reject) => pending.push({ resolve, reject }));
	});
	Object.defineProperty(window, "vetta", {
		configurable: true,
		writable: true,
		value: { weknora: { getFile } } as unknown as DesktopApi,
	});
	return { getFile, calls, pending };
}

beforeEach(() => {
	vi.resetModules();
});

describe("fileClient 复验 · getFileData 模块级缓存(F3 v2)", () => {
	it("命中:同 ref 第二次调用不再 invoke,直接回放首次结果", async () => {
		const { getFile, calls, pending } = installGetFile();
		const { getFileData } = await import("./fileClient");

		const first = getFileData("minio://c/a.png");
		pending[0]?.resolve(file("data:image/png;base64,A"));
		await expect(first).resolves.toEqual(file("data:image/png;base64,A"));

		await expect(getFileData("minio://c/a.png")).resolves.toEqual(file("data:image/png;base64,A"));
		expect(getFile).toHaveBeenCalledTimes(1);
		expect(calls).toEqual([{ fileRef: "minio://c/a.png" }]);
	});

	it("并发:同 ref 的并发调用共享同一在途请求,只发一次 invoke(同 chunk 多图不重发)", async () => {
		const { getFile, pending } = installGetFile();
		const { getFileData } = await import("./fileClient");

		const a = getFileData("minio://c/a.png");
		const b = getFileData("minio://c/a.png");
		pending[0]?.resolve(file("data:image/png;base64,A"));
		expect(await Promise.all([a, b])).toEqual([file("data:image/png;base64,A"), file("data:image/png;base64,A")]);
		expect(getFile).toHaveBeenCalledTimes(1);
	});

	it("失败:负结果不缓存,拒绝原样上抛,下次调用重新 invoke(可重试)", async () => {
		const { getFile, pending } = installGetFile();
		const { getFileData } = await import("./fileClient");

		const first = getFileData("minio://c/a.png");
		const failure = new Error("capability_missing");
		pending[0]?.reject(failure);
		await expect(first).rejects.toBe(failure);

		const retry = getFileData("minio://c/a.png");
		expect(getFile).toHaveBeenCalledTimes(2);
		pending[1]?.resolve(file("data:image/png;base64,B"));
		await expect(retry).resolves.toEqual(file("data:image/png;base64,B"));
	});

	it("隔离:不同 ref 各自请求、各自缓存,互不串台", async () => {
		const { getFile, pending } = installGetFile();
		const { getFileData } = await import("./fileClient");

		const a = getFileData("minio://c/a.png");
		const b = getFileData("minio://c/b.png");
		pending[0]?.resolve(file("data:image/png;base64,A"));
		pending[1]?.resolve(file("data:image/png;base64,B"));
		expect(await Promise.all([a, b])).toEqual([file("data:image/png;base64,A"), file("data:image/png;base64,B")]);

		await expect(getFileData("minio://c/b.png")).resolves.toEqual(file("data:image/png;base64,B"));
		await expect(getFileData("minio://c/a.png")).resolves.toEqual(file("data:image/png;base64,A"));
		expect(getFile).toHaveBeenCalledTimes(2);
	});
});
