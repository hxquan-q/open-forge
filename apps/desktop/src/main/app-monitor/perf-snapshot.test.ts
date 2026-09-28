// Copyright The Open Forge contributors.
import { type AssistantMessage, type AssistantMessageEvent, createAssistantMessage } from "@vetta/ai";
import type { SessionEvent } from "@vetta/runtime-core";
import { describe, expect, it } from "vitest";
import {
	accumulateTurn,
	buildPerfSnapshot,
	classifyProcessMetricType,
	createPerfAggregates,
	recordPerfReduction,
	SessionPerfTracker,
} from "./perf-snapshot.js";

const SESSION = "session-1";
let sequence = 0;

function base(timestamp: number) {
	sequence += 1;
	return {
		schemaVersion: 1 as const,
		sessionId: SESSION,
		eventId: `event-${sequence}`,
		timestamp,
		source: "runtime-core" as const,
		sequence,
	};
}

function lifecycle(
	phase: "agent_start" | "agent_end" | "aborted" | "turn_start" | "turn_end",
	timestamp: number,
): SessionEvent {
	return { ...base(timestamp), channel: "runtime", type: "session.lifecycle", phase };
}

function assistantMessage(timestamp: number): AssistantMessage {
	return createAssistantMessage({ api: "openai-completions", provider: "openai", model: "gpt-test" }, { timestamp });
}

function assistant(timestamp: number, event: AssistantMessageEvent): SessionEvent {
	return {
		...base(timestamp),
		channel: "assistant",
		source: "agent",
		turnId: "turn-1",
		modelCallIndex: 0,
		...event,
	};
}

function toolEnd(timestamp: number, durationMs: number, isError = false): SessionEvent {
	return {
		...base(timestamp),
		type: "tool.end",
		toolCallId: "call-1",
		toolName: "read",
		isError,
		result: {},
		startedAt: timestamp - durationMs,
		durationMs,
		phases: [],
	};
}

function errorEvent(timestamp: number, origin: "runtime" | "provider" | "tool" | "extension"): SessionEvent {
	return {
		...base(timestamp),
		type: "error",
		error: { code: "X", message: "x", retryable: false, origin },
	};
}

function queueChanged(timestamp: number, entries: readonly { id: string; enqueuedAt?: number }[]): SessionEvent {
	return {
		...base(timestamp),
		type: "queue.changed",
		paused: false,
		entries: entries.map((entry) => ({
			id: entry.id,
			behavior: "followUp" as const,
			kind: "message" as const,
			displayText: "",
		})),
		snapshot: {
			paused: false,
			entries: entries.map((entry) => ({
				id: entry.id,
				behavior: "followUp" as const,
				input: { message: { role: "user" as const, content: "x", timestamp: 0 } },
				...(entry.enqueuedAt !== undefined ? { enqueuedAt: entry.enqueuedAt } : {}),
			})),
		},
	};
}

describe("SessionPerfTracker", () => {
	it("归约一个完整 Turn：模型调用、首个 delta、工具与压缩时长", () => {
		const tracker = new SessionPerfTracker(SESSION);
		tracker.apply(lifecycle("agent_start", 1_000));
		tracker.apply(assistant(1_050, { type: "start", partial: assistantMessage(1_050) }));
		tracker.apply(
			assistant(1_200, { type: "text_delta", contentIndex: 0, delta: "hi", partial: assistantMessage(1_200) }),
		);
		const modelEnd = tracker.apply(
			assistant(1_500, { type: "done", reason: "stop", message: assistantMessage(1_500) }),
		);
		expect(modelEnd.modelCallMs).toBe(450);
		const tool = tracker.apply(toolEnd(1_800, 120));
		expect(tool.toolMs).toBe(120);
		tracker.apply({ ...base(1_900), type: "compaction.start", reason: "manual" });
		const compaction = tracker.apply({ ...base(2_300), type: "compaction.end", success: true });
		expect(compaction.compactionMs).toBe(400);
		const { completedTurn } = tracker.apply(lifecycle("agent_end", 2_500));

		expect(completedTurn).toMatchObject({
			sessionId: SESSION,
			turnId: "turn-1",
			startedAt: 1_000,
			endedAt: 2_500,
			durationMs: 1_500,
			endReason: "agent_end",
			modelCalls: 1,
			modelCallMs: 450,
			firstDeltaMs: 200,
			toolCalls: 1,
			toolMs: 120,
			toolFailed: 0,
			compactions: 1,
			compactionMs: 400,
			peakInFlightEvents: 3,
		});
	});

	it("assistant error 事件携带 aborted reason 时 Turn 以 aborted 收尾", () => {
		const tracker = new SessionPerfTracker(SESSION);
		tracker.apply(lifecycle("agent_start", 0));
		tracker.apply(assistant(10, { type: "error", reason: "aborted", error: assistantMessage(10) }));
		const { completedTurn } = tracker.apply(lifecycle("agent_end", 20));
		expect(completedTurn?.endReason).toBe("aborted");
	});

	it("queue.changed 条目消失时按其 enqueuedAt 计一次排队等待", () => {
		const tracker = new SessionPerfTracker(SESSION);
		tracker.apply(queueChanged(1_000, [{ id: "a", enqueuedAt: 800 }]));
		expect(tracker.apply(queueChanged(1_300, [])).queueWaitMs).toBe(500);
		// 无 enqueuedAt 的遗留条目消失不产生等待样本
		tracker.apply(queueChanged(1_400, [{ id: "b" }]));
		expect(tracker.apply(queueChanged(1_600, [])).queueWaitMs).toBeUndefined();
	});

	it("activity 反映运行中 Turn 与最老排队条目的等待时长", () => {
		const tracker = new SessionPerfTracker(SESSION);
		tracker.apply(lifecycle("agent_start", 1_000));
		tracker.apply(assistant(1_050, { type: "start", partial: assistantMessage(1_050) }));
		tracker.apply(
			queueChanged(1_100, [
				{ id: "a", enqueuedAt: 900 },
				{ id: "b", enqueuedAt: 950 },
			]),
		);

		const activity = tracker.activity(2_000);
		expect(activity.running).toBe(true);
		expect(activity.queueDepth).toBe(2);
		expect(activity.oldestQueueWaitMs).toBe(1_100);
		expect(activity.currentTurn?.elapsedMs).toBe(1_000);
		expect(activity.currentTurn?.modelCalls).toBe(1);
	});
});

