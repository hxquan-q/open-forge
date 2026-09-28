// Copyright The Open Forge contributors.
import { resolveNodeConfigurationHeaders, resolveNodeConfigurationValue } from "@vetta/runtime-node/host";
import type { ProviderConfig } from "./model-settings-service.js";

/**
 * 把 provider 的 baseUrl/apiKey/headers 解析成对 `GET {baseUrl}/models` 的请求描述。
 *
 * apiKey / headers 沿用 coding-agent 的解析规则（`!command` 执行、环境变量名、
 * 字面量）。是「从接口拉取」与「测试可用性」两条链路共享的唯一出口，保证两边
 * 发出的请求完全一致。
 */
export type ProviderModelsRequest =
	| { ok: true; url: string; headers: Record<string, string> }
	| { ok: false; error: "missing-base-url" | "invalid-base-url" };

export function resolveProviderModelsRequest(provider: ProviderConfig): ProviderModelsRequest {
	if (!provider.baseUrl) return { ok: false, error: "missing-base-url" };

	let url: string;
	try {
		url = `${new URL(provider.baseUrl).toString().replace(/\/$/, "")}/models`;
	} catch {
		return { ok: false, error: "invalid-base-url" };
	}

	const headers: Record<string, string> = { ...resolveNodeConfigurationHeaders(provider.headers) };
	if (provider.apiKey) {
		const key = resolveNodeConfigurationValue(provider.apiKey);
		if (key) headers.Authorization = `Bearer ${key}`;
	}
	return { ok: true, url, headers };
}

/** 兼容 OpenAI `{data:[{id}]}` 与 Ollama `/v1/models` 之外的 `{models:[{name}]}`。 */
export function parseModelIds(body: { data?: unknown; models?: unknown }): string[] {
	const list = Array.isArray(body.data) ? body.data : Array.isArray(body.models) ? body.models : [];
	const ids = list
		.map((item) => {
			if (typeof item === "string") return item;
			if (item && typeof item === "object") {
				const record = item as { id?: unknown; name?: unknown };
				if (typeof record.id === "string") return record.id;
				if (typeof record.name === "string") return record.name;
			}
			return "";
		})
		.filter(Boolean);
	return [...new Set(ids)].sort();
}
