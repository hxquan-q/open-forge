// Copyright The Open Forge contributors.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { main } from "./cli.mjs";

const roots = [];
function fixture() {
	const root = mkdtempSync(join(tmpdir(), "forge-autonomy-cli-"));
	roots.push(root);
	mkdirSync(join(root, "project/tasks"), { recursive: true });
	for (const file of ["autonomy-policy.json", "agents.json"])
		writeFileSync(
			join(root, "project", file),
			readFileSync(fileURLToPath(new URL(`../../project/${file}`, import.meta.url))),
		);
	const fixturePolicy = JSON.parse(readFileSync(join(root, "project/autonomy-policy.json"), "utf8"));
	fixturePolicy.level = 0;
	fixturePolicy.capabilities = [];
	fixturePolicy.allowedProviders = [];
	writeFileSync(join(root, "project/autonomy-policy.json"), JSON.stringify(fixturePolicy));
	writeFileSync(
		join(root, "project/tasks/TASK-0001-feature.md"),
		`---\nid: TASK-0001\ntype: task\nstatus: ready\npriority: P1\nowner: fixture\nrequirement: REQ-0019\nplan: PLAN-0019\nsource: user-request\nrelated_requirement: [REQ-0019]\nrelated_plan: [PLAN-0019]\nexecution: serial\nbranch: unassigned\nworktree: unassigned\nbase_commit: ${"a".repeat(40)}\nread_paths: [feature.txt]\nwrite_paths: [feature.txt]\nexclusive_paths: []\ndepends_on: []\nconflicts_with: []\nintegration_status: pending\ncreated: 2026-10-19\nupdated: 2026-10-19\n---\n# Fix feature\n`,
	);
	return root;
}
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function requirementFixture(root) {
	mkdirSync(join(root, "evidence"), { recursive: true });
	writeFileSync(join(root, "evidence/task.md"), "# evidence\n");
	const coverage = join(root, "coverage.json");
	writeFileSync(
		coverage,
		JSON.stringify({
			version: 1,
			requirement: "REQ-0019",
			plan: "PLAN-0019",
			clauses: [
				{
					id: "R1",
					text: "the fixture feature is delivered",
					tasks: [{ id: "TASK-0001", evidence: ["evidence/task.md"] }],
				},
			],
		}),
	);
	return coverage;
}

