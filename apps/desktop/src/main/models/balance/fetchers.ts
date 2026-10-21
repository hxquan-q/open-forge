// Copyright The Open Forge contributors.
import type { ProviderBalanceErrorCode } from "../../../preload/api-types/models.js";
import type { FetchImpl } from "../presets/fetch.js";
import { DEFAULT_BALANCE_TIMEOUT_MS, requestBalanceJson } from "./http.js";
import type { BalanceData, BalanceFetchOutcome } from "./types.js";

/** 把接口给的金额（字符串或数字）解析成 number；解析不出时缺省。 */
function toAmount(value: unknown): number | undefined {
	if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
	if (typeof value === "string") {
		const parsed = Number(value.trim());
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

function failure(errorCode: ProviderBalanceErrorCode): BalanceFetchOutcome {
	return { ok: false, errorCode };
}

function success(data: BalanceData): BalanceFetchOutcome {
	return { ok: true, data };
}

/** 以 baseUrl 的 origin 拼上游绝对路径；baseUrl 不可解析时回 undefined。 */
function buildUrl(baseUrl: string, path: string): string | undefined {
	try {
		return `${new URL(baseUrl).origin}${path}`;
	} catch {
		return undefined;
	}
}

// ─── DeepSeek：GET https://api.deepseek.com/user/balance ───
// 响应 { is_available, balance_infos:[{ currency, total_balance, ... }] }：金额为字符串、可多币种。

interface DeepSeekBalanceInfo {
	currency?: unknown;
	total_balance?: unknown;
}

/** 多币种取主币种：CNY 优先，否则取接口给出的第一个。 */
function pickPrimaryInfo(infos: DeepSeekBalanceInfo[]): DeepSeekBalanceInfo | undefined {
	return infos.find((info) => info.currency === "CNY") ?? infos[0];
}

export function normalizeDeepSeekBalance(body: unknown): BalanceFetchOutcome {
	if (typeof body !== "object" || body === null) return failure("invalid-response");
	const record = body as { is_available?: unknown; balance_infos?: unknown };
	const infos = Array.isArray(record.balance_infos) ? (record.balance_infos as DeepSeekBalanceInfo[]) : [];
	const info = pickPrimaryInfo(infos);
	const currency = typeof info?.currency === "string" ? info.currency : undefined;
	const available = toAmount(info?.total_balance);
	const isAvailable = typeof record.is_available === "boolean" ? record.is_available : undefined;
	return success({
		...(currency === undefined ? {} : { currency }),
		...(available === undefined ? {} : { available }),
		...(isAvailable === undefined ? {} : { isAvailable }),
	});
}

export async function fetchDeepSeekBalance(
	baseUrl: string,
	apiKey: string,
	fetchImpl: FetchImpl,
	timeoutMs: number = DEFAULT_BALANCE_TIMEOUT_MS,
): Promise<BalanceFetchOutcome> {
	const url = buildUrl(baseUrl, "/user/balance");
	if (!url) return failure("invalid-base-url");
	const result = await requestBalanceJson(url, apiKey, fetchImpl, timeoutMs);
	if (!result.ok) return failure(result.errorCode);
	return normalizeDeepSeekBalance(result.body);
}

// ─── Kimi / Moonshot：GET https://api.moonshot.{ai,cn}/v1/users/me/balance ───
// 响应 { code, scode, status, data:{ available_balance, voucher_balance, cash_balance } }：金额为数字。

export function normalizeKimiBalance(body: unknown): BalanceFetchOutcome {
	if (typeof body !== "object" || body === null) return failure("invalid-response");
	const data = (body as { data?: unknown }).data;
	if (typeof data !== "object" || data === null) return failure("invalid-response");
	const available = toAmount((data as { available_balance?: unknown }).available_balance);
	// Moonshot 余额以人民币计价，接口不回币种，按平台口径固定 CNY；
	// 无显式可用位，以「余额为正」近似 isAvailable。
	return success({
		currency: "CNY",
		...(available === undefined ? {} : { available }),
		...(available === undefined ? {} : { isAvailable: available > 0 }),
	});
}

export async function fetchKimiBalance(
	baseUrl: string,
	apiKey: string,
	fetchImpl: FetchImpl,
	timeoutMs: number = DEFAULT_BALANCE_TIMEOUT_MS,
): Promise<BalanceFetchOutcome> {
	const url = buildUrl(baseUrl, "/v1/users/me/balance");
	if (!url) return failure("invalid-base-url");
	const result = await requestBalanceJson(url, apiKey, fetchImpl, timeoutMs);
	if (!result.ok) return failure(result.errorCode);
	return normalizeKimiBalance(result.body);
}
