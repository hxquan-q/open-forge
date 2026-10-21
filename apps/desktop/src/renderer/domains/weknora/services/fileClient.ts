// Copyright The Open Forge contributors.

import type { WeKnoraFileData } from "@preload/api";

/**
 * 内嵌图片的渲染层取数口（F3 v2；07-acceptance-fixes.md）。
 *
 * 在 preload 合同 `window.vetta.weknora.getFile` 外包一层模块级缓存，与 `chunkClient` 同款：
 * - 并发去重：同一 `minio://…` ref 的在途请求共享同一个 Promise（同一 chunk 多图/重开不重发）；
 * - 只缓存成功结果：失败立即摘除，下次渲染重新发起（可重试）；
 * - 生命周期 = 窗口：模块级 Map，不落盘、不进 atom（store 数据零改动，D1）。
 *
 * 与 chunkClient 分文件：那边取 chunk 原文（文本），这边取图片字节（data URL），是两个资源。
 */

const fileCache = new Map<string, Promise<WeKnoraFileData>>();

/** 按 `minio://…` ref 取回图片（带缓存）；失败原样上抛且不缓存，调用方可重试。 */
export function getFileData(fileRef: string): Promise<WeKnoraFileData> {
	const cached = fileCache.get(fileRef);
	if (cached) return cached;
	const request = window.vetta.weknora.getFile({ fileRef }).catch((error: unknown) => {
		// 失败不缓存负结果：先摘除再抛，让下一次渲染重新发起请求。
		fileCache.delete(fileRef);
		throw error;
	});
	fileCache.set(fileRef, request);
	return request;
}
