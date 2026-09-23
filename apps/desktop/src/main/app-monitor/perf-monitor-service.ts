// Copyright The Open Forge contributors.
import type { SessionEvent } from "@vetta/runtime-core";
import { app } from "electron";
import { getAppLogger } from "../logger.js";
import {
	accumulateTurn,
	buildPerfSnapshot,
	classifyProcessMetricType,
	createPerfAggregates,
	type DesktopPerfSnapshot,
	type PerfAggregates,
	type PerfMonitorReport,
	type PerfProcessMetrics,
	type PerfProcessSample,
	type PerfTurnRecord,
	recordPerfReduction,
	SessionPerfTracker,
} from "./perf-snapshot.js";

const IDLE_INTERVAL_MS = 30_000;
const ACTIVE_INTERVAL_MS = 2_000;
/** 最近一个 Turn 结束或出错后，仍以活跃频率采样的留尾窗口。 */
const ACTIVITY_TAIL_MS = 60_000;
const MAX_SAMPLES = 180;
const MAX_TURN_RECORDS = 64;

const log = getAppLogger("perf-monitor");

/** 会话事件源：RuntimeHost.subscribe 的最小结构面，测试用 fake 注入。 */
export interface PerfSessionEventSource {
	subscribe(sessionId: string, handler: (event: SessionEvent) => void): () => void;
}

export interface PerfMonitorOptions {
	readonly collectProcessMetrics?: () => PerfProcessMetrics;
	readonly now?: () => number;
	readonly idleIntervalMs?: number;
	readonly activeIntervalMs?: number;
	readonly activityTailMs?: number;
	readonly maxSamples?: number;
	readonly maxTurnRecords?: number;
}

export class PerfMonitorService {
	private readonly trackers = new Map<string, SessionPerfTracker>();
	private readonly subscriptions = new Map<string, () => void>();
	private readonly samples: DesktopPerfSnapshot[] = [];
	private readonly aggregates: PerfAggregates = createPerfAggregates();
	private readonly turnRecords: PerfTurnRecord[] = [];
	private readonly options: Required<
		Pick<
			PerfMonitorOptions,
			"idleIntervalMs" | "activeIntervalMs" | "activityTailMs" | "maxSamples" | "maxTurnRecords"
		>
	>;
	private readonly now: () => number;
	private readonly collectProcessMetrics: (() => PerfProcessMetrics) | undefined;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private activeUntil = 0;
	private initialized = false;

	constructor(options: PerfMonitorOptions = {}) {
		this.options = {
			idleIntervalMs: options.idleIntervalMs ?? IDLE_INTERVAL_MS,
			activeIntervalMs: options.activeIntervalMs ?? ACTIVE_INTERVAL_MS,
			activityTailMs: options.activityTailMs ?? ACTIVITY_TAIL_MS,
			maxSamples: options.maxSamples ?? MAX_SAMPLES,
			maxTurnRecords: options.maxTurnRecords ?? MAX_TURN_RECORDS,
		};
		this.now = options.now ?? Date.now;
		this.collectProcessMetrics = options.collectProcessMetrics;
	}

	/** 旁路采样：失败只降级为 warn，绝不向业务路径抛出。 */
	initialize(): void {
		if (this.initialized) return;
		this.initialized = true;
		this.scheduleNext();
	}

	observeSession(runtime: PerfSessionEventSource, sessionId: string): void {
		if (this.subscriptions.has(sessionId)) return;
		this.trackers.set(sessionId, new SessionPerfTracker(sessionId));
		try {
			const unsubscribe = runtime.subscribe(sessionId, (event) => {
				try {
					this.recordSessionEvent(sessionId, event);
				} catch (error) {
					log.warn("perf event reduction failed", { sessionId, type: event.type }, error);
				}
			});
			this.subscriptions.set(sessionId, unsubscribe);
		} catch (error) {
			log.warn("perf session subscription failed", { sessionId }, error);
		}
	}

	unobserveSession(sessionId: string): void {
		const unsubscribe = this.subscriptions.get(sessionId);
		if (!unsubscribe) return;
		try {
			unsubscribe();
		} catch (error) {
			log.warn("perf session unsubscribe failed", { sessionId }, error);
		}
		this.subscriptions.delete(sessionId);
		this.trackers.get(sessionId)?.dispose();
		this.trackers.delete(sessionId);
	}

	getReport(now = this.now()): PerfMonitorReport {
		return {
			generatedAt: now,
			sampling: this.isActive(now) ? "active" : "idle",
			...(this.samples.length > 0 ? { latest: this.samples[this.samples.length - 1] } : {}),
			recent: [...this.samples],
			recentTurns: [...this.turnRecords],
			aggregates: this.aggregates,
			sampleCount: this.samples.length,
		};
	}

	async shutdown(): Promise<void> {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
		for (const sessionId of [...this.subscriptions.keys()]) {
			this.unobserveSession(sessionId);
		}
		this.initialized = false;
	}

