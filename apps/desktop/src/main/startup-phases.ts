// Modified by The Open Forge contributors.
/**
 * 启动相位与 idle 实例化治理（对应 VS Code `WorkbenchPhase` + `runWhenGlobalIdle` 的形状）。
 *
 * 主进程启动序列里的工作按「首帧是否需要」分相位：
 *
 * - `blocking`：首帧可见内容前必须完成（窗口、菜单、IPC、协议注册等）。
 * - `postFirstPaint`：首帧内容绘制完成后立即顺序执行（App Monitor 初始化、桌宠、快捷面板同步）。
 * - `idle` / `eventually`：在空闲时间片里跑，时间片用尽就让出继续排队，并有
 *   `forcedTimeoutMs` 兜底防止长任务或忙时把它们饿死。
 *
 * 每个单件都记录耗时并写进快照：超过 `slowItemWarnMs` 打 warn、超过
 * `verySlowItemWarnMs` 打 error，用来回答「启动变慢是谁造成的」。相位到达之后
 * 再注册的任务按其相位语义立即执行（blocking/postFirstPaint 直接跑，idle/eventually
 * 进下一轮时间片），避免「注册晚于相位」导致任务永不执行。
 */
import { performance } from "node:perf_hooks";

export type StartupPhase = "blocking" | "postFirstPaint" | "idle" | "eventually";

export const STARTUP_PHASE_ORDER: readonly StartupPhase[] = ["blocking", "postFirstPaint", "idle", "eventually"];

export interface StartupPhaseLogger {
	info(message: string, meta?: Record<string, unknown>): void;
	warn(message: string, meta?: Record<string, unknown>): void;
	error(message: string, meta?: Record<string, unknown>): void;
}

export interface StartupPhaseItemSnapshot {
	label: string;
	phase: StartupPhase;
	status: "pending" | "completed" | "failed";
	durationMs: number;
}

export interface StartupPhaseTimers {
	setTimeout(handler: () => void, delayMs: number): unknown;
	clearTimeout(handle: unknown): void;
}

export interface StartupPhaseSchedulerOptions {
	/** 单个 idle 时间片的预算，用尽即让出事件循环。 */
	idleSliceMs?: number;
	/** 空闲时间片被饿死时的兜底：超过它强制跑一次时间片。 */
	forcedTimeoutMs?: number;
	/** idle 相位首片前的静默期，避免与首帧绘制抢 CPU。 */
	idleStartDelayMs?: number;
	slowItemWarnMs?: number;
	verySlowItemWarnMs?: number;
	logger?: StartupPhaseLogger;
	timers?: StartupPhaseTimers;
}

interface StartupPhaseItem {
	label: string;
	phase: StartupPhase;
	task: () => unknown;
	status: "pending" | "completed" | "failed";
	durationMs: number;
}

const DEFAULT_IDLE_SLICE_MS = 8;
const DEFAULT_FORCED_TIMEOUT_MS = 1000;
const DEFAULT_IDLE_START_DELAY_MS = 500;
const DEFAULT_SLOW_ITEM_WARN_MS = 20;
const DEFAULT_VERY_SLOW_ITEM_WARN_MS = 100;

const silentLogger: StartupPhaseLogger = {
	info() {},
	warn() {},
	error() {},
};

function phaseIndex(phase: StartupPhase): number {
	return STARTUP_PHASE_ORDER.indexOf(phase);
}

function isIdlePhase(phase: StartupPhase): boolean {
	return phase === "idle" || phase === "eventually";
}

export class StartupPhaseScheduler {
	private readonly items: StartupPhaseItem[] = [];
	private readonly options: Required<Omit<StartupPhaseSchedulerOptions, "logger" | "timers">>;
	private readonly logger: StartupPhaseLogger;
	private readonly timers: StartupPhaseTimers;
	private reachedIndex = -1;
	private idleLoopStarted = false;
	private idleSliceHandle: unknown;
	private forcedTimeoutHandle: unknown;
	private drainPromise: Promise<void> | undefined;
	private resolveDrain: (() => void) | undefined;

	constructor(options: StartupPhaseSchedulerOptions = {}) {
		this.options = {
			idleSliceMs: options.idleSliceMs ?? DEFAULT_IDLE_SLICE_MS,
			forcedTimeoutMs: options.forcedTimeoutMs ?? DEFAULT_FORCED_TIMEOUT_MS,
			idleStartDelayMs: options.idleStartDelayMs ?? DEFAULT_IDLE_START_DELAY_MS,
			slowItemWarnMs: options.slowItemWarnMs ?? DEFAULT_SLOW_ITEM_WARN_MS,
			verySlowItemWarnMs: options.verySlowItemWarnMs ?? DEFAULT_VERY_SLOW_ITEM_WARN_MS,
		};
		this.logger = options.logger ?? silentLogger;
		this.timers = options.timers ?? {
			setTimeout: (handler, delayMs) => setTimeout(handler, delayMs),
			clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
		};
	}

	/** 已到达的相位；尚未跑过任何相位时为 `undefined`。 */
	get currentPhase(): StartupPhase | undefined {
		return this.reachedIndex < 0 ? undefined : STARTUP_PHASE_ORDER[this.reachedIndex];
	}

