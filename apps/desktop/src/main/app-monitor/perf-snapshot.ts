// Copyright The Open Forge contributors.
import type { SessionEvent } from "@vetta/runtime-core";
import type { ProcessRoleHealth } from "./process-health.js";

/**
 * `queue.changed` 的 `snapshot` 字段在公共合同里是 `unknown`；这里只取监控所需的
 * 结构性子集，不让 Runtime Core 为观测扩公共导出。
 */
interface PerfQueueSnapshot {
	readonly paused: boolean;
	readonly entries: readonly { readonly id: string; readonly enqueuedAt?: number }[];
}

/**
 * 性能快照只保留数字与稳定标识（pid/sessionId/turnId），不携带进程名、
 * 窗口标题、URL、消息正文或任何可还原的用户内容。
 */
export type PerfProcessType = "main" | "renderer" | "gpu" | "utility" | "other";

export interface PerfProcessSample {
	readonly pid: number;
	readonly type: PerfProcessType;
	/** 后台进程健康契约注册的 role 名（按 pid 归因）；未注册的进程不带此字段。 */
	readonly role?: string;
	/** getAppMetrics 语义：自上一次采样以来的 CPU 百分比。 */
	readonly cpuPercent: number;
	readonly workingSetKb: number;
	readonly privateKb?: number;
}

export interface PerfMainHeap {
	readonly heapUsedBytes: number;
	readonly heapTotalBytes: number;
	readonly rssBytes: number;
	readonly externalBytes?: number;
}

export interface PerfProcessMetrics {
	readonly processes: readonly PerfProcessSample[];
	readonly mainHeap?: PerfMainHeap;
}

export interface PerfAggregateDuration {
	count: number;
	totalMs: number;
	maxMs: number;
	lastMs?: number;
}

export interface PerfTurnRecord {
	readonly sessionId: string;
	readonly turnId?: string;
	readonly startedAt: number;
	readonly endedAt?: number;
	readonly durationMs?: number;
	readonly endReason?: "agent_end" | "aborted" | "error";
	readonly modelCalls: number;
	readonly modelCallMs: number;
	readonly firstDeltaMs?: number;
	readonly toolCalls: number;
	readonly toolMs: number;
	readonly toolFailed: number;
	readonly compactions: number;
	readonly compactionMs: number;
	readonly compactionFailed: number;
	readonly peakInFlightEvents: number;
	readonly queueWaitMs?: number;
}

export interface PerfSessionActivity {
	readonly sessionId: string;
	readonly running: boolean;
	readonly currentTurn?: {
		readonly turnId?: string;
		readonly startedAt: number;
		readonly elapsedMs: number;
		readonly inFlightEvents: number;
		readonly modelCalls: number;
		readonly toolCalls: number;
	};
	readonly queueDepth: number;
	readonly oldestQueueWaitMs?: number;
}

export interface PerfAggregates {
	readonly turn: PerfAggregateDuration;
	readonly modelCall: PerfAggregateDuration;
	readonly tool: PerfAggregateDuration;
	readonly compaction: PerfAggregateDuration;
	readonly queueWait: PerfAggregateDuration;
	readonly eventLag: { lastMs?: number; maxMs: number };
	readonly errors: { runtime: number; provider: number; tool: number; extension: number };
	/** 订阅者投递队列丢弃的可丢中间态事件累计（终态与 delta 事件不丢）。 */
	readonly eventDelivery: { droppedEphemeral: number };
	/** 主进程事件循环阻塞窗口（旁路监测器周期折算；次数/毫秒，无用户内容）。 */
	readonly eventLoop: {
		overruns: number;
		maxOverrunMs: number;
		lastOverrunMs?: number;
	};
}

export interface DesktopPerfSnapshot {
	readonly at: number;
	readonly sampling: "active" | "idle";
	readonly processes: {
		readonly main?: PerfProcessSample;
		readonly heap?: PerfMainHeap;
		readonly renderers: readonly PerfProcessSample[];
		readonly gpu?: PerfProcessSample;
		readonly utility: readonly PerfProcessSample[];
		readonly totals: { readonly cpuPercent: number; readonly workingSetKb: number; readonly processCount: number };
	};
	/** 已注册后台进程的按 role 健康记账（崩溃/重启计数、预算耗尽、当前 pid）。 */
	readonly background?: readonly ProcessRoleHealth[];
	readonly runtime: {
		readonly sessions: readonly PerfSessionActivity[];
		readonly totals: {
			readonly activeSessions: number;
			readonly queuedInputs: number;
			readonly inFlightEvents: number;
		};
		readonly eventLag: { readonly lastMs?: number; readonly maxMs: number };
	};
	readonly aggregates: PerfAggregates;
}

