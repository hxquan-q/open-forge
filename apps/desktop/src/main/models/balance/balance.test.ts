// Copyright The Open Forge contributors.
import { describe, expect, it, vi } from "vitest";
import type { ProviderConfig } from "../model-settings-service.js";
import type { FetchImpl } from "../presets/fetch.js";
import { normalizeDeepSeekBalance, normalizeKimiBalance } from "./fetchers.js";
import { getProviderBalance } from "./index.js";
import { resolveBalanceProvider } from "./registry.js";

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		headers: { "content-type": "application/json" },
	});
}

// 仅用于断言「返回值/错误里不含 Key」，不落盘、不打印。
const DEEPSEEK_KEY = "sk-deepseek-secret-xyz";
const KIMI_KEY = "sk-kimi-secret-abc";

// 真实响应形态夹具（research/provider-usage-apis.md §4.1）：金额为字符串、可多币种。
const DEEPSEEK_BODY = {
	is_available: true,
	balance_infos: [{ currency: "CNY", total_balance: "110.00", granted_balance: "10.00", topped_up_balance: "100.00" }],
};

// 真实响应形态夹具（research §4.2）：金额为数字，外层 code/scode/status。
const KIMI_BODY = {
	code: 0,
	scode: "0x0",
	status: true,
	data: { available_balance: 42.5, voucher_balance: 12.5, cash_balance: 30 },
};

function provider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
	return { baseUrl: "https://api.deepseek.com", apiKey: DEEPSEEK_KEY, ...overrides };
}

describe("resolveBalanceProvider", () => {
	it("按预设 id 识别 deepseek / kimi", () => {
		expect(resolveBalanceProvider("deepseek", "https://api.deepseek.com")?.id).toBe("deepseek");
		expect(resolveBalanceProvider("kimi", "https://api.moonshot.ai/v1")?.id).toBe("kimi");
	});

	it("按 baseUrl 域名识别自定义 provider（ARK 留位，未实现）", () => {
		const ark = resolveBalanceProvider("ark-custom", "https://ark.cn-beijing.volces.com/api/v3");
		expect(ark?.id).toBe("ark");
		expect(ark?.supported).toBe(false);
	});

	it("未登记 provider 解析为空", () => {
		expect(resolveBalanceProvider("openai", "https://api.openai.com/v1")).toBeUndefined();
	});
});

describe("normalizeDeepSeekBalance", () => {
	it("归一化真实形态：多币种取主币种，金额字符串转数字", () => {
		expect(normalizeDeepSeekBalance(DEEPSEEK_BODY)).toEqual({
			ok: true,
			data: { currency: "CNY", available: 110, isAvailable: true },
		});
	});

	it("CNY 优先于响应顺序", () => {
		const outcome = normalizeDeepSeekBalance({
			is_available: false,
			balance_infos: [
				{ currency: "USD", total_balance: "3.50" },
				{ currency: "CNY", total_balance: "42.00" },
			],
		});
		expect(outcome).toEqual({ ok: true, data: { currency: "CNY", available: 42, isAvailable: false } });
	});

	it("非对象响应归为 invalid-response", () => {
		expect(normalizeDeepSeekBalance("nope")).toEqual({ ok: false, errorCode: "invalid-response" });
	});
});

describe("normalizeKimiBalance", () => {
	it("归一化真实形态：金额取 available_balance，币种按平台口径 CNY", () => {
		expect(normalizeKimiBalance(KIMI_BODY)).toEqual({
			ok: true,
			data: { currency: "CNY", available: 42.5, isAvailable: true },
		});
	});

	it("余额为 0 视为不可用", () => {
		expect(normalizeKimiBalance({ data: { available_balance: 0 } })).toEqual({
			ok: true,
			data: { currency: "CNY", available: 0, isAvailable: false },
		});
	});

	it("缺少 data 归为 invalid-response", () => {
		expect(normalizeKimiBalance({ code: 0 })).toEqual({ ok: false, errorCode: "invalid-response" });
	});
});

