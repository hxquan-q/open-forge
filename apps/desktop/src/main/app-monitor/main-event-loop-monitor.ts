// Copyright The Open Forge contributors.

/**
 * 主进程事件循环阻塞的旁路监测：链式 setTimeout 观测窗口滞后。
 *
 * 缺省每 250ms 排程一次（相对上次调度时刻，连续阻塞不重复计数），回调测量
 * 实际触发与预期时刻的滞后；≥ thresholdMs 记一次阻塞窗口。超过 maxWindowMs
 * 的窗口视为休眠/系统挂起，不计入。只保留次数与毫秒数，无用户内容；
 * 任何失败都不影响业务路径（app-monitor 旁路规则）。
 */
export interface MainEventLoopHealth {
	/** 自监测启动以来超过阈值的阻塞窗口次数。 */
	readonly overruns: number;
	/** 观察到的最大窗口滞后毫秒数。 */
	readonly maxOverrunMs: number;
	/** 最近一次超阈窗口的滞后毫秒数；尚未发生时省略。 */
	readonly lastOverrunMs?: number;
}

export interface MainEventLoopMonitorOptions {
	/** 观测窗口排程间隔；缺省 250。 */
	readonly intervalMs?: number;
	/** 阻塞阈值；缺省 500。 */
	readonly thresholdMs?: number;
	/** 单窗口上限，超过视为休眠/挂起不计；缺省 60_000。 */
	readonly maxWindowMs?: number;
	readonly now?: () => number;
}

export class MainEventLoopMonitor {
	private readonly intervalMs: number;
	private readonly thresholdMs: number;
	private readonly maxWindowMs: number;
	private readonly now: () => number;
	private overruns = 0;
	private maxOverrunMs = 0;
	private lastOverrunMs: number | undefined;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private expectedAt = 0;

	constructor(options: MainEventLoopMonitorOptions = {}) {
		this.intervalMs = options.intervalMs ?? 250;
		this.thresholdMs = options.thresholdMs ?? 500;
		this.maxWindowMs = options.maxWindowMs ?? 60_000;
		this.now = options.now ?? (() => Date.now());
	}

	start(): void {
		if (this.timer) return;
		this.schedule(this.now());
	}

	stop(): void {
		if (!this.timer) return;
		clearTimeout(this.timer);
		this.timer = undefined;
	}

	read(): MainEventLoopHealth {
		return {
			overruns: this.overruns,
			maxOverrunMs: this.maxOverrunMs,
			...(this.lastOverrunMs !== undefined ? { lastOverrunMs: this.lastOverrunMs } : {}),
		};
	}

	/** 登记一个到期观测窗口的滞后；定时回调与测试共用同一归约。 */
	recordWindow(scheduledFor: number): void {
		const drift = this.now() - scheduledFor;
		if (drift < this.thresholdMs || drift > this.maxWindowMs) return;
		this.overruns += 1;
		this.maxOverrunMs = Math.max(this.maxOverrunMs, drift);
		this.lastOverrunMs = drift;
	}

	private schedule(from: number): void {
		this.expectedAt = from + this.intervalMs;
		this.timer = setTimeout(() => {
			this.timer = undefined;
			this.recordWindow(this.expectedAt);
			// 相对本次实际触发时刻排程：连续阻塞只归属解除后的第一个窗口。
			this.schedule(this.now());
		}, this.intervalMs);
		this.timer.unref?.();
	}
}
