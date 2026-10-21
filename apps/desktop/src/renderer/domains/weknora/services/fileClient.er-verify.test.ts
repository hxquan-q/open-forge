// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import type { DesktopApi, WeKnoraFileData } from "@preload/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ER 轮独立复验（F2：fileClient 取图缓存 64 条上限 / FIFO 淘汰 / 身份守卫）。
 *
 * 独立角度（不照抄实现者用例）：
 * - 以「**调用序 == 插入序**」的手工放行 Promise 精确控制淘汰时刻；
 * - 65 条：第 1 条被淘汰、第 65 条仍命中；
 * - 恰好 64 条：不触发淘汰；
 * - 失败条目不占名额（失败后填满 64 条仍不淘汰最旧）+ 可重试；
 * - **身份守卫**：旧条目已被 FIFO 淘汰后，其失败回调**不得**误删同 ref 的新条目。
 *
 * 缓存是模块级 Map，每用例 resetModules 取全新模块；假 IPC，无 Key（C1/C2）。
 */

interface Settler {
	resolve: (value: WeKnoraFileData) => void;
	reject: (reason: Error) => void;
}

function installGetFile(): { getFile: ReturnType<typeof vi.fn>; settlers: Settler[] } {
	const settlers: Settler[] = [];
	const getFile = vi.fn(
		(_input: { fileRef: string }) =>
			new Promise<WeKnoraFileData>((resolve, reject) => settlers.push({ resolve, reject })),
	);
	Object.defineProperty(window, "vetta", {
		configurable: true,
		writable: true,
		value: { weknora: { getFile } } as unknown as DesktopApi,
	});
	return { getFile, settlers };
}

const ref = (i: number | string) => `minio://verify/${i}.png`;
const file = (i: number | string): WeKnoraFileData => ({
	dataUrl: `data:image/png;base64,V${i}`,
	contentType: "image/png",
});

beforeEach(() => {
	vi.resetModules();
});