describe("getProviderBalance", () => {
	it("DeepSeek 命中真实端点，Key 只进请求头", async () => {
		const fetchImpl = vi.fn<FetchImpl>(async () => jsonResponse(DEEPSEEK_BODY));
		const result = await getProviderBalance("deepseek", provider(), { fetchImpl });
		expect(result).toEqual({
			provider: "deepseek",
			supported: true,
			currency: "CNY",
			available: 110,
			isAvailable: true,
		});
		const [url, init] = fetchImpl.mock.calls[0] ?? [];
		expect(url).toBe("https://api.deepseek.com/user/balance");
		expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${DEEPSEEK_KEY}`);
	});

	it("Kimi 命中 /v1/users/me/balance 端点", async () => {
		const fetchImpl = vi.fn<FetchImpl>(async () => jsonResponse(KIMI_BODY));
		const result = await getProviderBalance(
			"kimi",
			{ baseUrl: "https://api.moonshot.ai/v1", apiKey: KIMI_KEY },
			{ fetchImpl },
		);
		expect(result).toEqual({
			provider: "kimi",
			supported: true,
			currency: "CNY",
			available: 42.5,
			isAvailable: true,
		});
		const [url] = fetchImpl.mock.calls[0] ?? [];
		expect(url).toBe("https://api.moonshot.ai/v1/users/me/balance");
	});

	it("国内站按 baseUrl 派生 .cn 域名", async () => {
		const fetchImpl = vi.fn<FetchImpl>(async () => jsonResponse(KIMI_BODY));
		await getProviderBalance("kimi", { baseUrl: "https://api.moonshot.cn/v1", apiKey: KIMI_KEY }, { fetchImpl });
		const [url] = fetchImpl.mock.calls[0] ?? [];
		expect(url).toBe("https://api.moonshot.cn/v1/users/me/balance");
	});

	it("未支持 provider 返回 unsupported，不发请求", async () => {
		const fetchImpl = vi.fn<FetchImpl>();
		const result = await getProviderBalance(
			"openai",
			{ baseUrl: "https://api.openai.com/v1", apiKey: "sk-x" },
			{ fetchImpl },
		);
		expect(result).toEqual({ provider: "openai", supported: false, errorCode: "unsupported" });
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("ARK（留位）按域名识别后同样 unsupported，不发请求", async () => {
		const fetchImpl = vi.fn<FetchImpl>();
		const result = await getProviderBalance(
			"ark",
			{ baseUrl: "https://ark.cn-beijing.volces.com/api/v3", apiKey: "sk-x" },
			{ fetchImpl },
		);
		expect(result).toEqual({ provider: "ark", supported: false, errorCode: "unsupported" });
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("未配置 Key 返回 missing-key，不发请求", async () => {
		const fetchImpl = vi.fn<FetchImpl>();
		const result = await getProviderBalance("deepseek", { baseUrl: "https://api.deepseek.com" }, { fetchImpl });
		expect(result).toEqual({ provider: "deepseek", supported: true, errorCode: "missing-key" });
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("401 归为 unauthorized，不透出原始错误体", async () => {
		const fetchImpl = vi.fn<FetchImpl>(async () =>
			jsonResponse({ error: { message: `bad key ${DEEPSEEK_KEY}` } }, { status: 401 }),
		);
		const result = await getProviderBalance("deepseek", provider(), { fetchImpl });
		expect(result).toEqual({ provider: "deepseek", supported: true, errorCode: "unauthorized" });
	});

	it("超时归为 timeout", async () => {
		const fetchImpl = vi.fn<FetchImpl>(async () => {
			throw new DOMException("aborted", "AbortError");
		});
		const result = await getProviderBalance("deepseek", provider(), { fetchImpl });
		expect(result).toEqual({ provider: "deepseek", supported: true, errorCode: "timeout" });
	});

	it("网络失败归为 network", async () => {
		const fetchImpl = vi.fn<FetchImpl>(async () => {
			throw new TypeError("fetch failed: ECONNREFUSED");
		});
		const result = await getProviderBalance(
			"kimi",
			{ baseUrl: "https://api.moonshot.ai/v1", apiKey: KIMI_KEY },
			{ fetchImpl },
		);
		expect(result).toEqual({ provider: "kimi", supported: true, errorCode: "network" });
	});

	it("非 2xx（非鉴权）归为 http-status", async () => {
		const fetchImpl = vi.fn<FetchImpl>(async () => jsonResponse({}, { status: 500 }));
		const result = await getProviderBalance("deepseek", provider(), { fetchImpl });
		expect(result).toEqual({ provider: "deepseek", supported: true, errorCode: "http-status" });
	});

	it("响应体不是 JSON 归为 invalid-response", async () => {
		const fetchImpl = vi.fn<FetchImpl>(
			async () => new Response("<html>nope</html>", { status: 200, headers: { "content-type": "text/html" } }),
		);
		const result = await getProviderBalance("deepseek", provider(), { fetchImpl });
		expect(result).toEqual({ provider: "deepseek", supported: true, errorCode: "invalid-response" });
	});
});

describe("AC-3 Key 隔离", () => {
	it("成功与各类失败的返回值序列化后都不含 Key 任何片段", async () => {
		const scenarios: Array<() => Promise<unknown>> = [
			// 成功（DeepSeek / Kimi）
			async () => getProviderBalance("deepseek", provider(), { fetchImpl: async () => jsonResponse(DEEPSEEK_BODY) }),
			async () =>
				getProviderBalance(
					"kimi",
					{ baseUrl: "https://api.moonshot.ai/v1", apiKey: KIMI_KEY },
					{
						fetchImpl: async () => jsonResponse(KIMI_BODY),
					},
				),
			// 401 原始错误体里带 Key
			async () =>
				getProviderBalance("deepseek", provider(), {
					fetchImpl: async () => jsonResponse({ error: DEEPSEEK_KEY }, { status: 401 }),
				}),
			// 网络异常 message 里带 Key
			async () =>
				getProviderBalance("deepseek", provider(), {
					fetchImpl: async () => {
						throw new TypeError(`boom ${DEEPSEEK_KEY}`);
					},
				}),
			// 上游回显了 Key 的额外字段不得透传
			async () =>
				getProviderBalance(
					"kimi",
					{ baseUrl: "https://api.moonshot.ai/v1", apiKey: KIMI_KEY },
					{
						fetchImpl: async () => jsonResponse({ data: { available_balance: 1 }, echo: KIMI_KEY }),
					},
				),
		];
		for (const run of scenarios) {
			const serialized = JSON.stringify(await run());
			expect(serialized).not.toContain(DEEPSEEK_KEY);
			expect(serialized).not.toContain(KIMI_KEY);
			expect(serialized).not.toContain("secret");
			expect(serialized).not.toContain("sk-");
		}
	});
});
