// Copyright The Open Forge contributors.
import type { FetchImpl } from "../presets/fetch.js";
import { fetchDeepSeekBalance, fetchKimiBalance } from "./fetchers.js";
import type { BalanceFetchOutcome } from "./types.js";

export type BalanceFetcher = (
	baseUrl: string,
	apiKey: string,
	fetchImpl: FetchImpl,
	timeoutMs?: number,
) => Promise<BalanceFetchOutcome>;

export interface BalanceProviderRule {
	/** 规范化 provider 标识，用于日志/调试与测试断言。 */
	readonly id: string;
	/** false = 预留位（ARK），识别到也按 unsupported 静默降级。 */
	readonly supported: boolean;
	/** 内置预设 id 命中（如 deepseek / kimi）；ARK 无预设 id 故缺省。 */
	readonly matchesId?: string;
	/** baseUrl 域名命中，覆盖自定义 provider（如 ARK 的 *.volces.com）。 */
	readonly matchesHost: (host: string) => boolean;
	readonly fetch?: BalanceFetcher;
}

/**
 * 余额能力注册表。按 provider id 优先、baseUrl 域名兜底识别——ARK 不在内置预设，
 * 只能按域名认；识别到但未实现的（supported=false）统一走 unsupported 静默降级。
 */
const RULES: readonly BalanceProviderRule[] = [
	{
		id: "deepseek",
		supported: true,
		matchesId: "deepseek",
		matchesHost: (host) => host === "api.deepseek.com" || host.endsWith(".deepseek.com"),
		fetch: fetchDeepSeekBalance,
	},
	{
		id: "kimi",
		supported: true,
		matchesId: "kimi",
		matchesHost: (host) =>
			/^api\.moonshot\.(ai|cn)$/.test(host) || host.endsWith(".moonshot.ai") || host.endsWith(".moonshot.cn"),
		fetch: fetchKimiBalance,
	},
	{
		// ARK 留位：用量/套餐走火山控制面 V4 鉴权（SSO/AK-SK），API Key 能否直调待实测，
		// 首期不实现；识别到只回 unsupported。
		id: "ark",
		supported: false,
		matchesHost: (host) => host.endsWith(".volces.com"),
	},
];

export function resolveBalanceProvider(providerId: string, baseUrl?: string): BalanceProviderRule | undefined {
	const byId = RULES.find((rule) => rule.matchesId === providerId);
	if (byId) return byId;
	const host = hostOf(baseUrl);
	if (!host) return undefined;
	return RULES.find((rule) => rule.matchesHost(host));
}

function hostOf(baseUrl?: string): string | undefined {
	if (!baseUrl) return undefined;
	try {
		return new URL(baseUrl).hostname;
	} catch {
		return undefined;
	}
}
