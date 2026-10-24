// Copyright The Open Forge contributors.
import { writeFileSync } from "node:fs";

const DEFAULT_TIMEOUT_MS = 180_000;

/** 把 URL 下载到本地文件；非 2xx 或超时抛错，由调用方决定是否换下一个源。 */
export async function downloadToFile(
	url: string,
	dest: string,
	timeoutMs = DEFAULT_TIMEOUT_MS,
	signal?: AbortSignal,
): Promise<void> {
	const controller = new AbortController();
	const combinedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		combinedSignal.throwIfAborted();
		const res = await fetch(url, { signal: combinedSignal, redirect: "follow" });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const body = Buffer.from(await res.arrayBuffer());
		combinedSignal.throwIfAborted();
		writeFileSync(dest, body);
	} finally {
		clearTimeout(timer);
	}
}
