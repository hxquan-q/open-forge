import { describe, expect, it, vi } from "vitest";
import { STARTUP_PHASE_ORDER, type StartupPhaseLogger, StartupPhaseScheduler } from "./startup-phases.js";

interface ManualTimer {
	handler: () => void;
	delayMs: number;
}

function createManualTimers() {
	let nextId = 1;
	const pending = new Map<number, ManualTimer>();
	return {
		timers: {
			setTimeout: (handler: () => void, delayMs: number) => {
				const id = nextId++;
				pending.set(id, { handler, delayMs });
				return id;
			},
			clearTimeout: (handle: unknown) => {
				pending.delete(handle as number);
			},
		},
		pendingCount: () => pending.size,
		/** 触发当前最早到期的一个定时器，并冲洗它引起的异步续跑。 */
		async runNext() {
			const sorted = [...pending.entries()].sort((left, right) => left[1].delayMs - right[1].delayMs);
			if (sorted.length === 0) throw new Error("no pending timer to run");
			const [id, entry] = sorted[0];
			pending.delete(id);
			entry.handler();
			await flushAsyncWork();
		},
		hasPendingWithDelay: (delayMs: number) => [...pending.values()].some((entry) => entry.delayMs === delayMs),
	};
}

async function flushAsyncWork(): Promise<void> {
	await new Promise((resolve) => setImmediate(resolve));
	await new Promise((resolve) => setImmediate(resolve));
}

function createLogger(): StartupPhaseLogger & { warnings: string[]; errors: string[]; infos: string[] } {
	const warnings: string[] = [];
	const errors: string[] = [];
	const infos: string[] = [];
	return {
		warnings,
		errors,
		infos,
		info: (message) => infos.push(message),
		warn: (message) => warnings.push(message),
		error: (message) => errors.push(message),
	};
}

describe("StartupPhaseScheduler", () => {
	it("按相位顺序执行：blocking 先跑，postFirstPaint 等到相位推进后才跑", async () => {
		const order: string[] = [];
		const scheduler = new StartupPhaseScheduler();
		scheduler.register("blocking", "first-paint-path", () => order.push("blocking"));
		scheduler.register("postFirstPaint", "app-monitor", () => order.push("postFirstPaint"));

		await scheduler.runBlockingPhase();
		expect(order).toEqual(["blocking"]);
		expect(scheduler.currentPhase).toBe("blocking");

		await scheduler.advanceTo("postFirstPaint");
		expect(order).toEqual(["blocking", "postFirstPaint"]);
		expect(scheduler.currentPhase).toBe("postFirstPaint");
	});

	it("blocking 相位内不执行 idle 工作，idle 只在推进到该相位后进时间片", async () => {
		const idleTask = vi.fn();
		const manual = createManualTimers();
		const scheduler = new StartupPhaseScheduler({ timers: manual.timers, idleStartDelayMs: 0 });
		scheduler.register("blocking", "window", () => {});
		scheduler.register("idle", "runtime-warmup", idleTask);

		await scheduler.runBlockingPhase();
		expect(idleTask).not.toHaveBeenCalled();

		await scheduler.advanceTo("postFirstPaint");
		expect(idleTask).not.toHaveBeenCalled();
		expect(manual.hasPendingWithDelay(0)).toBe(true);

		await manual.runNext();
		expect(idleTask).toHaveBeenCalledTimes(1);
	});

	it("时间片用尽就让出，剩余任务在下一片继续，全部完成后 whenDrained 兑现", async () => {
		const order: string[] = [];
		const manual = createManualTimers();
		const logger = createLogger();
		const scheduler = new StartupPhaseScheduler({
			timers: manual.timers,
			idleSliceMs: 0,
			idleStartDelayMs: 0,
			logger,
		});
		scheduler.register("idle", "first", () => order.push("first"));
		scheduler.register("idle", "second", () => order.push("second"));
		scheduler.register("eventually", "third", () => order.push("third"));

		await scheduler.advanceTo("idle");
		const drained = scheduler.whenDrained();
		await manual.runNext();
		expect(order).toEqual(["first"]);
		await manual.runNext();
		expect(order).toEqual(["first", "second"]);
		await manual.runNext();
		expect(order).toEqual(["first", "second", "third"]);
		await drained;

		expect(manual.pendingCount()).toBe(0);
		expect(logger.infos).toContain("startup phases drained");
		expect(scheduler.snapshot().map((item) => item.status)).toEqual(["completed", "completed", "completed"]);
	});

	it("空闲片被饿死时由 forcedTimeout 兜底强制跑一片", async () => {
		const manual = createManualTimers();
		const logger = createLogger();
		const idleTask = vi.fn();
		const scheduler = new StartupPhaseScheduler({
			timers: manual.timers,
			idleStartDelayMs: 5_000,
			forcedTimeoutMs: 1_000,
			logger,
		});
		scheduler.register("idle", "warmup", idleTask);

		await scheduler.advanceTo("idle");
		expect(manual.hasPendingWithDelay(1_000)).toBe(true);
		expect(manual.hasPendingWithDelay(5_000)).toBe(true);

		await manual.runNext();
		expect(idleTask).toHaveBeenCalledTimes(1);
		expect(logger.warnings.some((message) => message.includes("forcing a slice"))).toBe(true);
	});

	it("相位到达后再注册的任务按相位语义立即执行，不会丢", async () => {
		const order: string[] = [];
		const manual = createManualTimers();
		const scheduler = new StartupPhaseScheduler({ timers: manual.timers, idleStartDelayMs: 0 });
		await scheduler.advanceTo("eventually");

		scheduler.register("postFirstPaint", "late-post", () => order.push("late-post"));
		scheduler.register("eventually", "late-idle", () => order.push("late-idle"));
		await flushAsyncWork();
		expect(order).toEqual(["late-post"]);

		await manual.runNext();
		expect(order).toEqual(["late-post", "late-idle"]);
	});

	it("慢任务与失败任务只记录、不打断启动，快照按耗时排序", async () => {
		const manual = createManualTimers();
		const logger = createLogger();
		const scheduler = new StartupPhaseScheduler({
			timers: manual.timers,
			idleStartDelayMs: 0,
			idleSliceMs: 1_000,
			slowItemWarnMs: 1,
			verySlowItemWarnMs: 5_000,
			logger,
		});
		scheduler.register("blocking", "slow", async () => {
			await new Promise((resolve) => setTimeout(resolve, 3));
		});
		scheduler.register("blocking", "boom", () => {
			throw new Error("warmup failed");
		});

		await scheduler.runBlockingPhase();

		expect(logger.warnings.some((message) => message.includes("task is slow: slow"))).toBe(true);
		expect(logger.errors.some((message) => message.includes("task failed: boom"))).toBe(true);
		const snapshot = scheduler.snapshot();
		expect(snapshot[0]?.label).toBe("slow");
		expect(snapshot.find((item) => item.label === "boom")?.status).toBe("failed");
	});

	it("相位顺序常量覆盖四个相位，重复推进幂等", async () => {
		expect(STARTUP_PHASE_ORDER).toEqual(["blocking", "postFirstPaint", "idle", "eventually"]);

		const blockingTask = vi.fn();
		const scheduler = new StartupPhaseScheduler();
		scheduler.register("blocking", "once", blockingTask);

		await scheduler.runBlockingPhase();
		await scheduler.runBlockingPhase();
		await scheduler.advanceTo("postFirstPaint");

		expect(blockingTask).toHaveBeenCalledTimes(1);
		expect(scheduler.currentPhase).toBe("postFirstPaint");
	});
});
