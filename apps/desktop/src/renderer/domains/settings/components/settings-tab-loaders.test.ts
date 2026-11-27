// @vitest-environment jsdom
// Modified by The Open Forge contributors.
import { renderHook } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prefetchSettingsTab, SETTINGS_TAB_LOADERS, useIdleSettingsTabPrefetch } from "./settings-tab-loaders";

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe("settings tab code prefetch", () => {
	it("loads only the selected tab and allows a later retry", async () => {
		// 闭包计数断言触发次数，替代调用类断言。
		let generalCalls = 0;
		let modelsCalls = 0;
		vi.spyOn(SETTINGS_TAB_LOADERS, "general").mockImplementation(() => {
			generalCalls += 1;
			if (generalCalls === 1) return Promise.reject(new Error("chunk unavailable"));
			return Promise.resolve({ default: () => createElement("div") });
		});
		vi.spyOn(SETTINGS_TAB_LOADERS, "models").mockImplementation(() => {
			modelsCalls += 1;
			return Promise.resolve({ default: () => createElement("div") });
		});
		prefetchSettingsTab("general");
		await Promise.resolve();
		prefetchSettingsTab("general");
		prefetchSettingsTab("unknown");
		expect(generalCalls).toBe(2);
		expect(modelsCalls).toBe(0);
	});
});

describe("settings tab idle prefetch", () => {
	const stubLoaders = () => {
		// 闭包计数断言触发次数，替代调用类断言。
		const counts = { appearance: 0, general: 0, models: 0, usage: 0 };
		const page = { default: () => createElement("div") };
		for (const tab of ["appearance", "general", "models", "usage"] as const) {
			vi.spyOn(SETTINGS_TAB_LOADERS, tab).mockImplementation(() => {
				counts[tab] += 1;
				return Promise.resolve(page);
			});
		}
		return counts;
	};

	it("waits for idle time, then loads the common tabs except the one already open", () => {
		vi.useFakeTimers();
		const counts = stubLoaders();
		renderHook(() => useIdleSettingsTabPrefetch("general"));
		expect(counts.appearance).toBe(0);

		// jsdom 没有 requestIdleCallback，走 setTimeout 兜底。
		vi.advanceTimersByTime(500);
		expect(counts.appearance).toBe(1);
		expect(counts.models).toBe(1);
		expect(counts.general).toBe(0);
		expect(counts.usage).toBe(0);
	});

	it("does not reschedule when the user switches tabs", () => {
		vi.useFakeTimers();
		const counts = stubLoaders();
		const { rerender } = renderHook(({ tab }: { tab: string }) => useIdleSettingsTabPrefetch(tab), {
			initialProps: { tab: "usage" },
		});
		rerender({ tab: "models" });
		vi.advanceTimersByTime(500);
		expect(counts.appearance).toBe(1);
	});

	it("cancels when settings closes before idle time", () => {
		vi.useFakeTimers();
		const counts = stubLoaders();
		const { unmount } = renderHook(() => useIdleSettingsTabPrefetch("usage"));
		unmount();
		vi.advanceTimersByTime(5000);
		expect(counts.appearance).toBe(0);
	});
});
