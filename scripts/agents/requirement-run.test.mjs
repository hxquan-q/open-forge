// Copyright The Open Forge contributors.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRequirement, requirementRun, validateRequirementReport } from "./requirement-run.mjs";
import { createStore } from "./store.mjs";

const roots = [];
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
	const root = mkdtempSync(join(tmpdir(), "forge-requirement-run-"));
	roots.push(root);
	mkdirSync(join(root, "project/tasks"), { recursive: true });
	mkdirSync(join(root, "evidence"), { recursive: true });
	return root;
}

function policyAt(level) {
	const policy = JSON.parse(
		readFileSync(fileURLToPath(new URL("../../project/autonomy-policy.json", import.meta.url)), "utf8"),
	);
	policy.level = level;
	policy.capabilities = ["plan", "triage", "lessons", "implement", "review", "verify"];
	if (level >= 2) policy.capabilities.push("integrate-dev");
	policy.allowedProviders = ["fixture"];
	return policy;
}

function writeTask(
	root,
	{
		id,
		status = "ready",
		integration = "pending",
		dependsOn = [],
		conflictsWith = [],
		requirement = "REQ-0019",
		plan = "PLAN-0019",
		priority = "P1",
	},
) {
	writeFileSync(
		join(root, `project/tasks/${id}-fixture.md`),
		`---\nid: ${id}\ntype: task\nstatus: ${status}\npriority: ${priority}\nowner: fixture\nrequirement: ${requirement}\nplan: ${plan}\nsource: fixture\nrelated_requirement: [${requirement}]\nrelated_plan: [${plan}]\nexecution: parallel\nbranch: task/${id}-fixture\nworktree: unassigned\nbase_commit: ${"a".repeat(40)}\nread_paths: [evidence]\nwrite_paths: [evidence/${id}.txt]\nexclusive_paths: []\ndepends_on: [${dependsOn.join(", ")}]\nconflicts_with: [${conflictsWith.join(", ")}]\nintegration_status: ${integration}\ncreated: 2026-10-20\nupdated: 2026-10-20\n---\n# ${id}\n`,
	);
}

function writeEvidence(root, name, content = "# evidence\n") {
	writeFileSync(join(root, "evidence", name), content);
}

function coverage(clauses, requirement = "REQ-0019", plan = "PLAN-0019") {
	return { version: 1, requirement, plan, clauses };
}

function clause(id, taskId, evidence = "r1.md") {
	return {
		id,
		text: `${id} requirement text`,
		tasks: [{ id: taskId, evidence: [`evidence/${evidence}`] }],
	};
}

function runOptions(root, extras = {}) {
	return {
		root,
		store: createStore(join(root, "controller")),
		policy: policyAt(1),
		settings: { version: 1, adapters: [] },
		requirement: "REQ-0019",
		plan: "PLAN-0019",
		holder: "controller",
		runPrefix: "req-test",
		...extras,
	};
}

