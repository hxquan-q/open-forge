// Copyright The Open Forge contributors.

import type { WeKnoraFileData } from "@preload/api";

/**
 * 内嵌图片的渲染层取数口（F3 v2；07-acceptance-fixes.md）。
 *
 * 在 preload 合同 `window.vetta.weknora.getFile` 外包一层模块级缓存，与 `chunkClient` 同款：
 * - 并发去重：同一 `minio://…` ref 的在途请求共享同一个 Promise（同一 chunk 多图/重开不重发）；
 * - 只缓存成功结果：失败立即摘除，下次渲染重新发起（可重试）；
 * - 条目上限（ER-A·F2）：最多 `MAX_CACHE_ENTRIES` 条，超限按插入序 FIFO 淘汰最旧——
 *   data URL 常驻内存，长会话浏览大量引用图会无限增长；
 * - 生命周期 = 窗口：模块级 Map，不落盘、不进 atom（store 数据零改动，D1）。
 *
 * 与 chunkClient 分文件：那边取 chunk 原文（文本），这边取图片字节（data URL），是两个资源。
 */

const fileCache = new Map<string, Promise<WeKnoraFileData>>();

/**
 * 缓存条目上限（ER-A·F2）：防长会话浏览大量引用图（data URL 常驻内存）无限增长。
 * 在途 Promise 条目同样计入（Map 迭代序 = 插入序，超限删第一个键即淘汰最旧）。
 * 明确不做 LRU / 字节预算：B 端内部工具口径，条目数上限已够用。
 */
export const MAX_CACHE_ENTRIES = 64;

/** 按 `minio://…` ref 取回图片（带缓存）；失败原样上抛且不缓存，调用方可重试。 */
export function getFileData(fileRef: string): Promise<WeKnoraFileData> {
	const cached = fileCache.get(fileRef);
	if (cached) return cached;
	const request = window.vetta.weknora.getFile({ fileRef }).catch((error: unknown) => {
		// 失败不缓存负结果：先摘除再抛，让下一次渲染重新发起请求。
		// 只摘除自己种下的那条：本条目可能已被上限 FIFO 淘汰、ref 又来了新请求，别误删新条目。
		if (fileCache.get(fileRef) === request) fileCache.delete(fileRef);
		throw error;
	});
	fileCache.set(fileRef, request);
	// 超限淘汰最旧条目（Map 迭代序 = 插入序）。
	while (fileCache.size > MAX_CACHE_ENTRIES) {
		const oldest = fileCache.keys().next();
		if (oldest.done) break;
		fileCache.delete(oldest.value);
	}
	return request;
}
