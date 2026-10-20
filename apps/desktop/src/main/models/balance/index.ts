// Copyright The Open Forge contributors.
import { resolveNodeConfigurationValue } from "@vetta/runtime-node/host";
import type { ProviderBalanceResult } from "../../../preload/api-types/models.js";
import type { ProviderConfig } from "../model-settings-service.js";
import type { FetchImpl } from "../presets/fetch.js";
import { resolveBalanceProvider } from "./registry.js";

export type { ProviderBalanceErrorCode, ProviderBalanceResult } from "../../../preload/api-types/models.js";

export interface ProviderBalanceDeps {
	fetchImpl: FetchImpl;
	timeoutMs?: number;
}

/**
 * 主进程余额查询入口（IPC handler 背后唯一的业务实现）。
 *
 * Key 经既有 `model-credential-store` 在 `getConfig()` 阶段已解密并落到
 * `provider.apiKey`，这里只把它解析成明文放进请求头；返回值只含余额数字与
 * 结构化错误码，绝不回传 Key 或原始错误体（C2）。
 */
export async function getProviderBalance(
	providerId: string,
	provider: ProviderConfig | undefined,
	deps: ProviderBalanceDeps,
): Promise<ProviderBalanceResult> {
	const rule = resolveBalanceProvider(providerId, provider?.baseUrl);
	if (!rule || !rule.supported || !rule.fetch) {
		return { provider: providerId, supported: false, errorCode: "unsupported" };
	}
	if (!provider) return { provider: providerId, supported: true, errorCode: "missing-key" };
	if (!provider.baseUrl) return { provider: providerId, supported: true, errorCode: "missing-base-url" };
	const apiKey = provider.apiKey ? resolveNodeConfigurationValue(provider.apiKey) : undefined;
	if (!apiKey) return { provider: providerId, supported: true, errorCode: "missing-key" };
	const outcome = await rule.fetch(provider.baseUrl, apiKey, deps.fetchImpl, deps.timeoutMs);
	if (!outcome.ok) return { provider: providerId, supported: true, errorCode: outcome.errorCode };
	return { provider: providerId, supported: true, ...outcome.data };
}