	/** 同步归约一个 Session 事件；只更新内存计数。 */
	private recordSessionEvent(sessionId: string, event: SessionEvent): void {
		const now = this.now();
		const lag = Math.max(0, now - event.timestamp);
		this.aggregates.eventLag.lastMs = lag;
		this.aggregates.eventLag.maxMs = Math.max(this.aggregates.eventLag.maxMs, lag);

		const tracker = this.trackers.get(sessionId) ?? new SessionPerfTracker(sessionId);
		this.trackers.set(sessionId, tracker);
		const outcome = tracker.apply(event);
		recordPerfReduction(this.aggregates, outcome);

		if (event.type === "error" && event.channel !== "assistant") {
			const origin = event.error.origin;
			if (origin === "provider") this.aggregates.errors.provider += 1;
			else if (origin === "tool") this.aggregates.errors.tool += 1;
			else if (origin === "extension") this.aggregates.errors.extension += 1;
			else this.aggregates.errors.runtime += 1;
			this.bumpActivity(now);
		}
		if (event.type === "session.lifecycle") {
			if (event.phase === "agent_start" || event.phase === "agent_end" || event.phase === "aborted") {
				this.bumpActivity(now);
			}
		}
		if (outcome.completedTurn) {
			this.turnRecords.push(outcome.completedTurn);
			if (this.turnRecords.length > this.options.maxTurnRecords) {
				this.turnRecords.splice(0, this.turnRecords.length - this.options.maxTurnRecords);
			}
			accumulateTurn(this.aggregates, outcome.completedTurn);
		}
	}

	private bumpActivity(now: number): void {
		this.activeUntil = now + this.options.activityTailMs;
	}

	private isActive(now: number): boolean {
		if (now < this.activeUntil) return true;
		for (const tracker of this.trackers.values()) {
			if (tracker.running) return true;
		}
		return false;
	}

	private scheduleNext(): void {
		const interval = this.isActive(this.now()) ? this.options.activeIntervalMs : this.options.idleIntervalMs;
		this.timer = setTimeout(() => {
			this.timer = undefined;
			this.sample();
			if (this.initialized) this.scheduleNext();
		}, interval);
		this.timer.unref?.();
	}

	/** 采样一轮：进程指标 + 会话活动。任何一步失败都只跳过本轮。 */
	private sample(): void {
		const now = this.now();
		let metrics: PerfProcessMetrics | undefined;
		try {
			metrics = this.collectProcessMetrics?.() ?? collectElectronProcessMetrics();
		} catch (error) {
			log.warn("perf process sampling failed", error);
		}
		try {
			const snapshot = buildPerfSnapshot({
				at: now,
				sampling: this.isActive(now) ? "active" : "idle",
				metrics,
				sessions: [...this.trackers.values()].map((tracker) => tracker.activity(now)),
				aggregates: this.aggregates,
			});
			this.samples.push(snapshot);
			if (this.samples.length > this.options.maxSamples) {
				this.samples.splice(0, this.samples.length - this.options.maxSamples);
			}
		} catch (error) {
			log.warn("perf snapshot assembly failed", error);
		}
	}
}

/**
 * Electron 进程指标采集：只取 pid/类型/CPU/内存数字，不携带进程名、窗口
 * 标题或 URL（ProcessMetric.name/serviceName 可含服务名与页面标题，不采集）。
 */
function collectElectronProcessMetrics(): PerfProcessMetrics {
	const processes: PerfProcessSample[] = app.getAppMetrics().map((metric) => ({
		pid: metric.pid,
		type: classifyProcessMetricType(metric.type),
		cpuPercent: metric.cpu.percentCPUUsage,
		workingSetKb: metric.memory.workingSetSize,
		...(metric.memory.privateBytes !== undefined ? { privateKb: metric.memory.privateBytes } : {}),
	}));
	const memory = process.memoryUsage();
	return {
		processes,
		mainHeap: {
			heapUsedBytes: memory.heapUsed,
			heapTotalBytes: memory.heapTotal,
			rssBytes: memory.rss,
			externalBytes: memory.external,
		},
	};
}

let perfMonitor = new PerfMonitorService();

export function initializePerfMonitor(options?: PerfMonitorOptions): void {
	if (options) perfMonitor = new PerfMonitorService(options);
	perfMonitor.initialize();
}

export function observePerfSession(runtime: PerfSessionEventSource, sessionId: string): void {
	perfMonitor.observeSession(runtime, sessionId);
}

export function unobservePerfSession(sessionId: string): void {
	perfMonitor.unobserveSession(sessionId);
}

export function getPerfMonitorReport(now?: number): PerfMonitorReport {
	return perfMonitor.getReport(now);
}

export function shutdownPerfMonitor(): Promise<void> {
	return perfMonitor.shutdown();
}
