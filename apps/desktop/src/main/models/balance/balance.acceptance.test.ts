// Copyright The Open Forge contributors.
// 验收直测（flow-tester）：独立于实现者的 balance.test.ts，用调研文档 §4 的完整真实形态夹具，
// 覆盖 AC-1（两家归一化）、AC-2（未支持/失败降级）、AC-3（Key 隔离 + 正控）。
// 所有 Key 均为假值，仅用于断言「被使用过（请求头）」与「不泄漏（返回值）」；不落盘、不打印（C2）。
import { describe, expect, it, vi } from "vitest";
import type { ProviderConfig } from "../model-settings-service.js";
import type { FetchImpl } from "../presets/fetch.js";
import { getProviderBalance } from "./index.js";

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		headers: { "content-type": "application/json" },
	});
}

// 假 Key（非真实凭据）；字符串本身故意带 "sk-" 与 "secret" 片段，便于断言不泄漏。
const DEEPSEEK_KEY = "sk-fake-acceptance-deepseek-0001";
const KIMI_KEY = "sk-fake-acceptance-kimi-0002";

// research/provider-usage-apis.md §4.1 完整真实形态：金额为字符串，含赠送/充值字段。
const DEEPSEEK_BODY = {
	is_available: true,
	balance_infos: [{ currency: "CNY", total_balance: "88.80", granted_balance: "8.80", topped_up_balance: "80.00" }],
};

// research §4.2 完整真实形态：外层 code/scode/status，data 内三个余额字段。
const KIMI_BODY = {
	code: 0,
	scode: "0x0",
	status: true,
	data: { available_balance: 100.5, voucher_balance: 20.5, cash_balance: 80 },
};

function deepseekConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
	return { baseUrl: "https://api.deepseek.com", apiKey: DEEPSEEK_KEY, ...overrides };
}

describe("AC-1 两家成功态归一化（完整真实形态夹具）", () => {
	it("DeepSeek：取主币种 total_balance，多余字段不外泄", async () => {
		const result = await getProviderBalance("deepseek", deepseekConfig(), {
			fetchImpl: async () => jsonResponse(DEEPSEEK_BODY),
		});
		expect(result).toEqual({
			provider: "deepseek",
			supported: true,
			currency: "CNY",
			available: 88.8,
			isAvailable: true,
		});
		// 归一化契约只暴露 currency/available/isAvailable，不得夹带上游原始字段。
		expect(Object.keys(result).sort()).toEqual(["available", "currency", "isAvailable", "provider", "supported"]);
	});

	it("Kimi：取 available_balance，币种按平台口径 CNY", async () => {
		const result = await getProviderBalance(
			"kimi",
			{ baseUrl: "https://api.moonshot.ai/v1", apiKey: KIMI_KEY },
			{ fetchImpl: async () => jsonResponse(KIMI_BODY) },
		);
		expect(result).toEqual({
			provider: "kimi",
			supported: true,
			currency: "CNY",
			available: 100.5,
			isAvailable: true,
		});
	});

	it("DeepSeek 非 CNY 单币种：原样透出该币种（USD）", async () => {
		const result = await getProviderBalance("deepseek", deepseekConfig(), {
			fetchImpl: async () =>
				jsonResponse({
					is_available: true,
					balance_infos: [{ currency: "USD", total_balance: "12.34" }],
				}),
		});
		expect(result).toMatchObject({ supported: true, currency: "USD", available: 12.34, isAvailable: true });
	});
});

