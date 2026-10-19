// Copyright The Open Forge contributors.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { claim } from "./leases.mjs";
import { operation } from "./operations.mjs";
import { loop, loopLimits } from "./orchestrate.mjs";
import { claimNext } from "./queue.mjs";
import { createStore } from "./store.mjs";

const roots = [];
function fixture() {
	const root = mkdtempSync(join(tmpdir(), "forge-autonomy-queue-"));
	roots.push(root);
	const task = (id, priority, dependsOn = [], writePaths = [`${id}.txt`]) => ({
		id,
		status: "ready",
		priority,
		dependsOn,
		writePaths,
		readPaths: [],
		exclusivePaths: [],
		conflictsWith: [],
	});
	return {
		root,
		store: createStore(join(root, "state")),
		tasks: [
			task("TASK-0001", "P1"),
			task("TASK-0002", "P0", ["TASK-0001"]),
			task("TASK-0003", "P2", [], ["TASK-0001.txt"]),
		],
	};
}
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const completed = (id) => ({
	id,
	status: "done",
	integrationStatus: "integrated",
	dependsOn: [],
});

function claimFrom(context, tasks, store, options) {
	const result = claimNext(context.root, store, options, () => ({ tasks, problems: [] }));
	return {
		selected: result.token?.task ?? null,
		conflicts: result.conflicts.filter((entry) => entry.task === result.task?.id).map((entry) => entry.task),
	};
}

describe("bounded queue selection", () => {
	it("follows priority and never leases a Task whose dependency is not integrated", () => {
		const context = fixture();
		const first = claimFrom(context, context.tasks, context.store, {
			holder: "worker",
			runId: "run-one",
			ttl: 10000,
		});
		expect(first).toEqual({ selected: "TASK-0001", conflicts: [] });
		const second = claimFrom(context, context.tasks, context.store, {
			holder: "worker",
			runId: "run-two",
			ttl: 10000,
		});
		expect(second).toEqual({ selected: null, conflicts: [] });
		expect(context.store.read().leases["TASK-0001"]).toMatchObject({ status: "active", runId: "run-one" });
	});
	it("does not treat an unintegrated dependency as completed", () => {
		const context = fixture();
		const tasks = [completed("TASK-0001"), { ...context.tasks[2], dependsOn: ["TASK-0001"] }];
		tasks[0].integrationStatus = "pending";
		expect(claimFrom(context, tasks, context.store, { holder: "worker", runId: "run-one", ttl: 10000 })).toEqual({
			selected: null,
			conflicts: [],
		});
	});
});

describe("operation boundary", () => {
	it("rejects operations outside the closed CLI routing table", async () => {
		await expect(operation({ command: "unknown" })).rejects.toThrow(/unsupported/);
	});
});
function backlogFixture(count) {
	const context = fixture();
	mkdirSync(join(context.root, "project/tasks"), { recursive: true });
	context.tasks.length = 0;
	for (let index = 0; index < count; index += 1) {
		const number = String(index + 1).padStart(4, "0");
		const id = `TASK-${number}`;
		const text = [
			"---",
			`id: ${id}`,
			"type: task",
			"status: ready",
			"priority: P0",
			"owner: fixture",
			"source: user-request",
			"execution: serial",
			"branch: unassigned",
			"worktree: unassigned",
			`base_commit: ${"a".repeat(40)}`,
			"read_paths: []",
			`write_paths: [TASK-${number}.txt]`,
			"exclusive_paths: []",
			"depends_on: []",
			"conflicts_with: []",
			"integration_status: pending",
			"created: 2026-10-20",
			"updated: 2026-10-20",
			"---",
			"# Fixture",
			"",
		].join("\n");
		writeFileSync(join(context.root, `project/tasks/${id}-fixture.md`), text);
	}
	return context;
}

