// Copyright The Open Forge contributors.

import type { WeKnoraChunk } from "@preload/api";

/**
 * chunk 原文的渲染层取数口(T02;02-plan §2-6 模块 6,AC-14/AC-16)。
 *
 * 在 preload 合同 `window.vetta.weknora.getChunk` 外包一层模块级缓存:
 * - 并发去重:同一 chunkId 的在途请求共享同一个 Promise,连点角标不会打爆接口;
 * - 只缓存成功结果(D8):失败立即摘除,负结果绝不缓存,下次点击重新发起(可重试);
 * - 生命周期 = 窗口:模块级 Map,不落盘、不进 atom(store 数据零改动,D1)。
 *
 * 错误不在此加工:IPC 拒绝已携带主进程 errors.ts 归一化后的错误码(D7),
 * 消费方(引用弹层)用 errorCodeOf 提取码出 i18n 降级文案,不透出 raw。
 */

const chunkCache = new Map<string, Promise<WeKnoraChunk>>();

/** 按 chunkId 取 chunk 原文(带缓存);失败原样上抛且不缓存,调用方可重试。 */
export function getChunkById(chunkId: string): Promise<WeKnoraChunk> {
	const cached = chunkCache.get(chunkId);
	if (cached) return cached;
	const request = window.vetta.weknora.getChunk({ chunkId }).catch((error: unknown) => {
		// 失败不缓存负结果(AC-16/D8):先摘除再抛,让下一次调用重新发起请求。
		chunkCache.delete(chunkId);
		throw error;
	});
	chunkCache.set(chunkId, request);
	return request;
}