export interface PerfMonitorReport {
	readonly generatedAt: number;
	readonly sampling: "active" | "idle";
	readonly latest?: DesktopPerfSnapshot;
	readonly recent: readonly DesktopPerfSnapshot[];
	readonly recentTurns: readonly PerfTurnRecord[];
	readonly aggregates: PerfAggregates;
	readonly sampleCount: number;
}

interface MutableTurnStats {
	readonly sessionId: string;
	turnId?: string;
	startedAt: number;
	endReason?: PerfTurnRecord["endReason"];
	inFlightEvents: number;
	peakInFlightEvents: number;
	modelCalls: number;
	modelCallMs: number;
	openModelCallAt?: number;
	firstDeltaMs?: number;
	toolCalls: number;
	toolMs: number;
	toolFailed: number;
	compactions: number;
	compactionMs: number;
	compactionFailed: number;
	openCompactionAt?: number;
	queueWaitMs: number;
}

/** apply() 的归约结果：把可立即聚合的段时长抛给调用方，避免二次计数。 */
export interface SessionPerfReduction {
	readonly completedTurn?: PerfTurnRecord;
	readonly queueWaitMs?: number;
	readonly modelCallMs?: number;
	readonly toolMs?: number;
	readonly toolFailed?: boolean;
	readonly compactionMs?: number;
	readonly compactionFailed?: boolean;
}

function createTurnStats(sessionId: string, startedAt: number): MutableTurnStats {
	return {
		sessionId,
		startedAt,
		inFlightEvents: 0,
		peakInFlightEvents: 0,
		modelCalls: 0,
		modelCallMs: 0,
		toolCalls: 0,
		toolMs: 0,
		toolFailed: 0,
		compactions: 0,
		compactionMs: 0,
		compactionFailed: 0,
		queueWaitMs: 0,
	};
}

function isQueueSnapshot(value: unknown): value is PerfQueueSnapshot {
	return typeof value === "object" && value !== null && Array.isArray((value as PerfQueueSnapshot).entries);
}

/**
 * 单个 Session 的事件归约器：把 SessionEvent 流折算成可关联到 Turn 的时长与
 * 计数。只累计数字，不保留事件本身。
 *
 * inFlightEvents 镜像 RuntimeHostSessionEventRelay 的 InFlightBuffer 规则：
 * agent_start 起收 assistant channel 事件，usage.update 清空，agent_end
 * 关闭——两侧读的是同一事件流，计数即缓冲水位。
 */
export class SessionPerfTracker {
	readonly sessionId: string;
	private turn: MutableTurnStats | undefined;
	private readonly queueEntries = new Map<string, { enqueuedAt?: number }>();

	constructor(sessionId: string) {
		this.sessionId = sessionId;
	}

	get running(): boolean {
		return this.turn !== undefined;
	}

	get queueDepth(): number {
		return this.queueEntries.size;
	}

	apply(event: SessionEvent): SessionPerfReduction {
		if (event.type === "queue.changed") {
			const queueWaitMs = this.applyQueueChanged(event);
			return queueWaitMs === undefined ? {} : { queueWaitMs };
		}
		if (event.type === "session.lifecycle") {
			if (event.phase === "agent_start") {
				this.turn = createTurnStats(this.sessionId, event.timestamp);
				return {};
			}
			if (event.phase === "aborted" && this.turn) {
				this.turn.endReason = "aborted";
				return {};
			}
			if (event.phase === "agent_end") {
				return { completedTurn: this.closeTurn(event.timestamp) };
			}
			return {};
		}
		const turn = this.turn;
		if (!turn) return {};

		if (event.channel === "assistant") {
			turn.inFlightEvents += 1;
			turn.peakInFlightEvents = Math.max(turn.peakInFlightEvents, turn.inFlightEvents);
			if (event.turnId && !turn.turnId) turn.turnId = event.turnId;
			if (event.type === "start") {
				turn.modelCalls += 1;
				turn.openModelCallAt = event.timestamp;
			} else if (event.type === "done" || event.type === "error") {
				let modelCallMs: number | undefined;
				if (turn.openModelCallAt !== undefined) {
					modelCallMs = Math.max(0, event.timestamp - turn.openModelCallAt);
					turn.modelCallMs += modelCallMs;
					turn.openModelCallAt = undefined;
				}
				if (event.type === "error") {
					turn.endReason = event.reason === "aborted" ? "aborted" : "error";
				}
				return modelCallMs === undefined ? {} : { modelCallMs };
			}
			if (turn.firstDeltaMs === undefined && (event.type === "text_delta" || event.type === "thinking_delta")) {
				turn.firstDeltaMs = Math.max(0, event.timestamp - turn.startedAt);
			}
			return {};
		}

		if (event.type === "usage.update") {
			turn.inFlightEvents = 0;
			return {};
		}
		if (event.type === "tool.end") {
			const toolMs = Math.max(0, event.durationMs);
			turn.toolCalls += 1;
			turn.toolMs += toolMs;
			if (event.isError) turn.toolFailed += 1;
			return { toolMs, toolFailed: event.isError };
		}
		if (event.type === "compaction.start") {
			turn.openCompactionAt = event.timestamp;
			return {};
		}
		if (event.type === "compaction.end") {
			turn.compactions += 1;
			let compactionMs: number | undefined;
			if (turn.openCompactionAt !== undefined) {
				compactionMs = Math.max(0, event.timestamp - turn.openCompactionAt);
				turn.compactionMs += compactionMs;
				turn.openCompactionAt = undefined;
			}
			const compactionFailed = event.success === false;
			if (compactionFailed) turn.compactionFailed += 1;
			return { ...(compactionMs !== undefined ? { compactionMs } : {}), compactionFailed };
		}
		if (event.type === "error") {
			turn.endReason = "error";
			return {};
		}
		return {};
	}

