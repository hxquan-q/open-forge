// Copyright The Open Forge contributors.
import type { RuntimeSessionTaskState, RuntimeTaskEvent, RuntimeTaskSnapshot } from "@vetta/runtime-core/task";
import { describe, expect, it } from "vitest";
import { applyTaskFactEvent, mergeTaskStateSeed } from "./task-projection.js";

function snapshotAt(status: RuntimeTaskSnapshot["status"], updatedAt = 100): RuntimeTaskSnapshot {
	return {
		schemaVersion: 1,
		identity: { taskId: "task-1", rootSessionId: "session-1" },
		status,
		title: "整理文档",
		createdAt: 90,
		updatedAt,
		artifactIds: [],
		pendingApprovalIds: [],
	};
}

function statusEvent(to: RuntimeTaskSnapshot["status"], at = 101): RuntimeTaskEvent {
	return {
		schemaVersion: 1,
		taskId: "task-1",
		eventId: `task-1:${to}:${at}`,
		at,
		type: "task.status_changed",
		from: "planning",
		to,
	};
}

const EMPTY: RuntimeSessionTaskState = { tasks: [], artifacts: [], pendingApprovals: [], approvalDecisions: new Map() };

describe("applyTaskFactEvent", () => {
	it("task.created 插入快照；同 taskId 的重复 created 幂等忽略", () => {
		const created: RuntimeTaskEvent = {
			schemaVersion: 1,
			taskId: "task-1",
			eventId: "task-1:created",
			at: 90,
			type: "task.created",
			snapshot: snapshotAt("planning", 90),
		};
		const state = applyTaskFactEvent(EMPTY, { type: "task.lifecycle", task: created });
		expect(state.tasks).toHaveLength(1);
		const again = applyTaskFactEvent(state, { type: "task.lifecycle", task: created });
		expect(again).toBe(state);
	});

	it("status_changed 更新状态；turn_bound 绑定回合；审批列表进出成对", () => {
		let state = applyTaskFactEvent(EMPTY, {
			type: "task.lifecycle",
			task: {
				schemaVersion: 1,
				taskId: "task-1",
				eventId: "task-1:created",
				at: 90,
				type: "task.created",
				snapshot: snapshotAt("planning", 90),
			},
		});
		state = applyTaskFactEvent(state, { type: "task.lifecycle", task: statusEvent("running", 101) });
		expect(state.tasks[0].status).toBe("running");
		state = applyTaskFactEvent(state, {
			type: "task.lifecycle",
			task: {
				schemaVersion: 1,
				taskId: "task-1",
				eventId: "task-1:bind",
				at: 102,
				type: "task.turn_bound",
				turnId: "turn-1",
				generation: "gen-1",
			},
		});
		expect(state.tasks[0].activeTurnId).toBe("turn-1");
		expect(state.tasks[0].activeGeneration).toBe("gen-1");
		state = applyTaskFactEvent(state, {
			type: "task.lifecycle",
			task: {
				schemaVersion: 1,
				taskId: "task-1",
				eventId: "task-1:approval",
				at: 103,
				type: "task.approval_requested",
				approvalId: "approval-1",
			},
		});
		expect(state.tasks[0].pendingApprovalIds).toEqual(["approval-1"]);
		state = applyTaskFactEvent(state, {
			type: "task.lifecycle",
			task: {
				schemaVersion: 1,
				taskId: "task-1",
				eventId: "task-1:approval-done",
				at: 104,
				type: "task.approval_resolved",
				approvalId: "approval-1",
				decision: "approve",
			},
		});
		expect(state.tasks[0].pendingApprovalIds).toEqual([]);
	});

	it("未知 Task 的后续事件被忽略；artifact descriptor 取最后一条", () => {
		let state = applyTaskFactEvent(EMPTY, { type: "task.lifecycle", task: statusEvent("running") });
		expect(state.tasks).toHaveLength(0);
		const descriptor = {
			schemaVersion: 1 as const,
			artifactId: "artifact-1",
			kind: "document" as const,
			status: "generated" as const,
			title: "第一版",
			uri: "file:///out.md",
			version: 1,
			sourceSessionId: "session-1",
			createdAt: 100,
			updatedAt: 100,
		};
		state = applyTaskFactEvent(state, { type: "artifact.descriptor", artifact: descriptor });
		state = applyTaskFactEvent(state, {
			type: "artifact.descriptor",
			artifact: { ...descriptor, title: "第二版", version: 2, updatedAt: 110 },
		});
		expect(state.artifacts).toHaveLength(1);
		expect(state.artifacts[0].title).toBe("第二版");
	});
});

describe("mergeTaskStateSeed", () => {
	it("快照补齐按 updatedAt 取新，事件竞态先到的事实不被旧快照覆盖", () => {
		const current: RuntimeSessionTaskState = {
			tasks: [snapshotAt("running", 300)],
			artifacts: [],
			pendingApprovals: [],
			approvalDecisions: new Map<never, never>(),
		};
		const seed: RuntimeSessionTaskState = {
			tasks: [snapshotAt("planning", 200)],
			artifacts: [],
			pendingApprovals: [],
			approvalDecisions: new Map<never, never>(),
		};
		const merged = mergeTaskStateSeed(current, seed);
		expect(merged.tasks[0].status).toBe("running");
		const mergedNewer = mergeTaskStateSeed(current, {
			tasks: [snapshotAt("awaiting_review", 400)],
			artifacts: [],
			pendingApprovals: [],
			approvalDecisions: new Map<never, never>(),
		});
		expect(mergedNewer.tasks[0].status).toBe("awaiting_review");
	});
});