	register(phase: StartupPhase, label: string, task: () => unknown): void {
		const item: StartupPhaseItem = { label, phase, task, status: "pending", durationMs: 0 };
		this.items.push(item);
		// 相位已到：立即按其语义执行，任务不会因为注册晚而被丢掉。
		if (phaseIndex(phase) <= this.reachedIndex) {
			if (isIdlePhase(phase)) this.startIdleLoop();
			else void this.runItem(item);
		}
	}

	/** 阻塞相位：顺序 await，失败只记录（预热失败不该拦住启动）。 */
	async runBlockingPhase(): Promise<void> {
		await this.advanceTo("blocking");
	}

	/** 推进到指定相位；重复调用幂等，不会重跑已完成的相位。 */
	async advanceTo(phase: StartupPhase): Promise<void> {
		const targetIndex = phaseIndex(phase);
		if (targetIndex <= this.reachedIndex) return;
		for (let index = this.reachedIndex + 1; index <= targetIndex; index += 1) {
			const currentPhase = STARTUP_PHASE_ORDER[index];
			this.reachedIndex = index;
			if (isIdlePhase(currentPhase)) continue;
			for (const item of this.items) {
				if (item.phase !== currentPhase || item.status !== "pending") continue;
				await this.runItem(item);
			}
		}
		if (this.items.some((item) => isIdlePhase(item.phase))) this.startIdleLoop();
	}

	/** 所有 idle/eventually 任务跑完后 resolve；没有这类任务时立即 resolve。 */
	async whenDrained(): Promise<void> {
		if (!this.items.some((item) => isIdlePhase(item.phase) && item.status === "pending")) return;
		this.drainPromise ??= new Promise<void>((resolve) => {
			this.resolveDrain = resolve;
		});
		return this.drainPromise;
	}

	/** 单件耗时排名（降序），用于诊断「启动变慢是谁造成的」。 */
	snapshot(): StartupPhaseItemSnapshot[] {
		return [...this.items]
			.sort((left, right) => right.durationMs - left.durationMs)
			.map((item) => ({
				label: item.label,
				phase: item.phase,
				status: item.status,
				durationMs: item.durationMs,
			}));
	}

	private startIdleLoop(): void {
		if (this.idleLoopStarted) return;
		this.idleLoopStarted = true;
		this.scheduleSlice(this.options.idleStartDelayMs);
	}

	private scheduleSlice(delayMs: number): void {
		this.clearSliceTimers();
		this.forcedTimeoutHandle = this.timers.setTimeout(() => {
			this.logger.warn("startup phase idle slice timed out, forcing a slice", { delayMs });
			this.idleSliceHandle = undefined;
			this.forcedTimeoutHandle = undefined;
			void this.runSlice();
		}, this.options.forcedTimeoutMs);
		this.idleSliceHandle = this.timers.setTimeout(() => {
			this.clearSliceTimers();
			void this.runSlice();
		}, delayMs);
	}

	private clearSliceTimers(): void {
		if (this.idleSliceHandle !== undefined) {
			this.timers.clearTimeout(this.idleSliceHandle);
			this.idleSliceHandle = undefined;
		}
		if (this.forcedTimeoutHandle !== undefined) {
			this.timers.clearTimeout(this.forcedTimeoutHandle);
			this.forcedTimeoutHandle = undefined;
		}
	}

	/** 一个时间片：按 idle → eventually 顺序跑，预算用尽就预约下一片。 */
	private async runSlice(): Promise<void> {
		const sliceStartedAt = performance.now();
		for (const phase of ["idle", "eventually"] as const) {
			for (const item of this.items) {
				if (item.phase !== phase || item.status !== "pending") continue;
				await this.runItem(item);
				// 还有待跑任务且预算已用尽才让出；否则继续把这一片用满。
				if (this.hasPendingIdleItems() && performance.now() - sliceStartedAt >= this.options.idleSliceMs) {
					this.scheduleSlice(0);
					return;
				}
			}
		}
		this.finishDrainIfDone();
	}

	private hasPendingIdleItems(): boolean {
		return this.items.some((item) => isIdlePhase(item.phase) && item.status === "pending");
	}

	private async runItem(item: StartupPhaseItem): Promise<void> {
		const startedAt = performance.now();
		try {
			await item.task();
			item.status = "completed";
		} catch (error) {
			item.status = "failed";
			this.logger.error(`startup ${item.phase} task failed: ${item.label}`, { error });
		}
		item.durationMs = performance.now() - startedAt;
		if (item.durationMs >= this.options.verySlowItemWarnMs) {
			this.logger.error(`startup ${item.phase} task is very slow: ${item.label}`, {
				durationMs: Math.round(item.durationMs),
			});
		} else if (item.durationMs >= this.options.slowItemWarnMs) {
			this.logger.warn(`startup ${item.phase} task is slow: ${item.label}`, {
				durationMs: Math.round(item.durationMs),
			});
		}
	}

	private finishDrainIfDone(): void {
		if (this.hasPendingIdleItems()) return;
		this.clearSliceTimers();
		const slowest = this.snapshot()
			.filter((item) => item.status !== "pending")
			.slice(0, 3)
			.map((item) => `${item.label}=${Math.round(item.durationMs)}ms`);
		this.logger.info("startup phases drained", { slowest });
		this.resolveDrain?.();
		this.resolveDrain = undefined;
	}
}
