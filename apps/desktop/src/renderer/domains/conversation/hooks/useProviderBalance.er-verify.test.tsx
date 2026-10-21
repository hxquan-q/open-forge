// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { selectedModelAtom } from "@shared/store/atoms";
import { act, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearProviderBalanceCache, PROVIDER_BALANCE_CACHE_TTL_MS, useProviderBalance } from "./useProviderBalance";

/**
 * ER 轮独立复验（F6 半：余额只缓存非 errorCode 结果）。
 *
 * 独立角度（不照抄实现者用例）：以「**面板重开**（refreshTick 自增）」为主口径 + **假计时器**压 TTL，
 * 不靠卸载/重挂载。判据只按 errorCode：
 * - errorCode 结果 → 面板重开会重取（未被缓存挡住）；
 * - 成功结果 → TTL 内面板重开不重取；
 * - `supported:false` 是稳定能力事实 → **仍缓存**（防后人扩大化）；
 * - 桥 reject → 不缓存，重开重取；
 * - TTL 过期后重开 → 重取（假计时器）。
 */

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

function storeWithModel(): ReturnType<typeof createStore> {
	const store = createStore();
	store.set(selectedModelAtom, "deepseek/deepseek-chat");
	return store;
}

beforeEach(() => {
	clearProviderBalanceCache();
});

afterEach(() => {
	vi.useRealTimers();
	clearProviderBalanceCache();
});

describe("useProviderBalance 缓存口径 · ER 独立复验（F6）", () => {
	it("errorCode 结果不缓存：面板重开（refreshTick 自增）会重取", async () => {
		const getBalance = vi.fn(async () => ({ provider: "deepseek", supported: true, errorCode: "network" }));
		installGetBalance(getBalance);
		const store = storeWithModel();

		const { result, rerender } = renderHook(({ tick }: { tick: number }) => useProviderBalance({ refreshTick: tick }), {
			initialProps: { tick: 0 },
			wrapper: wrapperFor(store),
		});
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(1);
		expect(result.current.view.visible).toBe(false);

		rerender({ tick: 1 });
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(2); // 未被缓存挡住
	});

	it("成功结果 TTL 内：面板重开不重取（缓存命中）", async () => {
		const getBalance = vi.fn(async () => supported());
		installGetBalance(getBalance);
		const store = storeWithModel();

		const { result, rerender } = renderHook(({ tick }: { tick: number }) => useProviderBalance({ refreshTick: tick }), {
			initialProps: { tick: 0 },
			wrapper: wrapperFor(store),
		});
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(1);
		expect(result.current.view).toMatchObject({ visible: true, available: 42.5 });

		rerender({ tick: 1 });
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(1); // 命中缓存
	});

	it("supported:false 是稳定能力事实，仍缓存：面板重开不重取", async () => {
		const getBalance = vi.fn(async () => ({ provider: "openai", supported: false }));
		installGetBalance(getBalance);
		const store = createStore();
		store.set(selectedModelAtom, "openai/gpt-5");

		const { result, rerender } = renderHook(({ tick }: { tick: number }) => useProviderBalance({ refreshTick: tick }), {
			initialProps: { tick: 0 },
			wrapper: wrapperFor(store),
		});
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(1);
		expect(result.current.view.visible).toBe(false);

		rerender({ tick: 1 });
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(1); // 只放过 errorCode，不扩大化
	});

	it("桥 reject（抛错）不缓存：面板重开重取", async () => {
		const getBalance = vi.fn(async () => {
			throw new Error("boom");
		});
		installGetBalance(getBalance);
		const store = storeWithModel();

		const { result, rerender } = renderHook(({ tick }: { tick: number }) => useProviderBalance({ refreshTick: tick }), {
			initialProps: { tick: 0 },
			wrapper: wrapperFor(store),
		});
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(1);
		expect(result.current.view.visible).toBe(false);

		rerender({ tick: 1 });
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(2);
	});

	it("TTL 过期后重取（假计时器）", async () => {
		vi.useFakeTimers();
		const t0 = Date.now();
		vi.setSystemTime(t0);
		const getBalance = vi.fn(async () => supported());
		installGetBalance(getBalance);
		const store = storeWithModel();

		const { rerender } = renderHook(({ tick }: { tick: number }) => useProviderBalance({ refreshTick: tick }), {
			initialProps: { tick: 0 },
			wrapper: wrapperFor(store),
		});
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(1);

		// TTL 内重开：命中缓存。
		rerender({ tick: 1 });
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(1);

		// 过期后重开：重取。
		vi.setSystemTime(t0 + PROVIDER_BALANCE_CACHE_TTL_MS + 1);
		rerender({ tick: 2 });
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(2);
	});
});
