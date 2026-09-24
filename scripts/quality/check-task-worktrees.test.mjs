import { describe, expect, it } from "vitest";
import { parseTaskDocument } from "../worktree/contract.mjs";
import { findTaskTreeProblemsFromTasks } from "./check-task-worktrees.mjs";

function parallelTask(id, extra = {}) {
	const fields = {
		id,
		status: "ready",
		priority: "P2",
		owner: "apps/desktop",
		execution: "parallel",
		branch: `task/${id}-probe`,
		worktree: `../open-forge-wt/${id.toLowerCase()}-probe`,
		base_commit: "abc1234",
		read_paths: ["apps/desktop/src"],
		write_paths: ["apps/desktop/src/renderer"],
		exclusive_paths: [],
		depends_on: [],
		conflicts_with: [],
		integration_status: "pending",
		created: "2026-09-24",
		updated: "2026-09-24",
		...extra,
	};
	const body = Object.entries(fields)
		.map(([key, value]) => `${key}: ${Array.isArray(value) ? `[${value.join(", ")}]` : value}`)
		.join("\n");
	return parseTaskDocument({
		file: `project/tasks/${id}-probe.md`,
		text: `---\n${body}\n---\n\n# Probe\n`,
	});
}

describe("Task scope quality gate", () => {
	it("fails active overlapping parallel scopes without a conflicts_with record", () => {
		const result = findTaskTreeProblemsFromTasks([parallelTask("TASK-0100"), parallelTask("TASK-0101")]);
		expect(result.errors).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					scope: "TASK-0100 ∩ TASK-0101",
					message: expect.stringContaining("without conflicts_with"),
				}),
			]),
		);
	});

	it("accepts overlapping worktree scopes when their coordination relationship is recorded", () => {
		const result = findTaskTreeProblemsFromTasks([
			parallelTask("TASK-0100", { conflicts_with: ["TASK-0101"] }),
			parallelTask("TASK-0101"),
		]);
		expect(result.errors).toEqual([]);
	});
});
