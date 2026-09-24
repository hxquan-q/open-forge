import { Value } from "@sinclair/typebox/value";
import type { TaskLifecycleRecordedEvent } from "@vetta/runtime-core/kernel";
import { describe, expect, it } from "vitest";
import { StoredSessionEventSchema } from "../../src/conversation/record-schema.js";

function taskLifecycleEvent(): TaskLifecycleRecordedEvent {
	return {
		type: "task.lifecycle.recorded",
		sessionId: "session-1",
		task: {
			schemaVersion: 1,
			taskId: "task-1",
			eventId: "task-1:created",
			at: 100,
			type: "task.created",
			snapshot: {
				schemaVersion: 1,
				identity: { taskId: "task-1", rootSessionId: "session-1", generation: "generation-1" },
				status: "planning",
				createdAt: 100,
				updatedAt: 100,
				artifactIds: [],
				pendingApprovalIds: [],
			},
		},
		timestamp: 100,
	};
}

const artifactDescriptorRecord = {
	type: "artifact.descriptor.recorded",
	sessionId: "session-1",
	artifact: {
		schemaVersion: 1,
		artifactId: "artifact-1",
		kind: "document",
		status: "generated",
		title: "会议纪要",
		uri: "file:///tmp/notes.md",
		version: 1,
		sourceSessionId: "session-1",
		createdAt: 100,
		updatedAt: 100,
	},
	timestamp: 100,
} as const;

describe("Task/Artifact 事实事件的持久化 Schema", () => {
	it("合法的 task.lifecycle.recorded 通过事件校验", () => {
		expect(Value.Check(StoredSessionEventSchema, taskLifecycleEvent())).toBe(true);
	});

	it("合法的 artifact.descriptor.recorded 通过事件校验", () => {
		expect(Value.Check(StoredSessionEventSchema, artifactDescriptorRecord)).toBe(true);
	});

	it("Task 载荷结构损坏（缺 snapshot 字段）被拒绝", () => {
		const corrupt = {
			...taskLifecycleEvent(),
			task: { ...taskLifecycleEvent().task, snapshot: { schemaVersion: 1 } },
		};
		expect(Value.Check(StoredSessionEventSchema, corrupt)).toBe(false);
	});

	it("Task 事件缺 schemaVersion 被拒绝", () => {
		const { schemaVersion: _omitted, ...task } = taskLifecycleEvent().task;
		const corrupt = { ...taskLifecycleEvent(), task };
		expect(Value.Check(StoredSessionEventSchema, corrupt)).toBe(false);
	});

	it("快照里未知状态字面量被拒绝", () => {
		const event = taskLifecycleEvent();
		if (event.task.type !== "task.created") throw new Error("unreachable");
		const corrupt = {
			...event,
			task: { ...event.task, snapshot: { ...event.task.snapshot, status: "exploded" } },
		};
		expect(Value.Check(StoredSessionEventSchema, corrupt)).toBe(false);
	});

	it("事件信封携带 turnId 被拒绝（Task 事实不开启 Turn）", () => {
		const corrupt = { ...taskLifecycleEvent(), turnId: "turn-1" };
		expect(Value.Check(StoredSessionEventSchema, corrupt)).toBe(false);
	});
});