describe("AC-2 未支持 provider 与查询失败降级（只回结构化错误码）", () => {
	it("未登记 provider（anthropic）→ unsupported，不发请求", async () => {
		const fetchImpl = vi.fn<FetchImpl>();
		const result = await getProviderBalance(
			"anthropic",
			{ baseUrl: "https://api.anthropic.com", apiKey: "sk-fake-acceptance-anthropic-0003" },
			{ fetchImpl },
		);
		expect(result).toEqual({ provider: "anthropic", supported: false, errorCode: "unsupported" });
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("ARK（留位，仅域名识别）→ unsupported，不发请求", async () => {
		const fetchImpl = vi.fn<FetchImpl>();
		const result = await getProviderBalance(
			"my-ark",
			{ baseUrl: "https://ark.cn-beijing.volces.com/api/v3", apiKey: "sk-fake-acceptance-ark-0004" },
			{ fetchImpl },
		);
		expect(result).toEqual({ provider: "my-ark", supported: false, errorCode: "unsupported" });
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("各类失败只映射为结构化 errorCode，不透出上游原文", async () => {
		const cases: Array<{ name: string; fetchImpl: FetchImpl; errorCode: string }> = [
			{
				name: "401 unauthorized",
				fetchImpl: async () => jsonResponse({ error: "denied" }, { status: 401 }),
				errorCode: "unauthorized",
			},
			{
				name: "500 http-status",
				fetchImpl: async () => jsonResponse({ error: "oops" }, { status: 500 }),
				errorCode: "http-status",
			},
			{
				name: "超时 timeout",
				fetchImpl: async () => {
					throw new DOMException("aborted", "AbortError");
				},
				errorCode: "timeout",
			},
			{
				name: "网络 network",
				fetchImpl: async () => {
					throw new TypeError("fetch failed");
				},
				errorCode: "network",
			},
			{
				name: "非 JSON invalid-response",
				fetchImpl: async () => new Response("<html/>", { status: 200, headers: { "content-type": "text/html" } }),
				errorCode: "invalid-response",
			},
		];
		for (const scenario of cases) {
			const result = await getProviderBalance("deepseek", deepseekConfig(), { fetchImpl: scenario.fetchImpl });
			expect(result, scenario.name).toEqual({
				provider: "deepseek",
				supported: true,
				errorCode: scenario.errorCode,
			});
			expect(result.available, scenario.name).toBeUndefined();
		}
	});

	it("缺 Key → missing-key，不发请求", async () => {
		const fetchImpl = vi.fn<FetchImpl>();
		const result = await getProviderBalance("deepseek", { baseUrl: "https://api.deepseek.com" }, { fetchImpl });
		expect(result).toEqual({ provider: "deepseek", supported: true, errorCode: "missing-key" });
		expect(fetchImpl).not.toHaveBeenCalled();
	});
});

describe("AC-3 Key 隔离（含正控：Key 确实被用于请求头）", () => {
	it("正控：Key 出现在 Authorization 头；同时返回值序列化后不含任何 Key 片段", async () => {
		const fetchImpl = vi.fn<FetchImpl>(async () => jsonResponse(DEEPSEEK_BODY));
		const result = await getProviderBalance("deepseek", deepseekConfig(), { fetchImpl });

		// 正控——证明 Key 被真实读取并用于鉴权（否则「不泄漏」可能是「根本没用 Key」的假绿）。
		const [url, init] = fetchImpl.mock.calls[0] ?? [];
		expect(url).toBe("https://api.deepseek.com/user/balance");
		expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${DEEPSEEK_KEY}`);

		const serialized = JSON.stringify(result);
		expect(serialized).not.toContain(DEEPSEEK_KEY);
		expect(serialized).not.toContain("sk-");
		expect(serialized).not.toContain("secret");
	});

	it("失败路径（上游把 Key 回显进错误体 / 异常 message）也不泄漏", async () => {
		const fromBody = await getProviderBalance("deepseek", deepseekConfig(), {
			fetchImpl: async () => jsonResponse({ error: { message: DEEPSEEK_KEY } }, { status: 401 }),
		});
		expect(JSON.stringify(fromBody)).not.toContain(DEEPSEEK_KEY);

		const fromThrow = await getProviderBalance(
			"kimi",
			{ baseUrl: "https://api.moonshot.ai/v1", apiKey: KIMI_KEY },
			{
				fetchImpl: async () => {
					throw new TypeError(`network boom ${KIMI_KEY}`);
				},
			},
		);
		expect(JSON.stringify(fromThrow)).not.toContain(KIMI_KEY);
	});
});
