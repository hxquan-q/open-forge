// Copyright The Open Forge contributors.
import type { ProviderBalanceErrorCode } from "../../../preload/api-types/models.js";

/** fetcher 归一化后的余额数据；字段缺省表示该家接口未给。 */
export interface BalanceData {
	currency?: string;
	available?: number;
	isAvailable?: boolean;
}

/**
 * fetcher 的结果。失败只回结构化错误码——原始错误体与请求头（含 Key）
 * 一律不向上冒泡（C2）。
 */
export type BalanceFetchOutcome = { ok: true; data: BalanceData } | { ok: false; errorCode: ProviderBalanceErrorCode };
