// Copyright The Open Forge contributors.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MainEventLoopMonitor } from "./main-event-loop-monitor.js";

describe("MainEventLoopMonitor", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function createHarness(options?: { readonly maxWindowMs?: number }) {
		let current = 1_000;
		const monitor = new MainEventLoopMonitor({
			intervalMs: 250,
			thresholdMs: 500,
			...(options?.maxWindowMs !== undefined ? { maxWindowMs: options.maxWindowMs } : {}),
			now: () => current,
		});
		return {
			monitor,
			/** 模拟事件循环阻塞：时钟推进 amount 后再放行到期的定时器。 */
			block(amount: number): void {
				current += amount;
				vi.advanceTimersByTime(amount);
			},
			idle(amount: number): void {
				this.block(amount);
			},
		};
	}

	it("counts a window whose callback fires beyond the threshold", () => {
		const { monitor, block } = createHarness();
		monitor.start();
		block(1_200); // 一次 >500ms 的同步阻塞后回调才触发（drift = 阻塞 − 窗口间隔）
		expect(monitor.read()).toMatchObject({ overruns: 1, maxOverrunMs: 950, lastOverrunMs: 950 });
	});

	it("ignores on-time windows and sleep-sized gaps", () => {
		const { monitor, block } = createHarness();
		monitor.start();
		block(100); // 正常窗口（调度噪声）
		expect(monitor.read().overruns).toBe(0);
		block(120_000); // 休眠量级窗口被滤波
		expect(monitor.read().overruns).toBe(0);
		expect(monitor.read().maxOverrunMs).toBe(0);
	});

	it("attributes a continuous block to a single window (no double counting)", () => {
		const { monitor, block } = createHarness();
		monitor.start();
		block(3_000); // 3s 连续阻塞：只有解除后的第一个窗口携带滞后
		const first = monitor.read();
		expect(first.overruns).toBe(1);
		expect(first.maxOverrunMs).toBeGreaterThanOrEqual(3_000 - 250);
		block(300); // 后续窗口按新基准排程，不再计入
		expect(monitor.read().overruns).toBe(1);
	});

	it("stops scheduling after stop()", () => {
		const { monitor, block } = createHarness();
		monitor.start();
		monitor.stop();
		block(2_000);
		expect(monitor.read().overruns).toBe(0);
	});
});