	activity(now: number): PerfSessionActivity {
		let oldestQueueWaitMs: number | undefined;
		for (const entry of this.queueEntries.values()) {
			if (entry.enqueuedAt === undefined) continue;
			const wait = Math.max(0, now - entry.enqueuedAt);
			oldestQueueWaitMs = oldestQueueWaitMs === undefined ? wait : Math.max(oldestQueueWaitMs, wait);
		}
		const turn = this.turn;
		return {
			sessionId: this.sessionId,
			running: turn !== undefined,
			...(turn
				? {
						currentTurn: {
							...(turn.turnId ? { turnId: turn.turnId } : {}),
							startedAt: turn.startedAt,
							elapsedMs: Math.max(0, now - turn.startedAt),
							inFlightEvents: turn.inFlightEvents,
							modelCalls: turn.modelCalls,
							toolCalls: turn.toolCalls,
						},
					}
				: {}),
			queueDepth: this.queueEntries.size,
			...(oldestQueueWaitMs !== undefined ? { oldestQueueWaitMs } : {}),
		};
	}

	/** Session 被释放时调用：未闭合的 Turn 直接丢弃，不留半截记录。 */
	dispose(): void {
		this.turn = undefined;
		this.queueEntries.clear();
	}

	private applyQueueChanged(event: SessionEvent): number | undefined {
		if (event.type !== "queue.changed") return undefined;
		const snapshot = isQueueSnapshot(event.snapshot) ? event.snapshot : undefined;
		if (!snapshot) return undefined;
		const next = new Map<string, { enqueuedAt?: number }>();
		for (const entry of snapshot.entries) {
			next.set(entry.id, { enqueuedAt: entry.enqueuedAt });
		}
		let waitSample: number | undefined;
		for (const [id, previous] of this.queueEntries) {
			if (next.has(id) || previous.enqueuedAt === undefined) continue;
			const wait = Math.max(0, event.timestamp - previous.enqueuedAt);
			waitSample = waitSample === undefined ? wait : Math.max(waitSample, wait);
		}
		this.queueEntries.clear();
		for (const [id, entry] of next) this.queueEntries.set(id, entry);
		if (waitSample !== undefined && this.turn) {
			this.turn.queueWaitMs += waitSample;
		}
		return waitSample;
	}

	private closeTurn(endedAt: number): PerfTurnRecord {
		const turn = this.turn;
		this.turn = undefined;
		if (!turn) {
			return {
				sessionId: this.sessionId,
				startedAt: endedAt,
				endedAt,
				durationMs: 0,
				endReason: "agent_end",
				modelCalls: 0,
				modelCallMs: 0,
				toolCalls: 0,
				toolMs: 0,
				toolFailed: 0,
				compactions: 0,
				compactionMs: 0,
				compactionFailed: 0,
				peakInFlightEvents: 0,
			};
		}
		return {
			sessionId: turn.sessionId,
			...(turn.turnId ? { turnId: turn.turnId } : {}),
			startedAt: turn.startedAt,
			endedAt,
			durationMs: Math.max(0, endedAt - turn.startedAt),
			endReason: turn.endReason ?? "agent_end",
			modelCalls: turn.modelCalls,
			modelCallMs: turn.modelCallMs,
			...(turn.firstDeltaMs !== undefined ? { firstDeltaMs: turn.firstDeltaMs } : {}),
			toolCalls: turn.toolCalls,
			toolMs: turn.toolMs,
			toolFailed: turn.toolFailed,
			compactions: turn.compactions,
			compactionMs: turn.compactionMs,
			compactionFailed: turn.compactionFailed,
			peakInFlightEvents: turn.peakInFlightEvents,
			...(turn.queueWaitMs > 0 ? { queueWaitMs: turn.queueWaitMs } : {}),
		};
	}
}