describe("public autonomy command line", () => {
	it("requires explicit UI authorization and binds the plan without starting a UI host", async () => {
		const root = fixture();
		const git = (args) => execFileSync("git", ["-C", root, ...args], { windowsHide: true, stdio: "pipe" });
		git(["init", "--quiet", "--initial-branch=main"]);
		git(["config", "user.name", "Fixture"]);
		git(["config", "user.email", "fixture@example.invalid"]);
		git(["config", "commit.gpgsign", "false"]);
		writeFileSync(
			join(root, "ui-plan.json"),
			JSON.stringify({ version: 1, steps: [{ action: "click", selector: "button" }] }),
		);
		git(["add", "--", "project", "ui-plan.json"]);
		git(["commit", "--quiet", "-m", "baseline", "--", "project", "ui-plan.json"]);
		const args = [
			"plan",
			"--repo",
			root,
			"--worktree",
			root,
			"--task",
			"TASK-0001",
			"--test",
			"ui.test.mjs",
			"--ui-plan",
			"ui-plan.json",
		];
		await expect(main(args)).rejects.toThrow(/authorize-ui true/);
		const planned = await main([...args, "--authorize-ui", "true"]);
		expect(planned.uiAcceptance).toMatchObject({ authorized: true, plan: "ui-plan.json" });
		expect(planned.checks).toContain("ui");
		expect(git(["status", "--porcelain"]).toString()).toBe("");
	});
	it("doctor and uninitialized status remain read-only and report disabled execution honestly", async () => {
		const root = fixture();
		const state = join(root, "state");
		const before = readdirSync(root);
		const doctor = await main(["doctor", "--repo", root]);
		expect(doctor.contractValid).toBe(true);
		expect(doctor.readyForModelExecution).toBe(false);
		expect(await main(["status", "--repo", root, "--state-dir", state])).toMatchObject({ initialized: false });
		expect(existsSync(state)).toBe(false);
		expect(readdirSync(root)).toEqual(before);
		const output = execFileSync(
			process.execPath,
			[fileURLToPath(new URL("cli.mjs", import.meta.url)), "doctor", "--repo", root],
			{ encoding: "utf8", windowsHide: true },
		);
		expect(JSON.parse(output).targetLevel).toBe(4);
	});
	it("claims, reports, pauses, resumes, and releases one Task through the same CLI", async () => {
		const root = fixture();
		const common = ["--repo", root, "--state-dir", join(root, "controller")];
		const token = await main([
			"claim",
			...common,
			"--task",
			"TASK-0001",
			"--holder",
			"human:fixture",
			"--run-id",
			"run-one",
		]);
		expect(token.generation).toBe(1);
		expect((await main(["status", ...common])).leases[0].status).toBe("active");
		await main(["pause", ...common]);
		await expect(
			main(["claim", ...common, "--task", "TASK-0001", "--holder", "human:other", "--run-id", "run-two"]),
		).rejects.toThrow(/paused/);
		await main(["resume", ...common]);
		await main(["release", ...common, "--run-id", "run-one"]);
		expect((await main(["status", ...common])).leases[0].status).toBe("released");
	});
	it("runs a bounded loop with an automatically generated run prefix", async () => {
		const root = fixture();
		const policyPath = join(root, "project/autonomy-policy.json");
		const boundedPolicy = JSON.parse(readFileSync(policyPath, "utf8"));
		boundedPolicy.level = 1;
		boundedPolicy.capabilities = ["plan", "triage", "lessons", "implement", "review", "verify"];
		boundedPolicy.allowedProviders = ["fixture"];
		writeFileSync(policyPath, JSON.stringify(boundedPolicy));
		const result = await main([
			"loop",
			"--repo",
			root,
			"--state-dir",
			join(root, "controller"),
			"--holder",
			"controller",
			"--limit",
			"1",
		]);
		expect(result).toMatchObject({
			stopReason: "limit",
			started: [{ task: "TASK-0001", status: "needs-action" }],
		});
		expect(result.lastRunId).toMatch(/^loop-/u);
	});
	it("rejects a missing option value and malformed loop budgets", async () => {
		await expect(main(["doctor", "--repo"])).rejects.toThrow(/missing value/u);
		const root = fixture();
		const common = ["loop", "--repo", root, "--state-dir", join(root, "controller"), "--holder", "controller"];
		await expect(main([...common, "--limit", "1", "--max-stalls", "11"])).rejects.toThrow(/1\.\.10/u);
	});
	it("does not reinterpret unknown options or duplicate flags as data", async () => {
		await expect(main(["doctor", "--shell", "true"])).rejects.toThrow(/invalid option/);
		await expect(main(["doctor", "--repo", "one", "--repo", "two"])).rejects.toThrow(/duplicate/);
	});
	it("routes a repeated feedback signal to one proposal and reports unknown accounting through the CLI", async () => {
		const root = fixture();
		const common = ["--repo", root, "--state-dir", join(root, "controller")];
		const input = join(root, "signal.json");
		writeFileSync(
			input,
			JSON.stringify({
				version: 1,
				source: "local",
				repository: "hxquan-q/open-forge",
				externalId: "report-1",
				eventId: "event-1",
				kind: "bug",
				url: "",
				title: "A reproducible report",
				body: "Investigate before implementation",
				observedAt: Date.now(),
			}),
		);
		const first = await main(["signal", ...common, "--input", input]);
		expect(await main(["signal", ...common, "--input", input])).toEqual(first);
		const digest = await main(["digest", ...common]);
		expect(digest.signals).toHaveLength(1);
		expect(digest.signals[0].task).toBeNull();
		expect(digest.usage.totalCostUsd).toBeNull();
		expect(await main(["lessons-report", ...common])).toEqual({ markdown: "" });
	});
	it("checks requirement coverage without requiring controller state", async () => {
		const root = fixture();
		const coverage = requirementFixture(root);
		const before = readdirSync(root);
		const result = await main([
			"requirement-check",
			"--repo",
			root,
			"--requirement",
			"REQ-0019",
			"--plan",
			"PLAN-0019",
			"--coverage",
			coverage,
		]);
		expect(result).toMatchObject({
			runnable: true,
			complete: false,
			stopReason: "coverage-gap",
			release: "not-authorized",
		});
		expect(result.clauses[0]).toMatchObject({ id: "R1", tasks: ["TASK-0001"] });
		expect(readdirSync(root)).toEqual(before);
	});
	it("rejects requirement-run integrate before creating a lease below level 2", async () => {
		const root = fixture();
		const coverage = requirementFixture(root);
		const state = join(root, "controller");
		const result = await main([
			"requirement-run",
			"--repo",
			root,
			"--state-dir",
			state,
			"--holder",
			"controller",
			"--requirement",
			"REQ-0019",
			"--plan",
			"PLAN-0019",
			"--coverage",
			coverage,
			"--through",
			"integrate",
		]);
		expect(result.stopReason).toBe("needs-human");
		expect(result.reason).toMatch(/integrate-dev|autonomy is paused/u);
		const status = await main(["status", "--repo", root, "--state-dir", state]);
		expect(status.runs).toEqual([]);
		expect(status.leases).toEqual([]);
	});
});
