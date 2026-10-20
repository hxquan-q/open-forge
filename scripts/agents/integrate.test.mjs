// Copyright The Open Forge contributors.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testExecutionProof } from "./execution-proof-fixture.mjs";
import { git, snapshot } from "./git.mjs";
import { applyIntegration, prepareIntegration } from "./integrate.mjs";
import { claim } from "./leases.mjs";
import { cycle } from "./orchestrate.mjs";
import { prepareTask } from "./prepare.mjs";
import { executeAdapter } from "./runner.mjs";
import { createStore } from "./store.mjs";
import { taskById } from "./tasks.mjs";
import { verifyRun } from "./verify.mjs";

describe.sequential("Task preparation through a verified final Git integration", () => {
	let directory;
	let context;
	const reviewAndVerify = async () => {
		const run = context.store.read().runs[context.token.runId];
		await executeAdapter({
			...context,
			runContract: run.contract,
			task: taskById(context.root, context.token.task),
			adapterId: "reviewer",
			role: "reviewer",
			request: "review exact candidate",
		});
		try {
			return await verifyRun(context);
		} catch (error) {
			const artifact = context.store.read().runs[context.token.runId].verificationArtifacts.at(-1);
			throw new Error(`${error.message}: ${readFileSync(join(artifact, "tests.stderr.log"), "utf8")}`);
		}
	};
	beforeAll(async () => {
		directory = mkdtempSync(join(tmpdir(), "forge-autonomy-integration-"));
		const root = join(directory, "controller-repo");
		mkdirSync(root);
		git(root, ["init", "--quiet", "--initial-branch=main"]);
		git(root, ["config", "user.name", "Fixture"]);
		git(root, ["config", "user.email", "fixture@example.invalid"]);
		git(root, ["config", "commit.gpgsign", "false"]);
		git(root, ["config", "core.autocrlf", "false"]);
		writeFileSync(join(root, "feature.txt"), "broken\n");
		git(root, ["add", "--", "feature.txt"]);
		git(root, ["commit", "--quiet", "-m", "baseline", "--", "feature.txt"]);
		const base = snapshot(root).head;
		cpSync(fileURLToPath(new URL("../worktree", import.meta.url)), join(root, "scripts/worktree"), {
			recursive: true,
		});
		mkdirSync(join(root, "scripts/quality"), { recursive: true });
		mkdirSync(join(root, "project/tasks"), { recursive: true });
		writeFileSync(
			join(root, ".worktreeconfig.json"),
			JSON.stringify({ worktreeRoot: "../workers", baseRef: "main", copyIgnored: false, setup: {} }),
		);
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({ scripts: { check: "node --check feature.test.mjs" } }),
		);
		writeFileSync(
			join(root, "feature.test.mjs"),
			"import {strict as assert} from 'node:assert';import {readFileSync} from 'node:fs';assert.equal(readFileSync('feature.txt','utf8'),'fixed\\n');",
		);
		writeFileSync(
			join(root, "scripts/quality/run-vitest.mjs"),
			"import {writeFileSync} from 'node:fs';import {resolve} from 'node:path';await import('../../feature.test.mjs');const out=process.argv.find(x=>x.startsWith('--outputFile=')).slice(13);writeFileSync(out,JSON.stringify({success:true,numTotalTests:1,numPassedTests:1,numFailedTests:0,testResults:[{name:resolve('feature.test.mjs'),status:'passed',assertionResults:[{status:'passed'}]}]}));",
		);
		writeFileSync(
			join(root, "project/tasks/TASK-0001-feature.md"),
			`---\nid: TASK-0001\ntype: task\nstatus: ready\npriority: P1\nowner: fixture\nsource: user-request\nexecution: parallel\nbranch: unassigned\nworktree: unassigned\nbase_commit: ${base}\nread_paths: [feature.txt]\nwrite_paths: [feature.txt]\nexclusive_paths: []\ndepends_on: []\nconflicts_with: []\nintegration_status: pending\ncreated: 2026-10-19\nupdated: 2026-10-19\n---\n# Fix feature\n`,
		);
		writeFileSync(join(root, "project/tasks/README.md"), "| Task | Status |\n|---|---|\n| `TASK-0001` | `ready` |\n");
		const policy = JSON.parse(
			readFileSync(fileURLToPath(new URL("../../project/autonomy-policy.json", import.meta.url)), "utf8"),
		);
		policy.level = 2;
		// Two worker reviews plus the original candidate and moving-main re-reviews.
		policy.limits.reviewRounds = 4;
		policy.capabilities = ["implement", "review", "verify", "integrate-dev"];
		policy.allowedProviders = ["fixture"];
		policy.requiredChecks = ["tests", "check"];
		const adapter = (id, family, script) => ({
			id,
			family,
			enabled: true,
			provider: "fixture",
			model: "fixture",
			roles: ["implementer", "reviewer"],
			command: [process.execPath, "--input-type=module", "-e", script],
			doctorCommand: [process.execPath, "--version"],
			isolation: "external-sandbox",
		});
		const settings = {
			version: 1,
			adapters: [
				adapter(
					"author",
					"author-family",
					"import {readFileSync,writeFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';const previous=readFileSync('feature.txt','utf8');writeFileSync('feature.txt',previous==='broken\\n'?'still broken\\n':'fixed\\n');execFileSync('git',['add','--','feature.txt']);execFileSync('git',['commit','--quiet','-m','fix','--','feature.txt']);console.log(JSON.stringify({status:'completed',summary:'fixed feature'}));",
				),
				adapter("reviewer", "review-family", "console.log(JSON.stringify({verdict:'approve',findings:[]}))"),
			],
		};
		const paths = ["scripts", "project", "package.json", ".worktreeconfig.json", "feature.test.mjs"];
		git(root, ["add", "--", ...paths]);
		git(root, ["commit", "--quiet", "-m", "contracted task", "--", ...paths]);
		const store = createStore(join(directory, "state"));
		const token = claim(store, taskById(root, "TASK-0001"), { holder: "controller", runId: "integration-run" });
		const prepared = await prepareTask({ root, store, policy, settings, token, tests: ["feature.test.mjs"] });
		context = { root, store, policy, settings, token, ...prepared };
		testExecutionProof(context);
	});
	afterAll(() => {
		if (directory) rmSync(directory, { recursive: true, force: true });
	});

	it("repairs a real assertion failure, independently reviews again, and verifies its separate branch", async () => {
		expect(context.task.status).toBe("in_progress");
		expect(snapshot(context.root).clean).toBe(true);
		expect(context.runContract.worktree).not.toBe(context.root);
		const result = await cycle({
			...context,
			taskId: context.token.task,
			runId: context.token.runId,
			holder: context.token.holder,
			through: "verify",
		});
		expect(result.status).toBe("verified");
		const run = context.store.read().runs[context.token.runId];
		expect(run.attempts.filter((attempt) => attempt.role === "implementer")).toHaveLength(2);
		expect(run.attempts.filter((attempt) => attempt.role === "reviewer")).toHaveLength(2);
		expect(context.store.read().audit.some((entry) => entry.status === "verification-failed")).toBe(true);
		expect(run.verificationRetryable).toBe(false);
		expect(readFileSync(join(context.root, "feature.txt"), "utf8")).toBe("broken\n");
	}, 15000); // Two complete implementation/review/test rounds with real Git and subprocesses.
	it("invalidates worker evidence when a final integration candidate is created", () => {
		const source = context.store.read().runs[context.token.runId].binding.head;
		const preview = prepareIntegration(context);
		expect(preview.candidate).not.toBe(source);
		const run = context.store.read().runs[context.token.runId];
		expect(run.review).toBe(null);
		expect(run.checks).toEqual([]);
		expect(() => applyIntegration(context)).toThrow(/verified/);
	});
	it("independently re-reviews and executes checks on the actual combined commit", async () => {
		const verified = await reviewAndVerify();
		expect(verified.review.binding.head).toBe(verified.integration.candidate);
		expect(verified.checks.every((check) => check.binding.head === verified.integration.candidate)).toBe(true);
	});
	it("refuses a moving main branch and prepares a new candidate without losing the other change", () => {
		writeFileSync(join(context.root, "other.txt"), "another contributor\n");
		git(context.root, ["add", "--", "other.txt"]);
		git(context.root, ["commit", "--quiet", "-m", "other contribution", "--", "other.txt"]);
		expect(() => applyIntegration(context)).toThrow(/base advanced/);
		expect(prepareIntegration(context).status).toBe("needs-review");
	});
	it("applies only the reverified commit and records integration separately from publishing", async () => {
		const verified = await reviewAndVerify();
		const applied = applyIntegration(context);
		expect(applied).toMatchObject({ status: "integrated", published: false, head: verified.binding.head });
		expect(readFileSync(join(context.root, "feature.txt"), "utf8")).toBe("fixed\n");
		expect(readFileSync(join(context.root, "other.txt"), "utf8")).toBe("another contributor\n");
		expect(taskById(context.root, "TASK-0001")).toMatchObject({
			status: "verifying",
			integrationStatus: "integrated",
		});
		expect(context.store.read().leases["TASK-0001"].status).toBe("released");
	});
});
