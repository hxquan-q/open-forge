// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import type { DesktopApi, WeKnoraFileData } from "@preload/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ER-A·F2:fileClient 模块级缓存加**条目上限**(MAX_CACHE_ENTRIES),超限按插入序 FIFO
 * 淘汰最旧(Map 迭代序 = 插入序);在途 Promise 条目同样计入;失败摘除不占坑。
 * 缓存是模块级 Map,每个用例 resetModules 取全新模块,用例间互不渗透。假 IPC,无 Key(C1/C2)。
 */

interface Settlers {
	resolve: (value: WeKnoraFileData) => void;
	reject: (reason: Error) => void;
}

function installGetFile(): { getFile: ReturnType<typeof vi.fn>; settlers: Settlers[] } {
	const settlers: Settlers[] = [];
	const getFile = vi.fn((_input: { fileRef: string }) => {
		return new Promise<WeKnoraFileData>((resolve, reject) => settlers.push({ resolve, reject }));
	});
	Object.defineProperty(window, "vetta", {
		configurable: true,
		writable: true,
		value: { weknora: { getFile } } as unknown as DesktopApi,
	});
	return { getFile, settlers };
}

function file(dataUrl: string): WeKnoraFileData {
	return { dataUrl, contentType: "image/png" };
}

const ref = (i: number) => `minio://c/${i}.png`;
const url = (i: number) => `data:image/png;base64,${i}`;

beforeEach(() => {
	vi.resetModules();
});

describe("fileClient · 缓存条目上限与 FIFO 淘汰(ER-A·F2)", () => {
	it("填满上限后新增 → 淘汰最旧一条,其余条目仍命中不重发", async () => {
		const { getFile, settlers } = installGetFile();
		const { getFileData, MAX_CACHE_ENTRIES } = await import("./fileClient");

		// 依次请求 0..N-1 并全部成功:N 条成功缓存,最旧是 ref(0)。
		const first = Array.from({ length: MAX_CACHE_ENTRIES }, (_, i) => getFileData(ref(i)));
		for (let i = 0; i < MAX_CACHE_ENTRIES; i++) settlers[i]?.resolve(file(url(i)));
		await Promise.all(first);

		// 第 N+1 个 ref 触发 FIFO 淘汰最旧(ref(0))。
		const extra = getFileData(ref(MAX_CACHE_ENTRIES));
		settlers[MAX_CACHE_ENTRIES]?.resolve(file(url(MAX_CACHE_ENTRIES)));
		await extra;

		// 未被淘汰的旧条目仍命中:不新增 invoke。
		await expect(getFileData(ref(1))).resolves.toEqual(file(url(1)));
		await expect(getFileData(ref(MAX_CACHE_ENTRIES - 1))).resolves.toEqual(file(url(MAX_CACHE_ENTRIES - 1)));
		expect(getFile).toHaveBeenCalledTimes(MAX_CACHE_ENTRIES + 1);

		// 最旧条目已被淘汰:再取会重新 invoke。
		const again = getFileData(ref(0));
		expect(getFile).toHaveBeenCalledTimes(MAX_CACHE_ENTRIES + 2);
		settlers[MAX_CACHE_ENTRIES + 1]?.resolve(file(`${url(0)}-retry`));
		await expect(again).resolves.toEqual(file(`${url(0)}-retry`));
	});

	it("失败摘除不占坑:失败的 ref 不占用条目,补满前不触发淘汰", async () => {
		const { getFile, settlers } = installGetFile();
		const { getFileData, MAX_CACHE_ENTRIES } = await import("./fileClient");

		// 第 0 个失败(负结果立即摘除);1..N-1 成功 → 缓存里只有 N-1 条。
		const first = Array.from({ length: MAX_CACHE_ENTRIES }, (_, i) => getFileData(ref(i)).catch((e: unknown) => e));
		const failure = new Error("capability_missing");
		settlers[0]?.reject(failure);
		for (let i = 1; i < MAX_CACHE_ENTRIES; i++) settlers[i]?.resolve(file(url(i)));
		const outcomes = await Promise.all(first);
		expect(outcomes[0]).toBe(failure);

		// 补 1 条:N-1 + 1 = N,恰好未超限 → 最旧的成功条目 ref(1) 不被淘汰。
		const extra = getFileData(ref(MAX_CACHE_ENTRIES));
		settlers[MAX_CACHE_ENTRIES]?.resolve(file(url(MAX_CACHE_ENTRIES)));
		await extra;
		await expect(getFileData(ref(1))).resolves.toEqual(file(url(1)));
		expect(getFile).toHaveBeenCalledTimes(MAX_CACHE_ENTRIES + 1);

		// 再补 1 条才超限,此时才轮到淘汰 ref(1):再取 ref(1) 会重新 invoke。
		const extra2 = getFileData(ref(MAX_CACHE_ENTRIES + 1));
		settlers[MAX_CACHE_ENTRIES + 1]?.resolve(file(url(MAX_CACHE_ENTRIES + 1)));
		await extra2;
		const retry = getFileData(ref(1));
		expect(getFile).toHaveBeenCalledTimes(MAX_CACHE_ENTRIES + 3);
		settlers[MAX_CACHE_ENTRIES + 2]?.resolve(file(`${url(1)}-retry`));
		await expect(retry).resolves.toEqual(file(`${url(1)}-retry`));
	});

	it("在途 Promise 条目也计入上限:未落定时新增即淘汰最旧", async () => {
		const { getFile, settlers } = installGetFile();
		const { getFileData, MAX_CACHE_ENTRIES } = await import("./fileClient");

		// 全部在途(不落定),条目已计入上限;第 N+1 个请求立即触发对 ref(0) 的淘汰。
		const inFlight = Array.from({ length: MAX_CACHE_ENTRIES }, (_, i) => getFileData(ref(i)));
		const extra = getFileData(ref(MAX_CACHE_ENTRIES));
		expect(getFile).toHaveBeenCalledTimes(MAX_CACHE_ENTRIES + 1);

		for (let i = 0; i <= MAX_CACHE_ENTRIES; i++) settlers[i]?.resolve(file(url(i)));
		await Promise.all([...inFlight, extra]);

		// 先断言未被淘汰的 ref(1) 仍命中(不新增 invoke);再验被淘汰的 ref(0) 会重新 invoke。
		// 顺序不可颠倒:重取 ref(0) 会插入新条目并再淘汰一条,让 ref(1) 变成 miss。
		await expect(getFileData(ref(1))).resolves.toEqual(file(url(1)));
		expect(getFile).toHaveBeenCalledTimes(MAX_CACHE_ENTRIES + 1);

		const again = getFileData(ref(0));
		expect(getFile).toHaveBeenCalledTimes(MAX_CACHE_ENTRIES + 2);
		settlers[MAX_CACHE_ENTRIES + 1]?.resolve(file(`${url(0)}-retry`));
		await expect(again).resolves.toEqual(file(`${url(0)}-retry`));
	});
});
