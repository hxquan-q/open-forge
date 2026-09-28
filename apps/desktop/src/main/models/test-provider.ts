// Copyright The Open Forge contributors.
import type { ProviderTestErrorCode, ProviderTestResult } from "../../preload/api-types/models.js";
import type { ProviderConfig } from "./model-settings-service.js";
import type { FetchImpl } from "./presets/fetch.js";
import { parseModelIds, resolveProviderModelsRequest } from "./provider-request.js";

export type { ProviderTestErrorCode, ProviderTestResult };

/**
 * 自定义服务商可用性测试（设置页「测试可用性」按钮背后的主进程实现）。
 *
 * 对标 ccswitch / sub2api 一类中继工具的轻量测速：向 `GET {baseUrl}/models`
 * 发一次真实请求，区分「主机不可达 / 超时 / HTTP 错误 / 正常」并报告延迟。
 * 选 /models 而不是裸 origin，是因为这一步同时验证 baseUrl 路径与 API Key
 * 是否有效——中继网关经常主机活着但 key 失效，只看连通性会误判可用。
 *
 * 请求构造与「从接口拉取」共用 `resolveProviderModelsRequest`，两条链路
 * 发出的请求一致。
 *
 * 返回结构化错误码而非文案：面向用户的文案由渲染层按 i18n 生成，
 * `detail` 只保留未翻译的原始信息供排查。
 */
export interface ProviderTestDeps {
	fetchImpl: FetchImpl;
	/** 默认 10 秒：本地/局域网服务几乎瞬时返回，云端中转也已足够。 */
	timeoutMs?: number;
	now?: () => number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export async function testProviderAvailability(
	provider: ProviderConfig | undefined,
	deps: ProviderTestDeps,
): Promise<ProviderTestResult> {
	if (!provider) return { ok: false, error: "unknown-provider" };
	const request = resolveProviderModelsRequest(provider);
	if (!request.ok) return { ok: false, error: request.error };

	const now = deps.now ?? (() => Date.now());
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
	const started = now();
	try {
		const res = await deps.fetchImpl(request.url, {
			method: "GET",
			headers: request.headers,
			signal: controller.signal,
		});
		const latencyMs = Math.max(0, Math.round(now() - started));
		if (!res.ok) return { ok: false, status: res.status, latencyMs };
		let modelCount: number | undefined;
		try {
			const body = (await res.json()) as { data?: unknown; models?: unknown };
			modelCount = parseModelIds(body).length;
		} catch {
			// 非 JSON 响应：主机已应答且状态正常，可用性成立，只是拿不到模型数。
		}
		return { ok: true, latencyMs, ...(modelCount === undefined ? {} : { modelCount }) };
	} catch (err) {
		const latencyMs = Math.max(0, Math.round(now() - started));
		const aborted = (err as { name?: unknown } | null)?.name === "AbortError";
		return {
			ok: false,
			error: aborted ? "timeout" : "network",
			latencyMs,
			detail: err instanceof Error ? err.message : String(err),
		};
	} finally {
		clearTimeout(timer);
	}
}
