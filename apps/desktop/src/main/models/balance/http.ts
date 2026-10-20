// Copyright The Open Forge contributors.
import type { ProviderBalanceErrorCode } from "../../../preload/api-types/models.js";
import type { FetchImpl } from "../presets/fetch.js";

/** 余额非秒级数据，10 秒足以覆盖跨境慢链路，又不至于让选型面板久等。 */
export const DEFAULT_BALANCE_TIMEOUT_MS = 10_000;

export type BalanceHttpResult = { ok: true; body: unknown } | { ok: false; errorCode: ProviderBalanceErrorCode };

/**
 * 带 Bearer 的 GET，只回结构化错误码。Key 仅出现在请求头，不写日志、不进返回值（C2）。
 *
 * 401/403 归为 unauthorized（Key 无效或过期），其余非 2xx 归为 http-status；
 * 两类都不透出原始错误体。超时（abort）与网络层失败分开归类。
 */
export async function requestBalanceJson(
	url: string,
	apiKey: string,
	fetchImpl: FetchImpl,
	timeoutMs: number = DEFAULT_BALANCE_TIMEOUT_MS,
): Promise<BalanceHttpResult> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetchImpl(url, {
			method: "GET",
			signal: controller.signal,
			headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
		});
		if (response.status === 401 || response.status === 403) return { ok: false, errorCode: "unauthorized" };
		if (!response.ok) return { ok: false, errorCode: "http-status" };
		try {
			return { ok: true, body: await response.json() };
		} catch {
			return { ok: false, errorCode: "invalid-response" };
		}
	} catch (error) {
		const aborted = (error as { name?: unknown } | null)?.name === "AbortError";
		return { ok: false, errorCode: aborted ? "timeout" : "network" };
	} finally {
		clearTimeout(timer);
	}
}
