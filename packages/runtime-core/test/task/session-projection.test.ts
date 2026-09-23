// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import {
	type ArtifactDescriptor,
	createRuntimeTaskSnapshot,
	projectRuntimeSessionTaskState,
	type RuntimeTaskEvent,
	type RuntimeTaskIdentity,
	transitionRuntimeTask,
} from "../../src/task/index.js";
import { artifactDescriptorFixture } from "../../src/testing/index.js";

const identity: RuntimeTaskIdentity = {
	taskId: "task-1",
	rootSessionId: "session-1",
};

function taskLifecycle(task: RuntimeTaskEvent): unknown {
	return {
		type: "task.lifecycle.recorded",
		sessionId: identity.rootSessionId,
		task,
		timestamp: task.at,
	};
}

function artifactDescriptorRecord(artifact: ArtifactDescriptor): unknown {
	return {
		type: "artifact.descriptor.recorded",
		sessionId: identity.rootSessionId,
		artifact,
		timestamp: artifact.updatedAt,
	};
}

function createdAndPlanned(): RuntimeTaskEvent[] {
	const snapshot = createRuntimeTaskSnapshot({ identity, title: "季度报告", at: 100 });
	const created: RuntimeTaskEvent = {
		schemaVersion: 1,
		taskId: identity.taskId,
		eventId: "e-created",
		at: 100,
		type: "task.created",
		snapshot,
	};
	const planned = transitionRuntimeTask(snapshot, {
		eventId: "e-plan",
		at: 101,
		intent: { type: "plan" },
	});
	return [created, ...planned.events];
}

describe("projectRuntimeSessionTaskState", () => {
	it("从会话事件流重建 Task 快照并忽略无关事件", () => {
		const events = createdAndPlanned();
		const state = projectRuntimeSessionTaskState([
			{ type: "turn.started", sessionId: identity.rootSessionId, turnId: "turn-1", snapshotId: "s", timestamp: 99 },
			...events.map(taskLifecycle),
		]);
		expect(state.tasks).toHaveLength(1);
		expect(state.tasks[0].status).toBe("planning");
		expect(state.tasks[0].title).toBe("季度报告");
	});

	it("Artifact descriptor 取每个 artifactId 的最新事实", () => {
		const older = artifactDescriptorFixture();
		const newer = { ...older, version: older.version + 1, title: "修订版", updatedAt: older.updatedAt + 10 };
		const state = projectRuntimeSessionTaskState([artifactDescriptorRecord(older), artifactDescriptorRecord(newer)]);
		expect(state.artifacts).toHaveLength(1);
		expect(state.artifacts[0].title).toBe("修订版");
		expect(state.artifacts[0].version).toBe(newer.version);
	});

	it("迟到的低版本 descriptor 事实不得覆盖已投影的高版本（版本单调）", () => {
		const newer = artifactDescriptorFixture();
		const older = {
			...newer,
			version: newer.version - 1,
			title: "旧版本",
			updatedAt: newer.updatedAt + 10, // 时间戳更新但版本更低：不得覆盖
		};
		const state = projectRuntimeSessionTaskState([artifactDescriptorRecord(newer), artifactDescriptorRecord(older)]);
		expect(state.artifacts).toHaveLength(1);
		expect(state.artifacts[0].version).toBe(newer.version);
		expect(state.artifacts[0].title).toBe(newer.title);
	});

	it("载荷结构损坏的事实被丢弃，不阻断其余投影", () => {
		const events = createdAndPlanned();
		const state = projectRuntimeSessionTaskState([
			{
				type: "task.lifecycle.recorded",
				sessionId: identity.rootSessionId,
				task: { type: "task.created" },
				timestamp: 1,
			},
			{
				type: "artifact.descriptor.recorded",
				sessionId: identity.rootSessionId,
				artifact: { nope: 1 },
				timestamp: 2,
			},
			...events.map(taskLifecycle),
		]);
		expect(state.tasks).toHaveLength(1);
		expect(state.artifacts).toEqual([]);
	});

	it("单个 Task 事件序损坏（缺 task.created）时跳过该 Task，不影响其他 Task", () => {
		const other = { ...identity, taskId: "task-other" };
		const otherSnapshot = createRuntimeTaskSnapshot({ identity: other, at: 50 });
		const orphanStatusEvent: RuntimeTaskEvent = {
			schemaVersion: 1,
			taskId: "task-orphan",
			eventId: "orphan-1",
			at: 60,
			type: "task.status_changed",
			from: "planning",
			to: "running",
		};
		const state = projectRuntimeSessionTaskState([
			taskLifecycle(orphanStatusEvent),
			taskLifecycle({
				schemaVersion: 1,
				taskId: other.taskId,
				eventId: "other-created",
				at: 50,
				type: "task.created",
				snapshot: otherSnapshot,
			}),
		]);
		expect(state.tasks).toHaveLength(1);
		expect(state.tasks[0].identity.taskId).toBe("task-other");
	});

	it("审批事实：未决策的请求进入 pending，决策后移出并保留审计记录", () => {
		const request = {
			schemaVersion: 1 as const,
			approvalId: "approval-1",
			taskId: "task-1",
			sessionId: identity.rootSessionId,
			turnId: "turn-1",
			toolName: "bash",
			risk: {
				defaultLevel: "L3" as const,
				executionClass: "exclusive" as const,
				irreversible: false,
				externalSideEffect: true,
				requiredScopes: ["shell"],
			},
			summary: "执行 npm install",
			inputPreview: { command: "npm install" },
			affectedResources: ["package.json"],
			createdAt: 100,
		};
		const requested = {
			type: "approval.requested.recorded" as const,
			sessionId: identity.rootSessionId,
			turnId: "turn-1",
			request,
			timestamp: 100,
		};
		const decided = {
			type: "approval.decision.recorded" as const,
			sessionId: identity.rootSessionId,
			turnId: "turn-1",
			approvalId: "approval-1",
			decision: "approve" as const,
			timestamp: 110,
		};
		const pending = projectRuntimeSessionTaskState([requested]);
		expect(pending.pendingApprovals).toHaveLength(1);
		expect(pending.pendingApprovals[0].approvalId).toBe("approval-1");
		const resolved = projectRuntimeSessionTaskState([requested, decided]);
		expect(resolved.pendingApprovals).toHaveLength(0);
		expect(resolved.approvalDecisions.get("approval-1")).toBe("approve");
	});
});
