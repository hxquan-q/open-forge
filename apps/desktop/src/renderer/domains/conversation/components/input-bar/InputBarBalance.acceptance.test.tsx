// @vitest-environment jsdom
// Copyright The Open Forge contributors.
// 验收直测（flow-tester）：组件三态与本地化。独立于实现者的 InputBarBalance.test.tsx：
// 成功态补 Kimi（实现者只测了 DeepSeek）、零渲染用「整棵子树无文本」的强断言、
// 并显式验证失败/未支持态下刷新入口也不出现（零占位）。
import { selectedModelAtom } from "@shared/store/atoms";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createInstance } from "i18next";
import { createStore, Provider } from "jotai";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import enCommon from "@/shared/i18n/locales/en/common.json";
import zhCommon from "@/shared/i18n/locales/zh/common.json";
import { clearProviderBalanceCache } from "../../hooks/useProviderBalance";
import { InputBarBalance } from "./InputBarBalance";

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
): Promise<{ container: HTMLElement }> {
	const i18n = createInstance();
	await i18n.init({
		lng: locale,
		resources: { zh: { common: zhCommon }, en: { common: enCommon } },
		defaultNS: "common",
		interpolation: { escapeValue: false },
	});
	const store = createStore();
	store.set(selectedModelAtom, selectedModel);
	const { container } = render(
		<I18nextProvider i18n={i18n}>
			<Provider store={store}>
				<InputBarBalance {...props} />
			</Provider>
		</I18nextProvider>,
	);
	return { container };
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

describe("AC-1 支持且成功 → 显示金额 + 货币", () => {
	it("DeepSeek(CNY 42.5)→ 一行「余额 ¥42.50」", async () => {
		installGetBalance(vi.fn(async () => ({ provider: "deepseek", supported: true, currency: "CNY", available: 42.5 })));
		await renderBalance("zh", "deepseek/deepseek-chat");

		const line = await screen.findByTestId("provider-balance");
		expect(line.textContent).toContain("余额");
		expect(line.textContent).toContain("¥42.50");
	});

	it("Kimi(CNY 100.5)→ 显示金额与货币", async () => {
		installGetBalance(vi.fn(async () => ({ provider: "kimi", supported: true, currency: "CNY", available: 100.5 })));
		await renderBalance("zh", "kimi/kimi-k2");

		const line = await screen.findByTestId("provider-balance");
		expect(line.textContent).toContain("100.50");
		expect(line.textContent).toContain("¥");
	});

	it("数字/文案按界面语言本地化（zh 与 en 渲染不同）", async () => {
		installGetBalance(vi.fn(async () => ({ provider: "deepseek", supported: true, currency: "CNY", available: 42.5 })));
		await renderBalance("zh", "deepseek/deepseek-chat");
		const zhText = (await screen.findByTestId("provider-balance")).textContent ?? "";
		cleanup();
		clearProviderBalanceCache();

		installGetBalance(vi.fn(async () => ({ provider: "deepseek", supported: true, currency: "CNY", available: 42.5 })));
		await renderBalance("en", "deepseek/deepseek-chat");
		const enText = (await screen.findByTestId("provider-balance")).textContent ?? "";

		expect(zhText).toContain("余额");
		expect(enText).toContain("Balance");
		expect(zhText).toContain("42.50");
		expect(enText).toContain("42.50");
		expect(enText).not.toBe(zhText);
	});
});

describe("AC-2 未支持 / 失败 → 零渲染（无空壳、无降级文案、零占位）", () => {
	it("未支持 provider（openai / anthropic）→ 整棵子树无文本，无余额节点、无刷新入口", async () => {
		for (const [provider, modelKey] of [
			["openai", "openai/gpt-5"],
			["anthropic", "anthropic/claude-sonnet-4"],
		] as const) {
			const getBalance = vi.fn(async () => ({ provider, supported: false }));
			installGetBalance(getBalance);
			const { container } = await renderBalance("zh", modelKey);
			await flush();

			expect(getBalance, provider).toHaveBeenCalledTimes(1);
			expect(container.textContent, provider).toBe("");
			expect(container.querySelector('[data-testid="provider-balance"]'), provider).toBeNull();
			expect(screen.queryByRole("button"), provider).toBeNull();
			cleanup();
			clearProviderBalanceCache();
		}
	});

	it("查询失败（errorCode 或桥 reject）→ 零渲染，无降级文案、无重试占位", async () => {
		installGetBalance(vi.fn(async () => ({ provider: "deepseek", supported: true, errorCode: "network" })));
		const first = await renderBalance("zh", "deepseek/deepseek-chat");
		await flush();
		expect(first.container.textContent).toBe("");
		expect(screen.queryByRole("button")).toBeNull();
		cleanup();
		clearProviderBalanceCache();

		installGetBalance(
			vi.fn(async () => {
				throw new Error("ipc down");
			}),
		);
		const second = await renderBalance("zh", "deepseek/deepseek-chat");
		await flush();
		expect(second.container.textContent).toBe("");
	});

	it("无选中模型 → 零渲染，不发请求", async () => {
		const getBalance = vi.fn(async () => ({ provider: "deepseek", supported: true, currency: "CNY", available: 1 }));
		installGetBalance(getBalance);
		const { container } = await renderBalance("zh", null);
		await flush();
		expect(getBalance).not.toHaveBeenCalled();
		expect(container.textContent).toBe("");
	});
});

describe("AC-2/AC-4 手动刷新入口", () => {
	it("成功态下刷新入口可用（点击触发一次重取）", async () => {
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