describe("requirement coverage uses the Task ledger and evidence paths, not queue emptiness", () => {
	it("reports a covered requirement while keeping human acceptance and release separate", () => {
		const root = fixture();
		writeTask(root, { id: "TASK-1001", status: "verifying", integration: "integrated" });
		writeEvidence(root, "r1.md");
		const result = checkRequirement({
			root,
			requirement: "REQ-0019",
			plan: "PLAN-0019",
			coverage: coverage([clause("R1", "TASK-1001")]),
		});
		expect(result).toMatchObject({
			runnable: true,
			complete: true,
			stopReason: "engineering-complete",
			humanAcceptance: "pending",
			release: "not-authorized",
			evidenceCheck: "presence-only",
			semanticReview: "not-performed",
		});
		expect(result.clauses[0]).toMatchObject({
			id: "R1",
			status: "covered",
			tasks: ["TASK-1001"],
		});
		expect(result.clauses[0].refs[0]).toMatchObject({
			id: "TASK-1001",
			engineering: true,
			missingEvidence: [],
		});
		expect(result.tasks[0]).toMatchObject({
			id: "TASK-1001",
			engineering: true,
			acceptance: false,
		});
	});

	it("does not claim or execute when a mapped evidence file is missing", async () => {
		const root = fixture();
		writeTask(root, { id: "TASK-1001" });
		const execute = vi.fn();
		const options = runOptions(root, {
			coverage: coverage([clause("R1", "TASK-1001", "missing.md")]),
			execute,
		});
		const report = await requirementRun(options);
		expect(report.stopReason).toBe("coverage-gap");
		expect(report.reason).toMatch(/does not exist/u);
		expect(execute).not.toHaveBeenCalled();
		expect(options.store.read().leases).toEqual({});
		expect(options.store.read().runs).toEqual({});
		expect(existsSync(report.reportPath)).toBe(true);
	});

	it("rejects a Task outside the requirement and plan before execution", async () => {
		const root = fixture();
		writeTask(root, { id: "TASK-1001", requirement: "REQ-0001", plan: "PLAN-0018" });
		writeEvidence(root, "r1.md");
		const execute = vi.fn();
		const result = await requirementRun(
			runOptions(root, {
				coverage: coverage([clause("R1", "TASK-1001")]),
				execute,
			}),
		);
		expect(result.stopReason).toBe("coverage-gap");
		expect(result.reason).toMatch(/does not belong to REQ-0019\/PLAN-0019/u);
		expect(execute).not.toHaveBeenCalled();
	});

	it("rejects evidence paths that escape the repository", async () => {
		const root = fixture();
		writeTask(root, { id: "TASK-1001" });
		const result = checkRequirement({
			root,
			requirement: "REQ-0019",
			plan: "PLAN-0019",
			coverage: coverage([clause("R1", "TASK-1001", "../outside.md")]),
		});
		expect(result.runnable).toBe(false);
		expect(result.problems.join(" ")).toMatch(/escapes the repository/u);
	});

	it("executes only manifest Tasks, serially, and reports the bound", async () => {
		const root = fixture();
		writeTask(root, { id: "TASK-1001" });
		writeTask(root, { id: "TASK-1099" });
		writeEvidence(root, "r1.md");
		const calls = [];
		const report = await requirementRun(
			runOptions(root, {
				coverage: coverage([clause("R1", "TASK-1001")]),
				limit: 1,
				execute: async ({ taskId }) => {
					calls.push(taskId);
					return { status: "needs-action", reason: "fixture stop" };
				},
			}),
		);
		expect(calls).toEqual(["TASK-1001"]);
		expect(report.attempted.map((entry) => entry.task)).toEqual(["TASK-1001"]);
		expect(report.stopReason).toBe("limit");
		expect(report.unmappedTasks).toEqual(["TASK-1099"]);
	});

	it("does not treat a verifying dependency as complete", async () => {
		const root = fixture();
		writeTask(root, { id: "TASK-1001", status: "verifying", integration: "integrated" });
		writeTask(root, { id: "TASK-1002", dependsOn: ["TASK-1001"] });
		writeEvidence(root, "r1.md");
		writeEvidence(root, "r2.md");
		const execute = vi.fn();
		const report = await requirementRun(
			runOptions(root, {
				coverage: coverage([clause("R1", "TASK-1001"), clause("R2", "TASK-1002", "r2.md")]),
				execute,
			}),
		);
		expect(execute).not.toHaveBeenCalled();
		expect(report.stopReason).toBe("needs-human");
		expect(report.reason).toMatch(/TASK-1001/u);
		expect(report.tasks.find((task) => task.id === "TASK-1002").engineering).toBe(false);
		expect(report.humanAcceptance).toBe("pending");
	});

	it("stops stalled after a needs-action attempt at the configured threshold", async () => {
		const root = fixture();
		writeTask(root, { id: "TASK-1001" });
		writeEvidence(root, "r1.md");
		const execute = vi.fn(async () => ({ status: "needs-action", reason: "adapter unavailable" }));
		const report = await requirementRun(
			runOptions(root, {
				coverage: coverage([clause("R1", "TASK-1001")]),
				maxStalls: 1,
				execute,
			}),
		);
		expect(execute).toHaveBeenCalledTimes(1);
		expect(report.stopReason).toBe("stalled");
		expect(report.reason).toBe("adapter unavailable");
	});

	it("rejects integrate below level 2 before claiming a Task", async () => {
		const root = fixture();
		writeTask(root, { id: "TASK-1001" });
		writeEvidence(root, "r1.md");
		const execute = vi.fn();
		const options = runOptions(root, {
			policy: policyAt(1),
			coverage: coverage([clause("R1", "TASK-1001")]),
			through: "integrate",
			execute,
		});
		const report = await requirementRun(options);
		expect(report.stopReason).toBe("needs-human");
		expect(report.reason).toMatch(/integrate-dev|insufficient autonomy level/u);
		expect(execute).not.toHaveBeenCalled();
		expect(options.store.read().leases).toEqual({});
		expect(options.store.read().runs).toEqual({});
	});

	it("writes a schema-valid engineering-complete report when every clause is integrated", async () => {
		const root = fixture();
		writeTask(root, { id: "TASK-1001", status: "verifying", integration: "integrated" });
		writeTask(root, { id: "TASK-1002", status: "done", integration: "integrated" });
		writeEvidence(root, "r1.md");
		writeEvidence(root, "r2.md");
		const execute = vi.fn();
		const options = runOptions(root, {
			coverage: coverage([clause("R1", "TASK-1001"), clause("R2", "TASK-1002", "r2.md")]),
			execute,
		});
		const report = await requirementRun(options);
		expect(execute).not.toHaveBeenCalled();
		expect(report.stopReason).toBe("engineering-complete");
		expect(report.humanAcceptance).toBe("pending");
		expect(report.release).toBe("not-authorized");
		expect(report.evidenceCheck).toBe("presence-only");
		expect(report.semanticReview).toBe("not-performed");
		expect(() => validateRequirementReport(report)).not.toThrow();
		expect(JSON.parse(readFileSync(report.reportPath, "utf8"))).toMatchObject({
			stopReason: "engineering-complete",
		});
	});

	it("reports accepted only when every mapped Task is done and integrated", () => {
		const root = fixture();
		writeTask(root, { id: "TASK-1001", status: "done", integration: "integrated" });
		writeTask(root, { id: "TASK-1002", status: "done", integration: "integrated" });
		writeEvidence(root, "r1.md");
		writeEvidence(root, "r2.md");
		const result = checkRequirement({
			root,
			requirement: "REQ-0019",
			plan: "PLAN-0019",
			coverage: coverage([clause("R1", "TASK-1001"), clause("R2", "TASK-1002", "r2.md")]),
		});
		expect(result.complete).toBe(true);
		expect(result.humanAcceptance).toBe("accepted");
	});
});
