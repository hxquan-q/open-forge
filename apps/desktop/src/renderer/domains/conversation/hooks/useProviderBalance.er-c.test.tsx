// @vitest-environment jsdom
// Copyright The Open Forge contributors.
// 外部审查修复轮（ER-C）：F6 半 —— 余额查询的「结构化失败（errorCode）」结果不进 60s 缓存。
// 独立角度：以「跨挂载的 IPC 调用次数」为唯一断言口径，钉住「只放过 errorCode」这一意图。
// 口径：判据只按 errorCode；supported:false 是稳定能力事实仍缓存；桥 reject 既有行为不缓存。
import { selectedModelAtom } from "@shared/store/atoms";
import { act, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearProviderBalanceCache, useProviderBalance } from "./useProviderBalance";

/** 用只含 models.getBalance 的桥覆盖基线桥面：本 hook 只触达这一个 IPC。 */
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

describe("ER-C · 结构化失败不进缓存", () => {
	it("errorCode 结果不缓存：卸载后重挂载会重取（不被缓存挡住）", async () => {
		const getBalance = vi.fn(async () => ({
			provider: "deepseek",
			supported: true,
			available: undefined,
			errorCode: "network",
		}));
		installGetBalance(getBalance);
		const store = storeWithModel();

		const first = renderHook(() => useProviderBalance(), { wrapper: wrapperFor(store) });
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(1);
		expect(first.result.current.view.visible).toBe(false);
		first.unmount();

		// 未缓存 → 重挂载必须再打一次上游。
		const second = renderHook(() => useProviderBalance(), { wrapper: wrapperFor(store) });
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(2);
		expect(second.result.current.view.visible).toBe(false);
	});

	it("成功结果仍缓存：TTL 内重挂载不重取（回归锁，证明没把缓存整体废掉）", async () => {
		const getBalance = vi.fn(async () => ({
			provider: "deepseek",
			supported: true,
			currency: "CNY",
			available: 42.5,
			isAvailable: true,
		}));
		installGetBalance(getBalance);
		const store = storeWithModel();

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

	it("supported: false 仍被缓存：只放过 errorCode，不扩大化", async () => {
		const getBalance = vi.fn(async () => ({ provider: "openai", supported: false }));
		installGetBalance(getBalance);
		const store = createStore();
		store.set(selectedModelAtom, "openai/gpt-5");

		const first = renderHook(() => useProviderBalance(), { wrapper: wrapperFor(store) });
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(1);
		expect(first.result.current.view.visible).toBe(false);
		first.unmount();

		// 能力事实稳定 → 命中缓存，不再打上游。
		const second = renderHook(() => useProviderBalance(), { wrapper: wrapperFor(store) });
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(1);
		expect(second.result.current.view.visible).toBe(false);
	});

	it("桥 reject（抛错）不缓存：重挂载会重取（既有行为防回归）", async () => {
		const getBalance = vi.fn(async () => {
			throw new Error("boom");
		});
		installGetBalance(getBalance);
		const store = storeWithModel();

		const first = renderHook(() => useProviderBalance(), { wrapper: wrapperFor(store) });
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(1);
		expect(first.result.current.view.visible).toBe(false);
		first.unmount();

		const second = renderHook(() => useProviderBalance(), { wrapper: wrapperFor(store) });
		await flush();
		expect(getBalance).toHaveBeenCalledTimes(2);
		expect(second.result.current.view.visible).toBe(false);
	});
});