function recordDuration(aggregate: PerfAggregateDuration, durationMs: number): void {
	aggregate.count += 1;
	aggregate.totalMs += durationMs;
	aggregate.maxMs = Math.max(aggregate.maxMs, durationMs);
	aggregate.lastMs = durationMs;
}

export function createPerfAggregates(): PerfAggregates {
	return {
		turn: { count: 0, totalMs: 0, maxMs: 0 },
		modelCall: { count: 0, totalMs: 0, maxMs: 0 },
		tool: { count: 0, totalMs: 0, maxMs: 0 },
		compaction: { count: 0, totalMs: 0, maxMs: 0 },
		queueWait: { count: 0, totalMs: 0, maxMs: 0 },
		eventLag: { maxMs: 0 },
		errors: { runtime: 0, provider: 0, tool: 0, extension: 0 },
		eventDelivery: { droppedEphemeral: 0 },
		eventLoop: { overruns: 0, maxOverrunMs: 0 },
	};
}

/**
 * 把一个已完成的 Turn 折进聚合。段时长（模型调用/工具/压缩/排队等待）在
 * `SessionPerfReduction` 各事件粒度上聚合，这里只记 Turn 总时长，避免二次计数。
 */
export function accumulateTurn(aggregates: PerfAggregates, turn: PerfTurnRecord): void {
	if (turn.durationMs !== undefined) recordDuration(aggregates.turn, turn.durationMs);
}

/** 事件级段时长聚合入口。 */
export function recordPerfReduction(aggregates: PerfAggregates, reduction: SessionPerfReduction): void {
	if (reduction.queueWaitMs !== undefined) recordDuration(aggregates.queueWait, reduction.queueWaitMs);
	if (reduction.modelCallMs !== undefined) recordDuration(aggregates.modelCall, reduction.modelCallMs);
	if (reduction.toolMs !== undefined) recordDuration(aggregates.tool, reduction.toolMs);
	if (reduction.compactionMs !== undefined) recordDuration(aggregates.compaction, reduction.compactionMs);
}

export function classifyProcessMetricType(type: string): PerfProcessType {
	switch (type) {
		case "Browser":
			return "main";
		case "Tab":
			return "renderer";
		case "GPU":
			return "gpu";
		case "Utility":
			return "utility";
		default:
			return "other";
	}
}

export function buildPerfSnapshot(input: {
	readonly at: number;
	readonly sampling: "active" | "idle";
	readonly metrics?: PerfProcessMetrics;
	readonly sessions: readonly PerfSessionActivity[];
	readonly aggregates: PerfAggregates;
	readonly background?: readonly ProcessRoleHealth[];
}): DesktopPerfSnapshot {
	const processes = input.metrics?.processes ?? [];
	const renderers: PerfProcessSample[] = [];
	const utility: PerfProcessSample[] = [];
	let main: PerfProcessSample | undefined;
	let gpu: PerfProcessSample | undefined;
	let cpuPercent = 0;
	let workingSetKb = 0;
	for (const sample of processes) {
		cpuPercent += sample.cpuPercent;
		workingSetKb += sample.workingSetKb;
		if (sample.type === "main") main = sample;
		else if (sample.type === "renderer") renderers.push(sample);
		else if (sample.type === "gpu") gpu = sample;
		else utility.push(sample);
	}
	let queuedInputs = 0;
	let inFlightEvents = 0;
	let activeSessions = 0;
	for (const session of input.sessions) {
		if (session.running) activeSessions += 1;
		queuedInputs += session.queueDepth;
		inFlightEvents += session.currentTurn?.inFlightEvents ?? 0;
	}
	return {
		at: input.at,
		sampling: input.sampling,
		processes: {
			...(main ? { main } : {}),
			...(input.metrics?.mainHeap ? { heap: input.metrics.mainHeap } : {}),
			renderers,
			...(gpu ? { gpu } : {}),
			utility,
			totals: { cpuPercent, workingSetKb, processCount: processes.length },
		},
		...(input.background && input.background.length > 0 ? { background: input.background } : {}),
		runtime: {
			sessions: input.sessions,
			totals: { activeSessions, queuedInputs, inFlightEvents },
			eventLag: {
				...(input.aggregates.eventLag.lastMs !== undefined ? { lastMs: input.aggregates.eventLag.lastMs } : {}),
				maxMs: input.aggregates.eventLag.maxMs,
			},
		},
		aggregates: input.aggregates,
	};
}