describe("fileClient 缓存上限与 FIFO 淘汰 · ER 独立复验（F2）", () => {
	it("插入 65 条：第 1 条被 FIFO 淘汰、第 65 条仍命中缓存", async () => {
		const { getFile, settlers } = installGetFile();
		const { getFileData, MAX_CACHE_ENTRIES } = await import("./fileClient");
		expect(MAX_CACHE_ENTRIES).toBe(64);

		// 一次发起 MAX+1 条（全部在途），插入序 = 调用序。
		const all = Array.from({ length: MAX_CACHE_ENTRIES + 1 }, (_, i) => getFileData(ref(i)));
		expect(getFile).toHaveBeenCalledTimes(MAX_CACHE_ENTRIES + 1);
		for (let i = 0; i <= MAX_CACHE_ENTRIES; i += 1) settlers[i]?.resolve(file(i));
		await Promise.all(all);

		// 第 65 条（下标 64）仍在 → 命中，不新增 invoke。
		await expect(getFileData(ref(MAX_CACHE_ENTRIES))).resolves.toEqual(file(MAX_CACHE_ENTRIES));
		expect(getFile).toHaveBeenCalledTimes(MAX_CACHE_ENTRIES + 1);

		// 第 1 条（下标 0）已被淘汰 → 再取会重新 invoke。
		const retry = getFileData(ref(0));
		expect(getFile).toHaveBeenCalledTimes(MAX_CACHE_ENTRIES + 2);
		settlers[MAX_CACHE_ENTRIES + 1]?.resolve(file("0-retry"));
		await expect(retry).resolves.toEqual(file("0-retry"));
	});

	it("恰好 64 条：不触发淘汰，首尾条目均仍命中", async () => {
		const { getFile, settlers } = installGetFile();
		const { getFileData, MAX_CACHE_ENTRIES } = await import("./fileClient");

		const all = Array.from({ length: MAX_CACHE_ENTRIES }, (_, i) => getFileData(ref(i)));
		for (let i = 0; i < MAX_CACHE_ENTRIES; i += 1) settlers[i]?.resolve(file(i));
		await Promise.all(all);

		await expect(getFileData(ref(0))).resolves.toEqual(file(0));
		await expect(getFileData(ref(MAX_CACHE_ENTRIES - 1))).resolves.toEqual(file(MAX_CACHE_ENTRIES - 1));
		expect(getFile).toHaveBeenCalledTimes(MAX_CACHE_ENTRIES);
	});

	it("失败条目不占名额：失败后填满 64 条仍不淘汰最旧；失败 ref 可重试", async () => {
		const { getFile, settlers } = installGetFile();
		const { getFileData, MAX_CACHE_ENTRIES } = await import("./fileClient");

		// 1) 先失败一条：负结果应立即摘除，不占名额。
		const failed = getFileData(ref("x")).catch((error: unknown) => error);
		settlers[0]?.reject(new Error("capability_missing"));
		await expect(failed).resolves.toBeInstanceOf(Error);
		expect(getFile).toHaveBeenCalledTimes(1);

		// 2) 填满 MAX 条成功条目。若失败条目占位，总数会变 65 → 最旧 ref(0) 已被淘汰。
		const fill = Array.from({ length: MAX_CACHE_ENTRIES }, (_, i) => getFileData(ref(i)));
		for (let i = 0; i < MAX_CACHE_ENTRIES; i += 1) settlers[i + 1]?.resolve(file(i));
		await Promise.all(fill);

		// 最旧仍在 → 失败条目确实没占名额。
		await expect(getFileData(ref(0))).resolves.toEqual(file(0));
		expect(getFile).toHaveBeenCalledTimes(1 + MAX_CACHE_ENTRIES);

		// 3) 失败的 ref 可重试（重新 invoke）。
		const retry = getFileData(ref("x"));
		expect(getFile).toHaveBeenCalledTimes(1 + MAX_CACHE_ENTRIES + 1);
		settlers[1 + MAX_CACHE_ENTRIES]?.resolve(file("x-retry"));
		await expect(retry).resolves.toEqual(file("x-retry"));
	});

	it("身份守卫：旧条目被 FIFO 淘汰后其失败回调不得误删同 ref 的新条目", async () => {
		const { getFile, settlers } = installGetFile();
		const { getFileData, MAX_CACHE_ENTRIES } = await import("./fileClient");

		// 1) 插入 MAX 条在途条目（ref 0..63），最旧 = ref(0)。
		const first = Array.from({ length: MAX_CACHE_ENTRIES }, (_, i) => getFileData(ref(i)).catch((e: unknown) => e));
		expect(getFile).toHaveBeenCalledTimes(MAX_CACHE_ENTRIES);

		// 2) 再插 1 条 → 触发 FIFO 淘汰 ref(0)（其旧 Promise 仍在途 = settlers[0]）。
		const extra = getFileData(ref(MAX_CACHE_ENTRIES)).catch((e: unknown) => e);
		expect(getFile).toHaveBeenCalledTimes(MAX_CACHE_ENTRIES + 1);

		// 3) ref(0) 已被淘汰 → 重新请求，种下**新**条目（第 66 次调用 = settlers[65]）。
		const revived = getFileData(ref(0)).catch((e: unknown) => e);
		expect(getFile).toHaveBeenCalledTimes(MAX_CACHE_ENTRIES + 2);

		// 4) 旧 ref(0) 请求此刻才失败：守卫必须认身份，不得删掉新条目。
		const oldError = new Error("late failure");
		settlers[0]?.reject(oldError);

		// 新条目仍在缓存：再取 ref(0) 不新增 invoke（若被误删这里会多一次）。
		const stillCached = getFileData(ref(0));
		expect(getFile).toHaveBeenCalledTimes(MAX_CACHE_ENTRIES + 2);

		// 收尾：新条目与 extra 落定，且旧 Promise 确实以 oldError 失败。
		settlers[MAX_CACHE_ENTRIES]?.resolve(file("extra"));
		settlers[MAX_CACHE_ENTRIES + 1]?.resolve(file("0-new"));
		await expect(revived).resolves.toEqual(file("0-new"));
		await expect(stillCached).resolves.toEqual(file("0-new"));
		await expect(first[0]).resolves.toBe(oldError);
		await expect(extra).resolves.toEqual(file("extra"));
	});
});
