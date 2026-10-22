// @vitest-environment jsdom
// Copyright The Open Forge contributors.
// 验收直测（flow-tester）：选型面板余额接线（AC-6/7/8/9）。
// store / catalog 夹具沿用 `useModelSelectorModel.test.tsx`；i18n 用真实 catalog 实例，
// 以便断言「宿主拼好的整段文本」而不是 mock 过的 key。
import { selectedModelAtom } from "@shared/store/atoms";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createInstance } from "i18next";
import { createStore, Provider } from "jotai";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import enCommon from "@/shared/i18n/locales/en/common.json";
import zhCommon from "@/shared/i18n/locales/zh/common.json";
import { clearProviderBalanceCache } from "../hooks/useProviderBalance";
import { ModelSelector } from "./ModelSelector";

vi.mock("@vetta-org/theme-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@vetta-org/theme-sdk")>();
	return { ...actual, useThemeComponent: (_key: string, fallback: unknown) => fallback };
});

vi.mock("@shared/store/model-catalog", () => ({
	modelCatalog: { revalidate: vi.fn(async () => undefined) },
}));

vi.mock("@shared/components/ModelSelect/useModelOptions", () => {
	const options = [
		{
			provider: "deepseek",
			modelId: "deepseek-chat",
			displayName: "DeepSeek Chat",
			key: "deepseek/deepseek-chat",
		},
		{
			provider: "kimi",
			modelId: "kimi-k2",
			displayName: "Kimi K2",
			key: "kimi/kimi-k2",
		},
	];
	return {
		useModelOptions: () => ({
			options,
			grouped: new Map([
				["deepseek", [options[0]]],
				["kimi", [options[1]]],
			]),
			defaultKey: undefined,
			iconFor: () => undefined,
			labelFor: (provider: string) => provider,
		}),
	};
});

const ZH = {
	show: "显示余额",
	hide: "隐藏余额",
	refresh: "刷新余额",
	search: "搜索模型或供应商",
	group: "deepseek",
	groupKimi: "kimi",
	trigger: "DeepSeek Chat",
	triggerKimi: "Kimi K2",
} as const;

const EN = {
	show: "Show balance",
	hide: "Hide balance",
	refresh: "Refresh balance",
	search: "Search models or providers",
	group: "deepseek",
	trigger: "DeepSeek Chat",
} as const;

const SUPPORTED = {
	provider: "deepseek",
	supported: true,
	currency: "CNY",
	available: 42.5,
	isAvailable: true,
} as const;

/** 用只含 models.getBalance 的桥覆盖基线桥面（与 useProviderBalance.test.tsx 同口径）。 */
function installGetBalance(getBalance: (providerId: string) => Promise<unknown>): void {
	Object.defineProperty(window, "vetta", {
		configurable: true,
		writable: true,
		value: { models: { getBalance } },
	});
}

/** 冲掉一次已 resolve 的 IPC promise 与其触发的 React 状态更新。 */
async function flush(): Promise<void> {
	await act(async () => {
		await Promise.resolve();
	});
}

async function renderSelector(
	locale: "zh" | "en",
	selectedModel: string | null = "deepseek/deepseek-chat",
): Promise<{ store: ReturnType<typeof createStore> }> {
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
				<ModelSelector />
			</Provider>
		</I18nextProvider>,
	);
	return { store };
}

async function openPanel(triggerName: string, searchPlaceholder: string): Promise<void> {
	const user = userEvent.setup();
	await user.click(screen.getByRole("button", { name: triggerName }));
	await screen.findByRole("searchbox", { name: searchPlaceholder });
}

