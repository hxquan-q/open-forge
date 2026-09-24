import type { RuntimeHost, SessionEvent } from "@vetta/runtime-core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type AppMonitorData, normalizeAppMonitorData } from "./app-monitor-data";
import type { AppMonitorMonthData } from "./app-monitor-month-data";
import type { AppMonitorProfile } from "./app-monitor-profile";

const persisted = vi.hoisted(() => new Map<string, unknown>());

vi.mock("../logger.js", () => ({
	getAppLogger: () => ({
		debug: () => undefined,
		info: () => undefined,
		warn: () => undefined,
		error: () => undefined,
		log: () => undefined,
	}),
}));

vi.mock("../abilities/ability-lifecycle-log.js", () => ({
	logAbilityLifecycleEvent: () => undefined,
}));

vi.mock("./perf-monitor-service.js", () => ({
	observePerfSession: () => undefined,
	unobservePerfSession: () => undefined,
}));

vi.mock("./migrations/index.js", () => ({
	runAppMonitorFileMigrations: () => Promise.resolve(),
}));

vi.mock("./app-monitor-store.js", async () => {
	const { createDefaultAppMonitorData } = await import("./app-monitor-data.js");
	const { createDefaultAppMonitorMonthData } = await import("./app-monitor-month-data.js");
	const { createDefaultAppMonitorProfile } = await import("./app-monitor-profile.js");
	const makeStore = (key: string, fallback: () => unknown) => ({
		read: () => {
			const hit = persisted.get(key);
			return Promise.resolve(hit === undefined ? fallback() : structuredClone(hit));
		},
		write: (value: unknown) => {
			persisted.set(key, structuredClone(value));
			return Promise.resolve();
		},
	});
	return {
		appMonitorStore: makeStore("summary", () => createDefaultAppMonitorData()),
		appMonitorProfileStore: makeStore("profile", () => createDefaultAppMonitorProfile()),
		createAppMonitorMonthStore: (monthKey: string, profile: AppMonitorProfile) =>
			makeStore(`month:${monthKey}`, () => createDefaultAppMonitorMonthData(monthKey, profile)),
	};
});

import {
	getAppMonitorSnapshot,
	initializeAppMonitor,
	monitorRuntimeSession,
	recordRuntimeCompaction,
	shutdownAppMonitor,
} from "./app-monitor-service";

type RuntimeCompactionEvent = Extract<SessionEvent, { type: "compaction.start" | "compaction.end" }>;

function compactionStart(sessionId: string, timestamp: number): RuntimeCompactionEvent {
	return {
		schemaVersion: 1,
		channel: "runtime",
		sessionId,
		eventId: `evt-${sessionId}-${timestamp}-start`,
		timestamp,
		source: "agent",
		type: "compaction.start",
		reason: "threshold",
		contextTokens: 120_000,
		contextWindow: 200_000,
		thresholdTokens: 160_000,
	};
}

function compactionEnd(
	sessionId: string,
	timestamp: number,
	success: boolean,
	errorMessage?: string,
): RuntimeCompactionEvent {
	return {
		schemaVersion: 1,
		channel: "runtime",
		sessionId,
		eventId: `evt-${sessionId}-${timestamp}-end`,
		timestamp,
		source: "agent",
		type: "compaction.end",
		success,
		errorMessage,
	};
}

function createFakeRuntime(): { runtime: RuntimeHost; emit: (sessionId: string, event: SessionEvent) => void } {
	const listeners = new Map<string, (event: SessionEvent) => void>();
	const runtime = {
		subscribe: (sessionId: string, handler: (event: SessionEvent) => void) => {
			listeners.set(sessionId, handler);
			return () => {
				listeners.delete(sessionId);
			};
		},
	} as unknown as RuntimeHost;
	return {
		runtime,
		emit: (sessionId, event) => listeners.get(sessionId)?.(event),
	};
}

describe("app monitor runtime compaction accounting", () => {
	beforeAll(async () => {
		await initializeAppMonitor();
	});

	afterAll(async () => {
		await shutdownAppMonitor();
	});

	it("counts compactions for sessions that never go through monitorRuntimeSession", () => {
		// BUG-0003 复现路径：Agent Team 成员/协调会话不经 monitorRuntimeSession，
		// 压缩事件只能通过宿主级 sessionCompactionObserver 抵达计数器。
		const before = getAppMonitorSnapshot().compactions;
		recordRuntimeCompaction(compactionStart("team-member-a", 1_000));
		recordRuntimeCompaction(compactionEnd("team-member-a", 1_500, true));
		recordRuntimeCompaction(compactionStart("team-coordinator", 2_000));
		recordRuntimeCompaction(compactionEnd("team-coordinator", 2_500, false, "model cancelled"));
		const after = getAppMonitorSnapshot().compactions;
		expect({
			started: after.started - before.started,
			succeeded: after.succeeded - before.succeeded,
			failed: after.failed - before.failed,
		}).toEqual({ started: 2, succeeded: 1, failed: 1 });
	});

	it("does not double count when the same events also pass a session subscription", () => {
		// 宿主 observer 与 per-session 订阅看到的是同一事件流；订阅路径不再计 compaction。
		const { runtime, emit } = createFakeRuntime();
		monitorRuntimeSession(runtime, "s-1", "interactive");
		const before = getAppMonitorSnapshot().compactions;
		const start = compactionStart("s-1", 3_000);
		emit("s-1", start);
		recordRuntimeCompaction(start);
		const end = compactionEnd("s-1", 3_400, true);
		emit("s-1", end);
		recordRuntimeCompaction(end);
		const after = getAppMonitorSnapshot().compactions;
		expect({
			started: after.started - before.started,
			succeeded: after.succeeded - before.succeeded,
			failed: after.failed - before.failed,
		}).toEqual({ started: 1, succeeded: 1, failed: 0 });
	});

	it("never stores compaction payloads in monitor data", () => {
		const secret = "USER_PRIVATE_CONTENT_9f8e7d";
		recordRuntimeCompaction(compactionEnd("s-secret", 5_000, false, secret));
		expect(JSON.stringify(getAppMonitorSnapshot())).not.toContain(secret);
	});

	it("persists counters so a restart reloads the same aggregates", async () => {
		recordRuntimeCompaction(compactionStart("s-persist", 6_000));
		recordRuntimeCompaction(compactionEnd("s-persist", 6_500, true));
		const snapshot = getAppMonitorSnapshot();
		await shutdownAppMonitor();

		const written = persisted.get("summary") as AppMonitorData;
		expect(written.compactions).toEqual(snapshot.compactions);
		// 重启路径：持久化数据经 normalize 读回，聚合计数不丢。
		expect(normalizeAppMonitorData(structuredClone(written)).compactions).toEqual(snapshot.compactions);

		// 汇总计数与各月度日桶的聚合同源：日桶之和必须等于导出快照。
		const bucketTotal = [...persisted.entries()]
			.filter(([key]) => key.startsWith("month:"))
			.flatMap(([, month]) => Object.values((month as AppMonitorMonthData).days))
			.reduce((total, day) => total + day.data.compactions.started, 0);
		expect(bucketTotal).toBe(snapshot.compactions.started);
	});
});
