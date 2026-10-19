// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { completedTasks, taskQueue } from "./queue.mjs";

describe("the existing Task ledger remains the scheduling authority", () => {
	it("orders ready tasks and keeps unintegrated, unknown and unfinished dependencies pending", () => {
		const tasks = [
			{ id: "TASK-0001", status: "done", integrationStatus: "pending", dependsOn: [] },
			{ id: "TASK-0002", status: "done", integrationStatus: "integrated", dependsOn: [] },
			{ id: "TASK-0003", status: "ready", priority: "P2", dependsOn: ["TASK-0002"] },
			{ id: "TASK-0004", status: "ready", priority: "P0", dependsOn: ["TASK-0001", "REQ-9999"] },
			{ id: "TASK-0005", status: "draft", priority: "P0", dependsOn: [] },
		];
		const state = { leases: { "TASK-0003": { task: "TASK-0003", status: "active", expiresAt: 200 } } };
		expect(completedTasks(tasks)).toEqual(["TASK-0002"]);
		expect(taskQueue(tasks, state, 100)).toEqual([
			{ task: "TASK-0004", priority: "P0", waitingFor: ["TASK-0001", "REQ-9999"], leased: false },
			{ task: "TASK-0003", priority: "P2", waitingFor: [], leased: true },
		]);
		expect(taskQueue(tasks, state, 200)[1].leased).toBe(false);
	});
});
