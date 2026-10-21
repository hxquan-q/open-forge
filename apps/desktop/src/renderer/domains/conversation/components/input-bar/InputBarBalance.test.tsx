// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { selectedModelAtom } from "@shared/store/atoms";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createInstance } from "i18next";
import { createStore } from "jotai";
import { Provider } from "jotai";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import enCommon from "@/shared/i18n/locales/en/common.json";
import zhCommon from "@/shared/i18n/locales/zh/common.json";
import { clearProviderBalanceCache } from "../../hooks/useProviderBalance";
import { formatBalanceValue, InputBarBalance } from "./InputBarBalance";

function installGetBalance(getBalance: (providerId: string) => Promise<unknown>): void {
	Object.defineProperty(window, "vetta", {
		configurable: true,
		writable: true,
		value: { models: { getBalance } },
	});
}

async function renderBalance(
	locale: "zh" | "en",
	selectedModel: string | null,
	props: { refreshTick?: number } = {},
): Promise<void> {
	const i18n = createInstance();
	await i18n.init({
		lng: locale,
		resources: { zh: { common: zhCommon }, en: { common: enCommon } },
		defaultNS: "common",
		interpolation: { escapeValue: false },
	});
	const store = createStore();
	store.set(selectedModelAtom, selectedModel);
	render(
		<I18nextProvider i18n={i18n}>
			<Provider store={store}>
				<InputBarBalance {...props} />
			</Provider>
		</I18nextProvider>,
	);
}

async function flush(): Promise<void> {
	await act(async () => {
		await Promise.resolve();
	});
}

beforeEach(() => {
	clearProviderBalanceCache();
});

afterEach(() => {
	cleanup();
	clearProviderBalanceCache();
});

describe("formatBalanceValue", () => {
	it("合法币种走 locale 货币格式；无币种/非法币种退回数字", () => {
		const expected = new Intl.NumberFormat("en", {
			style: "currency",
			currency: "USD",
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(1234.5);
		expect(formatBalanceValue(1234.5, "USD", "en")).toBe(expected);
		expect(formatBalanceValue(10, undefined, "en")).toBe("10.00");
		// 非 3 位字母的币种代码不走货币格式，退回「金额 + 代码」。
		expect(formatBalanceValue(10, "CNYX", "en")).toBe("10.00 CNYX");
	});
});

describe("InputBarBalance", () => {
	it("支持且成功 → 渲染一行「余额 <金额>」小字并带刷新入口", async () => {
		const getBalance = vi.fn(async () => ({ provider: "deepseek", supported: true, currency: "CNY", available: 42.5 }));
		installGetBalance(getBalance);

		await renderBalance("zh", "deepseek/deepseek-chat");

		const line = await screen.findByTestId("provider-balance");
		expect(line.textContent).toContain("余额");
		expect(line.textContent).toContain("¥42.50");
		expect(screen.getByRole("button", { name: "刷新余额" })).toBeTruthy();
	});

	it("未支持 provider → 零渲染（无余额节点、无空壳）", async () => {
		const getBalance = vi.fn(async () => ({ provider: "openai", supported: false }));
		installGetBalance(getBalance);

		await renderBalance("zh", "openai/gpt-5");
		await flush();

		expect(getBalance).toHaveBeenCalledTimes(1);
		expect(screen.queryByTestId("provider-balance")).toBeNull();
	});

	it("查询失败 → 零渲染（无余额节点、无降级文案）", async () => {
		const getBalance = vi.fn(async () => ({
			provider: "deepseek",
			supported: true,
			available: undefined,
			errorCode: "network",
		}));
		installGetBalance(getBalance);

		await renderBalance("zh", "deepseek/deepseek-chat");
		await flush();

		expect(getBalance).toHaveBeenCalledTimes(1);
		expect(screen.queryByTestId("provider-balance")).toBeNull();
	});

	it("数字与币种按界面语言本地化（zh 与 en 输出不同）", async () => {
		const getBalance = vi.fn(async () => ({ provider: "deepseek", supported: true, currency: "CNY", available: 42.5 }));
		installGetBalance(getBalance);

		await renderBalance("zh", "deepseek/deepseek-chat");
		const zhText = (await screen.findByTestId("provider-balance")).textContent ?? "";
		cleanup();

		clearProviderBalanceCache();
		await renderBalance("en", "deepseek/deepseek-chat");
		const enText = (await screen.findByTestId("provider-balance")).textContent ?? "";

		expect(zhText).toContain("余额");
		expect(enText).toContain("Balance");
		expect(zhText).toContain("42.50");
		expect(enText).toContain("42.50");
		expect(enText).not.toBe(zhText);
	});

	it("点刷新按钮触发一次手动刷新", async () => {
		const getBalance = vi.fn(async () => ({ provider: "deepseek", supported: true, currency: "CNY", available: 42.5 }));
		installGetBalance(getBalance);

		await renderBalance("zh", "deepseek/deepseek-chat");
		await screen.findByTestId("provider-balance");
		expect(getBalance).toHaveBeenCalledTimes(1);

		fireEvent.click(screen.getByRole("button", { name: "刷新余额" }));
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(2);
	});
});
