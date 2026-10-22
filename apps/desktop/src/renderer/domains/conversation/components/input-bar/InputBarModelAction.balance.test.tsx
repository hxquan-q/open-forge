// @vitest-environment jsdom
// Copyright The Open Forge contributors.
// 验收直测（flow-tester）：AC-1 输入栏彻底移除余额。
// 渲染真实的 InputBarModelAction + ModelSelector（余额已成功取到），断言输入栏容器内
// 没有任何余额文本/图标/占位节点；余额只存在于弹出的选型面板（portal）里。
import { selectedModelAtom } from "@shared/store/atoms";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createInstance } from "i18next";
import { createStore, Provider } from "jotai";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import enCommon from "@/shared/i18n/locales/en/common.json";
import zhCommon from "@/shared/i18n/locales/zh/common.json";
import { clearProviderBalanceCache } from "../../hooks/useProviderBalance";
import { InputBarModelAction } from "./InputBarToolbar";

vi.mock("@vetta-org/theme-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@vetta-org/theme-sdk")>();
	return { ...actual, useThemeComponent: (_key: string, fallback: unknown) => fallback };
});

vi.mock("@shared/store/model-catalog", () => ({
	modelCatalog: { revalidate: vi.fn(async () => undefined) },
}));

vi.mock("@shared/components/ModelSelect/useModelOptions", () => {
	const option = {
		provider: "deepseek",
		modelId: "deepseek-chat",
		displayName: "DeepSeek Chat",
		key: "deepseek/deepseek-chat",
	};
	return {
		useModelOptions: () => ({
			options: [option],
			grouped: new Map([["deepseek", [option]]]),
			defaultKey: undefined,
			iconFor: () => undefined,
			labelFor: (provider: string) => provider,
		}),
	};
});

function installGetBalance(getBalance: (providerId: string) => Promise<unknown>): void {
	Object.defineProperty(window, "vetta", {
		configurable: true,
		writable: true,
		value: { models: { getBalance } },
	});
}

async function flush(): Promise<void> {
	await act(async () => {
		await Promise.resolve();
	});
}

async function renderAction(): Promise<{ container: HTMLElement }> {
	const i18n = createInstance();
	await i18n.init({
		lng: "zh",
		resources: { zh: { common: zhCommon }, en: { common: enCommon } },
		defaultNS: "common",
		interpolation: { escapeValue: false },
	});
	const store = createStore();
	store.set(selectedModelAtom, "deepseek/deepseek-chat");
	const { container } = render(
		<I18nextProvider i18n={i18n}>
			<Provider store={store}>
				<InputBarModelAction visible />
			</Provider>
		</I18nextProvider>,
	);
	return { container };
}

function balanceArtifacts(root: ParentNode): Element[] {
	const artifacts: Element[] = [];
	const balanceNode = root.querySelector('[data-testid="provider-balance"]');
	if (balanceNode) artifacts.push(balanceNode);
	for (const node of root.querySelectorAll('[class*="solar--eye"], [class*="solar--refresh"]')) {
		artifacts.push(node);
	}
	// 旧的常驻余额行至少会有点击刷新入口。
	for (const button of root.querySelectorAll("button")) {
		const name = `${button.getAttribute("aria-label") ?? ""} ${button.getAttribute("title") ?? ""}`;
		if (/余额|balance/i.test(name) && !button.closest('[role="menu"], [data-radix-popper-content-wrapper]')) {
			artifacts.push(button);
		}
	}
	return artifacts;
}

class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}

beforeEach(() => {
	localStorage.clear();
	clearProviderBalanceCache();
	vi.stubGlobal("ResizeObserver", ResizeObserverStub);
	HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
	cleanup();
	clearProviderBalanceCache();
	vi.unstubAllGlobals();
});

describe("AC-1 输入栏无余额痕迹", () => {
	it("余额已成功取到，输入栏触发器容器内仍无余额文本 / 图标 / 占位", async () => {
		const getBalance = vi.fn(async () => ({
			provider: "deepseek",
			supported: true,
			currency: "CNY",
			available: 42.5,
			isAvailable: true,
		}));
		installGetBalance(getBalance);

		const { container } = await renderAction();
		await flush();
		expect(getBalance).toHaveBeenCalledWith("deepseek");

		// 触发器容器：只有模型名，没有金额/余额节点。
		expect(container.querySelector('[data-testid="provider-balance"]')).toBeNull();
		expect(container.textContent).not.toMatch(/余额|Balance|¥|42\.50/);
		expect(balanceArtifacts(container)).toEqual([]);
		expect(screen.getByRole("button", { name: "DeepSeek Chat" })).toBeTruthy();
	});

	it("打开选型面板后余额只出现在面板里，输入栏容器保持干净", async () => {
		const getBalance = vi.fn(async () => ({
			provider: "deepseek",
			supported: true,
			currency: "CNY",
			available: 42.5,
			isAvailable: true,
		}));
		installGetBalance(getBalance);

		const { container } = await renderAction();
		await flush();

		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: "DeepSeek Chat" }));
		await screen.findByRole("searchbox", { name: "搜索模型或供应商" });

		// 余额区确实挂在面板（portal）里 —— 证明本用例不是空断言。
		const showButton = await screen.findByRole("button", { name: "显示余额" });
		expect(container.contains(showButton)).toBe(false);
		// 面板里的余额区不属于输入栏容器。
		expect(balanceArtifacts(container)).toEqual([]);
		expect(container.textContent).not.toMatch(/余额|Balance|¥|42\.50/);
	});
});