describe("bounded loop limits and summaries", () => {
	const queueFixture = () => {
		const context = fixture();
		mkdirSync(join(context.root, "project/tasks"), { recursive: true });
		const taskText = (id, priority, dependsOn, status = "ready") =>
			[
				"---",
				`id: ${id}`,
				"type: task",
				`status: ${status}`,
				`priority: ${priority}`,
				"owner: fixture",
				"source: user-request",
				"execution: serial",
				"branch: unassigned",
				"worktree: unassigned",
				`base_commit: ${"a".repeat(40)}`,
				"read_paths: []",
				"write_paths: [TASK-0001.txt]",
				"exclusive_paths: []",
				`depends_on: [${dependsOn}]`,
				"conflicts_with: []",
				"integration_status: pending",
				"created: 2026-10-20",
				"updated: 2026-10-20",
				"---",
				"# Fixture",
				"",
			].join("\n");
		writeFileSync(join(context.root, "project/tasks/TASK-0001-fixture.md"), taskText("TASK-0001", "P0", ""));
		writeFileSync(join(context.root, "project/tasks/TASK-0002-fixture.md"), taskText("TASK-0002", "P1", "TASK-0001"));
		return context;
	};

	it("rejects unbounded or malformed loop budgets", () => {
		expect(loopLimits(1, 2)).toEqual({ limit: 1, maxStalls: 2 });
		expect(() => loopLimits(0, 1)).toThrow(/1\.\.100/);
		expect(() => loopLimits(101, 1)).toThrow(/1\.\.100/);
		expect(() => loopLimits(1.5, 1)).toThrow(/1\.\.100/);
		expect(() => loopLimits(1, 0)).toThrow(/1\.\.10/);
		expect(() => loopLimits(1, 11)).toThrow(/1\.\.10/);
	});
	it("stops after two consecutive stalled claims without exceeding the limit", async () => {
		const context = backlogFixture(5);
		const calls = [];
		const result = await loop({
			root: context.root,
			store: context.store,
			policy: { paused: false, limits: { leaseMs: 10_000 } },
			settings: {},
			holder: "controller",
			runPrefix: "loop-budget",
			limit: 5,
			maxStalls: 2,
			execute: async ({ taskId, runId }) => {
				calls.push({ taskId, runId });
				return { runId, status: "needs-action", reason: "fixture stalled" };
			},
		});
		expect(calls).toEqual([
			{ taskId: "TASK-0001", runId: "loop-budget-1" },
			{ taskId: "TASK-0002", runId: "loop-budget-2" },
		]);
		expect(result).toMatchObject({
			stopReason: "stalled",
			lastRunId: "loop-budget-2",
			completed: ["TASK-0001", "TASK-0002"],
		});
		expect(result.started).toHaveLength(2);
	});
	it("resets stalls after progress and honors the total budget", async () => {
		const context = backlogFixture(5);
		const statuses = ["needs-action", "verified", "needs-action", "needs-action"];
		const result = await loop({
			root: context.root,
			store: context.store,
			policy: { paused: false, limits: { leaseMs: 10_000 } },
			settings: {},
			holder: "controller",
			runPrefix: "loop-progress",
			limit: 4,
			maxStalls: 2,
			execute: async ({ runId }) => ({ runId, status: statuses.shift(), reason: null }),
		});
		expect(result.stopReason).toBe("stalled");
		expect(result.started.map((entry) => entry.task)).toEqual(["TASK-0001", "TASK-0002", "TASK-0003", "TASK-0004"]);
		const capped = await loop({
			root: context.root,
			store: context.store,
			policy: { paused: false, limits: { leaseMs: 10_000 } },
			settings: {},
			holder: "next-controller",
			runPrefix: "loop-cap",
			limit: 1,
			maxStalls: 2,
			execute: async ({ runId }) => ({ runId, status: "verified" }),
		});
		expect(capped.stopReason).toBe("limit");
		expect(capped.started).toHaveLength(1);
	});
	it("wraps one runnable Task before reporting its remaining dependency", async () => {
		const context = queueFixture();
		const result = await loop({
			root: context.root,
			store: context.store,
			policy: { paused: false, limits: { leaseMs: 10_000 } },
			settings: {},
			holder: "controller",
			runPrefix: "loop-empty",
			limit: 2,
		});
		expect(result).toMatchObject({
			stopReason: "no-eligible-task",
			started: [{ task: "TASK-0001", runId: "loop-empty-1", status: "needs-action" }],
			lastRunId: "loop-empty-1",
			notRun: [
				{ task: "TASK-0002", reason: "dependency-waiting" },
				{ task: "TASK-0001", reason: "already-leased" },
			],
		});
		expect(context.store.read().runs).toEqual({});
		expect(context.store.read().leases["TASK-0001"]).toMatchObject({ status: "active", runId: "loop-empty-1" });
	});
	it("refuses to lease any ready Task when only blocked work remains", async () => {
		const context = queueFixture();
		const lockedUntil = Date.now() + 60_000;
		context.store.transaction((state) => {
			state.leases["TASK-0009"] = {
				task: "TASK-0009",
				holder: "other",
				runId: "other-run",
				generation: 1,
				status: "active",
				acquiredAt: Date.now(),
				expiresAt: lockedUntil,
				writePaths: ["TASK-0001.txt"],
				readPaths: [],
				exclusivePaths: [],
				conflictsWith: [],
			};
		});
		const result = await loop({
			root: context.root,
			store: context.store,
			policy: { paused: false, limits: { leaseMs: 10_000 } },
			settings: {},
			holder: "controller",
			runPrefix: "loop-conflict",
			limit: 1,
		});
		expect(result.stopReason).toBe("blocked");
		expect(result.started).toEqual([]);
		expect(result.notRun).toEqual([
			{ task: "TASK-0002", reason: "dependency-waiting" },
			{ task: "TASK-0001", reason: "task scope conflict: TASK-0009" },
		]);
		expect(context.store.read().leases["TASK-0009"].expiresAt).toBe(lockedUntil);
		expect(context.store.read().runs).toEqual({});
	});
	it("honors pause before selecting and cancellation without claiming work", async () => {
		const context = queueFixture();
		context.store.transaction((state) => {
			state.control.paused = true;
		});
		const paused = await loop({
			root: context.root,
			store: context.store,
			policy: { paused: false, limits: { leaseMs: 10_000 } },
			settings: {},
			holder: "controller",
			runPrefix: "loop-paused",
			limit: 3,
		});
		expect(paused).toMatchObject({
			stopReason: "paused",
			started: [],
			lastRunId: null,
		});
		expect(context.store.read().runs).toEqual({});
		expect(context.store.read().leases).toEqual({});
		context.store.transaction((state) => {
			state.control.paused = false;
		});
		const controller = new AbortController();
		controller.abort();
		const result = await loop({
			root: context.root,
			store: context.store,
			policy: { paused: false, limits: { leaseMs: 10_000 } },
			settings: {},
			holder: "controller",
			runPrefix: "loop-cancel",
			limit: 3,
			signal: controller.signal,
		});
		expect(result.stopReason).toBe("cancelled");
		expect(result.started).toEqual([]);
		expect(context.store.read().runs).toEqual({});
	});
	it("keeps a cancelled, claimed run available for an explicit resume without claiming another Task", async () => {
		const context = queueFixture();
		const task = {
			id: "TASK-0001",
			status: "ready",
			dependsOn: [],
			writePaths: ["TASK-0001.txt"],
			readPaths: [],
			exclusivePaths: [],
			conflictsWith: [],
		};
		claim(context.store, task, { holder: "controller", runId: "loop-resume-1", ttl: 60_000 });
		context.store.transaction((state) => {
			state.runs["loop-resume-1"] = {
				task: "TASK-0001",
				status: "claimed",
				attempts: [],
				authors: [],
				checks: [],
				review: null,
				contract: { checks: [] },
			};
		});
		const controller = new AbortController();
		controller.abort();
		const result = await loop({
			root: context.root,
			store: context.store,
			policy: { paused: false, limits: { leaseMs: 10_000 } },
			settings: {},
			holder: "controller",
			runPrefix: "loop-resume",
			limit: 2,
			signal: controller.signal,
		});
		expect(result.stopReason).toBe("cancelled");
		expect(Object.keys(context.store.read().runs)).toEqual(["loop-resume-1"]);
		expect(context.store.read().leases["TASK-0001"]).toMatchObject({ status: "active", runId: "loop-resume-1" });
	});
	it("refuses malformed dependency records in the injected queue loader", () => {
		const context = queueFixture();
		expect(() =>
			claimFrom(context, [{ ...context.tasks[0], dependsOn: "TASK-0002" }], context.store, {
				holder: "controller",
				runId: "run-bad",
				ttl: 10000,
			}),
		).toThrow(/dependsOn/);
	});
});