function headerFor(label: string): HTMLElement {
	const header = screen.getByText(label).parentElement;
	if (!header) throw new Error(`找不到 ${label} 的分组标题行`);
	return header;
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

describe("AC-6 金额文本由宿主格式化并走 i18n 前缀", () => {
	it("zh：成功态揭示后显示「余额 ¥42.50」", async () => {
		const getBalance = vi.fn(async () => SUPPORTED);
		installGetBalance(getBalance);

		await renderSelector("zh");
		await flush();
		expect(getBalance).toHaveBeenCalledWith("deepseek");

		await openPanel(ZH.trigger, ZH.search);
		const header = headerFor(ZH.group);
		const user = userEvent.setup();
		await user.click(within(header).getByRole("button", { name: ZH.show }));

		expect(await within(header).findByText("余额 ¥42.50")).toBeTruthy();
		expect(within(header).getByRole("button", { name: ZH.refresh })).toBeTruthy();
		expect(within(header).getByRole("button", { name: ZH.hide })).toBeTruthy();
	});

	it("en：同一笔金额走 en 货币格式与英文前缀", async () => {
		const getBalance = vi.fn(async () => SUPPORTED);
		installGetBalance(getBalance);

		await renderSelector("en");
		await flush();

		await openPanel(EN.trigger, EN.search);
		const header = headerFor(EN.group);
		const user = userEvent.setup();
		await user.click(within(header).getByRole("button", { name: EN.show }));

		expect(await within(header).findByText("Balance CN¥42.50")).toBeTruthy();
	});
});

describe("AC-7 失败 / 不支持 / 无选中模型 → 余额零渲染", () => {
	it("errorCode → 面板标题行无余额按钮与文本", async () => {
		const getBalance = vi.fn(async () => ({ ...SUPPORTED, available: undefined, errorCode: "network" }));
		installGetBalance(getBalance);

		await renderSelector("zh");
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(1);

		await openPanel(ZH.trigger, ZH.search);
		const header = headerFor(ZH.group);
		expect(within(header).queryByRole("button", { name: ZH.show })).toBeNull();
		expect(within(header).queryByRole("button", { name: ZH.refresh })).toBeNull();
		expect(screen.queryByText(/余额/)).toBeNull();
	});

	it("supported:false → 面板标题行无余额节点（零空壳）", async () => {
		const getBalance = vi.fn(async () => ({ provider: "deepseek", supported: false }));
		installGetBalance(getBalance);

		await renderSelector("zh");
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(1);

		await openPanel(ZH.trigger, ZH.search);
		const header = headerFor(ZH.group);
		expect(within(header).queryByRole("button", { name: ZH.show })).toBeNull();
		expect(within(header).queryByRole("button", { name: ZH.hide })).toBeNull();
		expect(screen.queryByText(/余额/)).toBeNull();
	});

	it("无选中模型 → 不发余额请求，面板无余额节点", async () => {
		const getBalance = vi.fn(async () => SUPPORTED);
		installGetBalance(getBalance);

		await renderSelector("zh", null);
		await flush();
		expect(getBalance).not.toHaveBeenCalled();

		// 无选中模型时触发器显示占位文案。
		await openPanel("选择模型", ZH.search);
		expect(screen.queryByRole("button", { name: ZH.show })).toBeNull();
		expect(screen.queryByText(/余额/)).toBeNull();
	});
});

describe("AC-8 取数策略：挂载一次、打开尊重缓存、刷新绕过、揭示/隐藏不请求", () => {
	it("调用计数符合既有缓存策略", async () => {
		const getBalance = vi.fn(async () => SUPPORTED);
		installGetBalance(getBalance);

		await renderSelector("zh");
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(1);

		// 打开面板：60s 缓存内命中，不再打上游。
		await openPanel(ZH.trigger, ZH.search);
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(1);

		// 揭示 / 隐藏不产生额外请求。
		const header = headerFor(ZH.group);
		const user = userEvent.setup();
		await user.click(within(header).getByRole("button", { name: ZH.show }));
		await user.click(within(header).getByRole("button", { name: ZH.hide }));
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(1);

		// 手动刷新绕过缓存。
		await user.click(within(header).getByRole("button", { name: ZH.show }));
		await user.click(within(header).getByRole("button", { name: ZH.refresh }));
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(2);
	});
});

describe("AC-9 切换模型后余额跟随新 provider", () => {
	it("从 deepseek 切到 kimi → 请求 kimi，余额只出现在 kimi 分组且回到隐藏态", async () => {
		const getBalance = vi.fn(async (providerId: string) =>
			providerId === "kimi"
				? { provider: "kimi", supported: true, currency: "CNY", available: 100.5 }
				: SUPPORTED,
		);
		installGetBalance(getBalance);

		const { store } = await renderSelector("zh");
		await flush();
		await openPanel(ZH.trigger, ZH.search);

		const user = userEvent.setup();
		await user.click(within(headerFor(ZH.group)).getByRole("button", { name: ZH.show }));
		expect(await screen.findByText("余额 ¥42.50")).toBeTruthy();

		act(() => {
			store.set(selectedModelAtom, "kimi/kimi-k2");
		});
		await flush();
		await waitFor(() => expect(getBalance).toHaveBeenCalledWith("kimi"));

		await waitFor(() => expect(screen.queryByText("余额 ¥42.50")).toBeNull());
		const kimiHeader = headerFor(ZH.groupKimi);
		expect(within(kimiHeader).getByRole("button", { name: ZH.show })).toBeTruthy();
		expect(within(headerFor(ZH.group)).queryByRole("button", { name: ZH.show })).toBeNull();

		// 新 provider 的金额在揭示后才出现。
		await user.click(within(kimiHeader).getByRole("button", { name: ZH.show }));
		expect(await within(kimiHeader).findByText("余额 ¥100.50")).toBeTruthy();
	});
});
