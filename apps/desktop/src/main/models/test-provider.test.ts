// Copyright The Open Forge contributors.
import { describe, expect, it, vi } from "vitest";
import type { ProviderConfig } from "./model-settings-service.js";
import type { FetchImpl } from "./presets/fetch.js";
import { testProviderAvailability } from "./test-provider.js";

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		headers: { "content-type": "application/json" },
	});
}

function provider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
	return { baseUrl: "http://relay.local:8317/v1", apiKey: "sk-test", ...overrides };
}

describe("testProviderAvailability", () => {
	it("未知服务商直接失败，不发出任何请求", async () => {
		const fetchImpl = vi.fn();
		const result = await testProviderAvailability(undefined, { fetchImpl });
		expect(result).toEqual({ ok: false, error: "unknown-provider" });
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("缺 baseUrl 时返回 missing-base-url", async () => {
		const result = await testProviderAvailability(provider({ baseUrl: undefined }), {
			fetchImpl: vi.fn(),
		});
		expect(result).toEqual({ ok: false, error: "missing-base-url" });
	});

	it("baseUrl 无法解析时返回 invalid-base-url", async () => {
		const result = await testProviderAvailability(provider({ baseUrl: "not a url" }), {
			fetchImpl: vi.fn(),
		});
		expect(result).toEqual({ ok: false, error: "invalid-base-url" });
	});

	it("请求的是 {baseUrl}/models 并带上解析后的 Authorization 与自定义 headers", async () => {
		const fetchImpl = vi.fn<FetchImpl>(async () => jsonResponse({ data: [{ id: "m1" }] }));
		await testProviderAvailability(provider({ apiKey: "sk-live", headers: { "X-Tenant": "acme" } }), { fetchImpl });
		const [url, init] = fetchImpl.mock.calls[0] ?? [];
		expect(url).toBe("http://relay.local:8317/v1/models");
		expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer sk-live");
		expect((init?.headers as Record<string, string>)["X-Tenant"]).toBe("acme");
	});

	it("2xx 响应视为可用，报告延迟与解析出的模型数", async () => {
		const now = vi.fn().mockReturnValueOnce(1000).mockReturnValue(1230);
		const result = await testProviderAvailability(provider(), {
			fetchImpl: async () => jsonResponse({ data: [{ id: "a" }, { id: "b" }] }),
			now,
		});
		expect(result).toEqual({ ok: true, latencyMs: 230, modelCount: 2 });
	});

	it("HTTP 错误（如 key 失效的 401）保留状态码，不算网络失败", async () => {
		const result = await testProviderAvailability(provider(), {
			fetchImpl: async () => jsonResponse({ error: "bad key" }, { status: 401 }),
			now: () => 0,
		});
		expect(result).toEqual({ ok: false, status: 401, latencyMs: 0 });
	});

	it("abort 归类为 timeout", async () => {
		const result = await testProviderAvailability(provider(), {
			fetchImpl: async () => {
				throw new DOMException("aborted", "AbortError");
			},
		});
		expect(result.ok).toBe(false);
		expect(result.error).toBe("timeout");
	});

	it("网络层失败归类为 network，detail 保留原始信息供排查", async () => {
		const result = await testProviderAvailability(provider(), {
			fetchImpl: async () => {
				throw new TypeError("fetch failed: ECONNREFUSED");
			},
		});
		expect(result.ok).toBe(false);
		expect(result.error).toBe("network");
		expect(result.detail).toContain("ECONNREFUSED");
	});
});
