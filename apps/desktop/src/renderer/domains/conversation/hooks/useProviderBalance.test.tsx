// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { selectedModelAtom } from "@shared/store/atoms";
import { act, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	clearProviderBalanceCache,
	parseProviderFromModelKey,
	PROVIDER_BALANCE_CACHE_TTL_MS,
	useProviderBalance,
} from "./useProviderBalance";

/** 用只含 models.getBalance 的桥覆盖基线桥面：本 hook 只触达这一个 IPC。 */
function installGetBalance(getBalance: (providerId: string) => Promise<unknown>): void {
	Object.defineProperty(window, "vetta", {
		configurable: true,
		writable: true,
		value: { models: { getBalance } },
	});
}

function supported(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return { provider: "deepseek", supported: true, currency: "CNY", available: 42.5, isAvailable: true, ...overrides };
}

/** 冲掉一次已 resolve 的 IPC promise 与其触发的 React 状态更新。 */
async function flush(): Promise<void> {
	await act(async () => {
		await Promise.resolve();
	});
}

function wrapperFor(store: ReturnType<typeof createStore>) {
	return function Wrapper({ children }: { children: ReactNode }): JSX.Element {
		return <Provider store={store}>{children}</Provider>;
	};
}

beforeEach(() => {
	clearProviderBalanceCache();
});

afterEach(() => {
	vi.useRealTimers();
	clearProviderBalanceCache();
});

describe("parseProviderFromModelKey", () => {
	it("取 provider/modelId 的 provider 段，无斜杠时整串即 provider", () => {
		// 与 useModelSelectorModel.fallbackOptionFromKey 同口径：selectedModelAtom 的真实键
		// 恒为 "provider/modelId"（provider 非空）；无斜杠时整串按 provider 兜底。
		expect(parseProviderFromModelKey("deepseek/deepseek-chat")).toBe("deepseek");
		expect(parseProviderFromModelKey("deepseek")).toBe("deepseek");
		expect(parseProviderFromModelKey("")).toBeNull();
		expect(parseProviderFromModelKey(null)).toBeNull();
		expect(parseProviderFromModelKey(undefined)).toBeNull();
	});
});

describe("useProviderBalance", () => {
	it("由 selectedModelAtom 解析 provider 并拉取；缓存命中不再重复 IPC", async () => {
		const getBalance = vi.fn(async () => supported());
		installGetBalance(getBalance);
		const store = createStore();
		store.set(selectedModelAtom, "deepseek/deepseek-chat");

		const first = renderHook(() => useProviderBalance(), { wrapper: wrapperFor(store) });
		await flush();

		expect(getBalance).toHaveBeenCalledTimes(1);
		expect(getBalance).toHaveBeenCalledWith("deepseek");
		expect(first.result.current.view).toMatchObject({ visible: true, available: 42.5, currency: "CNY" });
		first.unmount();

		const second = renderHook(() => useProviderBalance(), { wrapper: wrapperFor(store) });
		await flush();
		expect(second.result.current.view.visible).toBe(true);
		expect(getBalance).toHaveBeenCalledTimes(1);
	});

	it("手动刷新绕过 60s 缓存强制重取", async () => {
		const getBalance = vi.fn(async () => supported());
		installGetBalance(getBalance);
		const store = createStore();
		store.set(selectedModelAtom, "deepseek/deepseek-chat");

		const { result } = renderHook(() => useProviderBalance(), { wrapper: wrapperFor(store) });
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(1);

		act(() => result.current.refresh());
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(2);
	});

	it("面板打开(refreshTick)在缓存内不重复请求，缓存过期后才重取", async () => {
		vi.useFakeTimers();
		const t0 = Date.now();
		vi.setSystemTime(t0);
		const getBalance = vi.fn(async () => supported());
		installGetBalance(getBalance);
		const store = createStore();
		store.set(selectedModelAtom, "deepseek/deepseek-chat");

		const { rerender } = renderHook(({ tick }: { tick: number }) => useProviderBalance({ refreshTick: tick }), {
			initialProps: { tick: 0 },
			wrapper: wrapperFor(store),
		});
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(1);

		rerender({ tick: 1 });
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(1);

		vi.setSystemTime(t0 + PROVIDER_BALANCE_CACHE_TTL_MS + 1);
		rerender({ tick: 2 });
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(2);
	});

	it("未支持 provider → 零渲染视图", async () => {
		const getBalance = vi.fn(async () => ({ provider: "openai", supported: false }));
		installGetBalance(getBalance);
		const store = createStore();
		store.set(selectedModelAtom, "openai/gpt-5");

		const { result } = renderHook(() => useProviderBalance(), { wrapper: wrapperFor(store) });
		await flush();
		expect(result.current.view).toEqual({ visible: false });
	});

	it("查询失败(errorCode 或抛错)→ 零渲染视图", async () => {
		const errored = vi.fn(async () => supported({ available: undefined, errorCode: "network" }));
		installGetBalance(errored);
		const store = createStore();
		store.set(selectedModelAtom, "deepseek/deepseek-chat");
		const first = renderHook(() => useProviderBalance(), { wrapper: wrapperFor(store) });
		await flush();
		expect(first.result.current.view.visible).toBe(false);
		first.unmount();

		clearProviderBalanceCache();
		const thrown = vi.fn(async () => {
			throw new Error("boom");
		});
		installGetBalance(thrown);
		const second = renderHook(() => useProviderBalance(), { wrapper: wrapperFor(store) });
		await flush();
		expect(second.result.current.view.visible).toBe(false);
	});

	it("无选中模型时不发请求且零渲染", async () => {
		const getBalance = vi.fn(async () => supported());
		installGetBalance(getBalance);
		const store = createStore();
		store.set(selectedModelAtom, null);

		const { result } = renderHook(() => useProviderBalance(), { wrapper: wrapperFor(store) });
		await flush();
		expect(getBalance).not.toHaveBeenCalled();
		expect(result.current.view.visible).toBe(false);
	});

	it("scoped modelKey 覆盖全局选中模型", async () => {
		const getBalance = vi.fn(async () => supported({ provider: "kimi" }));
		installGetBalance(getBalance);
		const store = createStore();
		store.set(selectedModelAtom, "deepseek/deepseek-chat");

		const { result } = renderHook(() => useProviderBalance({ modelKey: "kimi/kimi-k2" }), {
			wrapper: wrapperFor(store),
		});
		await flush();
		expect(getBalance).toHaveBeenCalledWith("kimi");
		expect(result.current.view.visible).toBe(true);
	});
});