describe("buildPerfSnapshot", () => {
	it("按 Electron ProcessMetric 类型归类并合计 CPU/内存", () => {
		const snapshot = buildPerfSnapshot({
			at: 10_000,
			sampling: "active",
			metrics: {
				processes: [
					{ pid: 1, type: "main", cpuPercent: 4, workingSetKb: 100 },
					{ pid: 2, type: "renderer", cpuPercent: 8, workingSetKb: 200 },
					{ pid: 3, type: "gpu", cpuPercent: 2, workingSetKb: 50 },
					{ pid: 4, type: "utility", cpuPercent: 1, workingSetKb: 30 },
				],
				mainHeap: { heapUsedBytes: 10, heapTotalBytes: 20, rssBytes: 30 },
			},
			sessions: [
				{
					sessionId: SESSION,
					running: true,
					currentTurn: { startedAt: 9_000, elapsedMs: 1_000, inFlightEvents: 5, modelCalls: 1, toolCalls: 0 },
					queueDepth: 1,
					oldestQueueWaitMs: 300,
				},
			],
			aggregates: createPerfAggregates(),
		});

		expect(snapshot.processes.main?.pid).toBe(1);
		expect(snapshot.processes.renderers).toHaveLength(1);
		expect(snapshot.processes.gpu?.pid).toBe(3);
		expect(snapshot.processes.utility).toHaveLength(1);
		expect(snapshot.processes.totals).toEqual({ cpuPercent: 15, workingSetKb: 380, processCount: 4 });
		expect(snapshot.runtime.totals).toEqual({ activeSessions: 1, queuedInputs: 1, inFlightEvents: 5 });
	});

	it("按 role 附带后台进程健康记账，未注册时省略", () => {
		const snapshot = buildPerfSnapshot({
			at: 1_000,
			sampling: "idle",
			metrics: {
				processes: [{ pid: 9, type: "utility", cpuPercent: 0, workingSetKb: 10, role: "speech-input-host" }],
			},
			sessions: [],
			aggregates: createPerfAggregates(),
			background: [
				{
					role: "speech-input-host",
					kind: "utility-process",
					crashes: 2,
					restarts: 1,
					pid: 9,
					restartBudgetExhausted: false,
				},
			],
		});

		expect(snapshot.processes.utility[0]?.role).toBe("speech-input-host");
		expect(snapshot.background).toEqual([
			expect.objectContaining({ role: "speech-input-host", crashes: 2, restarts: 1, pid: 9 }),
		]);

		const bare = buildPerfSnapshot({ at: 1_000, sampling: "idle", sessions: [], aggregates: createPerfAggregates() });
		expect(bare.background).toBeUndefined();
	});

	it("classifyProcessMetricType 映射 Electron 进程类型", () => {
		expect(classifyProcessMetricType("Browser")).toBe("main");
		expect(classifyProcessMetricType("Tab")).toBe("renderer");
		expect(classifyProcessMetricType("GPU")).toBe("gpu");
		expect(classifyProcessMetricType("Utility")).toBe("utility");
		expect(classifyProcessMetricType("Zygote")).toBe("other");
	});
});

describe("aggregates", () => {
	it("recordPerfReduction 按事件粒度聚合各段时长", () => {
		const aggregates = createPerfAggregates();
		recordPerfReduction(aggregates, { modelCallMs: 300 });
		recordPerfReduction(aggregates, { modelCallMs: 900 });
		recordPerfReduction(aggregates, { toolMs: 50, toolFailed: true });
		recordPerfReduction(aggregates, { queueWaitMs: 40 });
		expect(aggregates.modelCall).toMatchObject({ count: 2, totalMs: 1_200, maxMs: 900, lastMs: 900 });
		expect(aggregates.tool).toMatchObject({ count: 1, totalMs: 50 });
		expect(aggregates.queueWait).toMatchObject({ count: 1, totalMs: 40 });
	});

	it("error 事件计数由调用方按 origin 归属", () => {
		const tracker = new SessionPerfTracker(SESSION);
		tracker.apply(lifecycle("agent_start", 0));
		tracker.apply(errorEvent(10, "provider"));
		const { completedTurn } = tracker.apply(lifecycle("agent_end", 20));
		expect(completedTurn?.endReason).toBe("error");
		accumulateTurn(createPerfAggregates(), completedTurn!);
	});
});
