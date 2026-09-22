import { describe, expect, it } from "vitest";
import { decodeSessionEvent } from "./session-event-codec.js";

function base() {
	return {
		schemaVersion: 1,
		channel: "runtime" as const,
		sessionId: "session-1",
		eventId: "event-1",
		timestamp: 100,
		source: "runtime-core" as const,
	};
}

describe("session event codec：Task/Artifact 事实", () => {
	it("合法的 task.lifecycle 事件通过解码", () => {
		const event = decodeSessionEvent({
			...base(),
			type: "task.lifecycle",
			task: {
				schemaVersion: 1,
				taskId: "task-1",
				eventId: "task-1:created",
				at: 100,
				type: "task.created",
				snapshot: {
					schemaVersion: 1,
					identity: { taskId: "task-1", rootSessionId: "session-1", generation: "g-1" },
					status: "planning",
					createdAt: 100,
					updatedAt: 100,
					artifactIds: [],
					pendingApprovalIds: [],
				},
			},
		});
		if (event.type !== "task.lifecycle") throw new Error("unreachable");
		expect(event.task.taskId).toBe("task-1");
	});

	it("合法的 artifact.descriptor 事件通过解码", () => {
		const event = decodeSessionEvent({
			...base(),
			type: "artifact.descriptor",
			artifact: {
				schemaVersion: 1,
				artifactId: "artifact-1",
				kind: "document",
				status: "generated",
				title: "纪要",
				version: 1,
				sourceSessionId: "session-1",
				createdAt: 100,
				updatedAt: 100,
			},
		});
		if (event.type !== "artifact.descriptor") throw new Error("unreachable");
		expect(event.artifact.artifactId).toBe("artifact-1");
	});

	it("载荷缺 taskId 的 task.lifecycle 被拒绝", () => {
		expect(() => decodeSessionEvent({ ...base(), type: "task.lifecycle", task: { type: "task.created" } })).toThrow(
			TypeError,
		);
	});

	it("载荷缺 kind 的 artifact.descriptor 被拒绝", () => {
		expect(() =>
			decodeSessionEvent({ ...base(), type: "artifact.descriptor", artifact: { artifactId: "artifact-1" } }),
		).toThrow(TypeError);
	});
});
