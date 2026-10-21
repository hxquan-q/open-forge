// @vitest-environment jsdom
// Copyright The Open Forge contributors.
// 验收直测（flow-tester）：AC-4 刷新策略。独立角度——以「IPC 调用次数」为唯一断言口径，
// 覆盖 60s 缓存命中不重复、手动刷新绕过、面板打开尊重缓存三条。
import { selectedModelAtom } from "@shared/store/atoms";
import { act, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearProviderBalanceCache, PROVIDER_BALANCE_CACHE_TTL_MS, useProviderBalance } from "./useProviderBalance";

function installGetBalance(getBalance: (providerId: string) => Promise<unknown>): void {
	Object.defineProperty(window, "vetta", {
		configurable: true,
		writable: true,
		value: { models: { getBalance } },
	});
}

const OK = { provider: "deepseek", supported: true, currency: "CNY", available: 42.5, isAvailable: true };

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

describe("AC-4 刷新策略", () => {
	it("60s 缓存命中：同一 provider 再次挂载不重复 IPC", async () => {
		const getBalance = vi.fn(async () => OK);
		installGetBalance(getBalance);
		const store = createStore();
		store.set(selectedModelAtom, "deepseek/deepseek-chat");

		const first = renderHook(() => useProviderBalance(), { wrapper: wrapperFor(store) });
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(1);
		expect(first.result.current.view.visible).toBe(true);
		first.unmount();

		const second = renderHook(() => useProviderBalance(), { wrapper: wrapperFor(store) });
		await flush();
		expect(second.result.current.view.visible).toBe(true);
		expect(getBalance).toHaveBeenCalledTimes(1);
	});

	it("手动刷新绕过缓存：强制重取一次", async () => {
		const getBalance = vi.fn(async () => OK);
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

	it("面板打开（refreshTick）尊重缓存：TTL 内不打上游，过期后重取", async () => {
		vi.useFakeTimers();
		const t0 = Date.now();
		vi.setSystemTime(t0);
		const getBalance = vi.fn(async () => OK);
		installGetBalance(getBalance);
		const store = createStore();
		store.set(selectedModelAtom, "deepseek/deepseek-chat");

		const { rerender } = renderHook(({ tick }: { tick: number }) => useProviderBalance({ refreshTick: tick }), {
			initialProps: { tick: 0 },
			wrapper: wrapperFor(store),
		});
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(1);

		// TTL 内开合面板：命中缓存，不重复 IPC。
		vi.setSystemTime(t0 + PROVIDER_BALANCE_CACHE_TTL_MS - 1);
		rerender({ tick: 1 });
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(1);

		// 超过 TTL：缓存失效，重取一次。
		vi.setSystemTime(t0 + PROVIDER_BALANCE_CACHE_TTL_MS + 1);
		rerender({ tick: 2 });
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(2);
	});
});
