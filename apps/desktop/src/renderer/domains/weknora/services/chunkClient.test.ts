// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import type { DesktopApi, WeKnoraChunk } from "@preload/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * chunk 原文渲染层缓存(T02;AC-16/D8):命中不重复 invoke、并发同 id 共享单请求、
 * 失败不缓存负结果(可重试)。缓存是模块级 Map,每个用例用 resetModules 取全新模块,
 * 用例间互不渗透;getChunk 假 IPC 手动 resolve/reject,精确控制时序。
 */

interface Deferred {
	resolve: (value: WeKnoraChunk) => void;
	reject: (reason: Error) => void;
}

function chunk(content: string): WeKnoraChunk {
	return { content, knowledgeId: "k-1", kbId: "kb-1" };
}

/** 装一个可控的 getChunk 假 IPC:记录调用、返回手动推进的 Promise。 */
function installGetChunk(): {
	getChunk: ReturnType<typeof vi.fn>;
	calls: Array<{ chunkId: string }>;
	pending: Deferred[];
} {
	const calls: Array<{ chunkId: string }> = [];
	const pending: Deferred[] = [];
	const getChunk = vi.fn((input: { chunkId: string }) => {
		calls.push({ chunkId: input.chunkId });
		return new Promise<WeKnoraChunk>((resolve, reject) => {
			pending.push({ resolve, reject });
		});
	});
	Object.defineProperty(window, "vetta", {
		configurable: true,
		writable: true,
		value: { weknora: { getChunk } } as unknown as DesktopApi,
	});
	return { getChunk, calls, pending };
}

beforeEach(() => {
	vi.resetModules();
});

describe("chunkClient · getChunkById(模块级缓存)", () => {
	it("命中:同 id 第二次调用不再 invoke,直接回放首次结果(AC-16)", async () => {
		const { getChunk, calls, pending } = installGetChunk();
		const { getChunkById } = await import("./chunkClient");

		const first = getChunkById("c1");
		pending[0]?.resolve(chunk("原文A"));
		await expect(first).resolves.toEqual(chunk("原文A"));

		await expect(getChunkById("c1")).resolves.toEqual(chunk("原文A"));

		expect(getChunk).toHaveBeenCalledTimes(1);
		expect(calls).toEqual([{ chunkId: "c1" }]);
	});

	it("并发:同 id 的并发调用共享同一个在途请求,只发一次 invoke(AC-16)", async () => {
		const { getChunk, pending } = installGetChunk();
		const { getChunkById } = await import("./chunkClient");

		const a = getChunkById("c1");
		const b = getChunkById("c1");
		const c = getChunkById("c1");

		pending[0]?.resolve(chunk("原文A"));
		expect(await Promise.all([a, b, c])).toEqual([chunk("原文A"), chunk("原文A"), chunk("原文A")]);
		expect(getChunk).toHaveBeenCalledTimes(1);
	});

	it("失败:负结果不缓存,拒绝原样上抛,下次调用重新 invoke(D8 可重试)", async () => {
		const { getChunk, pending } = installGetChunk();
		const { getChunkById } = await import("./chunkClient");

		const first = getChunkById("c1");
		const failure = new Error("capability_missing");
		pending[0]?.reject(failure);
		await expect(first).rejects.toBe(failure);

		const retry = getChunkById("c1");
		expect(getChunk).toHaveBeenCalledTimes(2);
		pending[1]?.resolve(chunk("恢复"));
		await expect(retry).resolves.toEqual(chunk("恢复"));
	});

	it("隔离:不同 id 各自请求、各自缓存,互不串台", async () => {
		const { getChunk, calls, pending } = installGetChunk();
		const { getChunkById } = await import("./chunkClient");

		const a = getChunkById("c1");
		const b = getChunkById("c2");
		pending[0]?.resolve(chunk("A"));
		pending[1]?.resolve(chunk("B"));
		expect(await Promise.all([a, b])).toEqual([chunk("A"), chunk("B")]);
		expect(calls).toEqual([{ chunkId: "c1" }, { chunkId: "c2" }]);

		await expect(getChunkById("c2")).resolves.toEqual(chunk("B"));
		await expect(getChunkById("c1")).resolves.toEqual(chunk("A"));
		expect(getChunk).toHaveBeenCalledTimes(2);
	});
});
