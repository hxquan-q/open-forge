// Copyright The Open Forge contributors.
import { execFileSync, spawn } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { digest } from "./contracts.mjs";
import { testExecutionProof } from "./execution-proof-fixture.mjs";
import { git, snapshot } from "./git.mjs";
import { applyIntegration, candidateSubject, prepareIntegration, verifyCandidate } from "./integrate.mjs";
import { claim } from "./leases.mjs";
import { cycle } from "./orchestrate.mjs";
import { prepareTask } from "./prepare.mjs";
import { processFixture } from "./process-fixture.mjs";
import { executeAdapter } from "./runner.mjs";
import { canonical } from "./schema.mjs";
import { createStore } from "./store.mjs";
import { taskById } from "./tasks.mjs";
import { verifyRun } from "./verify.mjs";

vi.mock("node:child_process", async (importOriginal) => {
	const actual = await importOriginal();
	return { ...actual, spawn: vi.fn(actual.spawn) };
});

describe.sequential("Task preparation through a verified final Git integration", () => {
	let directory;
	let context;
	const preparation = processFixture();
	beforeEach((context) => {
		context.processes = processFixture(context.signal);
	});
	afterEach(async ({ processes }) => {
		await processes.close();
	});
	const reviewAndVerify = (processes) =>
		processes.run(async (signal) => {
			const run = context.store.read().runs[context.token.runId];
			await executeAdapter({
				...context,
				signal,
				runContract: run.contract,
				task: taskById(context.root, context.token.task),
				adapterId: "reviewer",
				role: "reviewer",
				request: "review exact candidate",
			});
			try {
				return await verifyRun({ ...context, signal });
			} catch (error) {
				const artifact = context.store.read().runs[context.token.runId].verificationArtifacts.at(-1);
				throw new Error(`${error.message}: ${readFileSync(join(artifact, "tests.stderr.log"), "utf8")}`);
			}
		});
	beforeAll(() =>
		preparation.run(async (signal) => {
			directory = mkdtempSync(join(tmpdir(), "forge-autonomy-integration-"));
			const root = join(directory, "controller-repo");
			mkdirSync(root);
			git(root, ["init", "--quiet", "--initial-branch=main"]);
			appendFileSync(
				join(root, ".git/config"),
				"\n[user]\n\tname = Fixture\n\temail = fixture@example.invalid\n[commit]\n\tgpgsign = false\n[core]\n\tautocrlf = false\n",
			);
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
			writeFileSync(
				join(root, "project/tasks/README.md"),
				"| Task | Status |\n|---|---|\n| `TASK-0001` | `ready` |\n",
			);
			const policy = JSON.parse(
				readFileSync(fileURLToPath(new URL("../../project/autonomy-policy.json", import.meta.url)), "utf8"),
			);
			policy.level = 2;
			// Two worker reviews plus the original candidate and moving-main re-reviews.
			policy.limits.reviewRounds = 4;
			policy.capabilities = ["implement", "review", "verify", "integrate-dev"];
			policy.allowedProviders = ["fixture"];
			policy.requiredChecks = ["tests", "check"];
			// This suite exercises cross-family review; the deployment policy may relax it.
			policy.differentReviewerFamily = true;
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
			const prepared = await prepareTask({
				root,
				store,
				policy,
				settings,
				token,
				tests: ["feature.test.mjs"],
				signal,
			});
			context = { root, store, policy, settings, token, ...prepared };
			testExecutionProof(context);
		}),
	);
	afterAll(async () => {
		await preparation.close();
		if (directory) rmSync(directory, { recursive: true, force: true });
	});

	it("prepares through the real worktree CLI using the controller runtime", () => {
		const calls = vi.mocked(spawn).mock.calls.filter(([, args]) => args[0] === "scripts/worktree/cli.mjs");
		expect(calls).toHaveLength(1);
		const [command, args, options] = calls[0];
		expect(command).toBe(process.execPath);
		expect(args).toEqual([
			"scripts/worktree/cli.mjs",
			"create",
			"--task",
			"TASK-0001",
			"--base",
			context.store.read().runs[context.token.runId].preparation.base,
			"--no-setup",
		]);
		expect(options).toMatchObject({ cwd: context.root, shell: false, windowsHide: true });
	});

	it("repairs a real assertion failure, independently reviews again, and verifies its separate branch", async ({
		processes,
	}) => {
		expect(context.task.status).toBe("in_progress");
		expect(snapshot(context.root).clean).toBe(true);
		expect(context.runContract.worktree).not.toBe(context.root);
		const result = await processes.run((signal) =>
			cycle({
				...context,
				signal,
				taskId: context.token.task,
				runId: context.token.runId,
				holder: context.token.holder,
				through: "verify",
			}),
		);
		expect(result.status).toBe("verified");
		const run = context.store.read().runs[context.token.runId];
		expect(run.attempts.filter((attempt) => attempt.role === "implementer")).toHaveLength(2);
		expect(run.attempts.filter((attempt) => attempt.role === "reviewer")).toHaveLength(2);
		expect(context.store.read().audit.some((entry) => entry.status === "verification-failed")).toBe(true);
		expect(run.verificationRetryable).toBe(false);
		expect(readFileSync(join(context.root, "feature.txt"), "utf8")).toBe("broken\n");
	}, 15000); // Two complete implementation/review/test rounds with real Git and subprocesses.
	it("refuses a controller checkout that differs from the configured integration branch", async () => {
		const policy = { ...context.policy, integration: { ...context.policy.integration, branch: "trunk" } };
		await expect(prepareTask({ ...context, policy })).rejects.toThrow(
			"controller checkout must be trunk (current: main)",
		);
		expect(() => prepareIntegration({ ...context, policy })).toThrow(
			"integration target must be local trunk (current: main)",
		);
		expect(context.store.read().runs[context.token.runId].status).toBe("verified");
	});
	it("invalidates worker evidence when a final integration candidate is created", () => {
		const source = context.store.read().runs[context.token.runId].binding.head;
		const preview = prepareIntegration(context);
		expect(preview.candidate).not.toBe(source);
		const run = context.store.read().runs[context.token.runId];
		expect(run.review).toBe(null);
		expect(run.checks).toEqual([]);
		expect(() => applyIntegration(context)).toThrow(/verified/);
	});
	it("independently re-reviews and executes checks on the actual combined commit", async ({ processes }) => {
		const verified = await reviewAndVerify(processes);
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
	it("applies only the reverified commit and records integration separately from publishing", async ({
		processes,
	}) => {
		const verified = await reviewAndVerify(processes);
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

describe("pushed candidate CI verification", () => {
	const roots = [];
	afterEach(() => {
		for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
	});

	function fixture() {
		const root = mkdtempSync(join(tmpdir(), "forge-candidate-"));
		roots.push(root);
		const repo = join(root, "repo");
		execFileSync("git", ["init", "--quiet", "--initial-branch=main", repo], { windowsHide: true });
		git(repo, ["config", "user.name", "Fixture"]);
		git(repo, ["config", "user.email", "fixture@example.invalid"]);
		git(repo, ["config", "commit.gpgsign", "false"]);
		writeFileSync(join(repo, "feature.txt"), "candidate");
		git(repo, ["add", "--", "feature.txt"]);
		git(repo, ["commit", "--quiet", "-m", "candidate"]);
		const { head, tree } = snapshot(repo);
		const store = createStore(join(root, "state"));
		const keys = generateKeyPairSync("ed25519");
		const publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
		writeFileSync(
			join(store.root, "trusted-services.json"),
			JSON.stringify({ version: 1, keys: [{ id: "fixture", publicKey, roles: ["ci"] }] }),
		);
		const policy = JSON.parse(
			readFileSync(fileURLToPath(new URL("../../project/autonomy-policy.json", import.meta.url)), "utf8"),
		);
		policy.level = 2;
		policy.capabilities = ["integrate-dev"];
		policy.requiredChecks = ["tests", "check"];
		const binding = { head, tree, policy: digest(policy), contract: digest("fixture") };
		store.transaction((state) => {
			state.runs.run = {
				task: "TASK-0001",
				status: "integrated",
				integration: { phase: "applied", evidence: { binding } },
			};
		});
		git(repo, ["update-ref", "refs/remotes/origin/dev", head]);
		const now = Date.now();
		const ciProof = (overrides = {}, subject = candidateSubject(binding, "origin/dev")) => {
			const data = {
				repository: "hxquan-q/open-forge",
				head,
				tree,
				runId: "123",
				remoteRef: "origin/dev",
				checks: ["tests", "check"],
				passed: true,
				...overrides,
			};
			for (const [key, value] of Object.entries(overrides)) if (value === undefined) delete data[key];
			const payload = {
				version: 1,
				kind: "ci",
				keyId: "fixture",
				issuedAt: now - 100,
				expiresAt: now + 60000,
				subject,
				data,
			};
			return { payload, signature: sign(null, Buffer.from(canonical(payload)), keys.privateKey).toString("base64") };
		};
		const verify = (proof, override = policy) =>
			verifyCandidate({ root: repo, store, policy: override, runId: "run", proof, now });
		const verification = () => store.read().runs.run.integration.candidateVerification;
		return { repo, store, policy, binding, head, tree, now, ciProof, verify, verification };
	}

	it("records a verified pushed candidate", () => {
		const { store, head, tree, now, ciProof, verify, verification } = fixture();
		expect(verify(ciProof())).toMatchObject({ status: "candidate-verified", head, ciRunId: "123" });
		expect(verification()).toEqual({ runId: "123", remoteRef: "origin/dev", head, tree, keyId: "fixture", at: now });
		expect(store.read().audit.at(-1).event).toBe("candidate-verified");
	});

	it("rejects CI proofs that do not match the integrated candidate", () => {
		const { binding, verify, ciProof, verification } = fixture();
		const cases = [
			[ciProof({ head: "a".repeat(40) }), /another commit/],
			[ciProof({ tree: "b".repeat(40) }), /another commit/],
			[ciProof({ remoteRef: "origin/main" }), /candidate ref/],
			[ciProof({ checks: ["tests"] }), /required checks/],
			[ciProof({ runId: undefined }), undefined],
			[ciProof({}, candidateSubject(binding, "origin/main")), /another subject/],
		];
		for (const [proof, error] of cases) {
			if (error) expect(() => verify(proof)).toThrow(error);
			else expect(() => verify(proof)).toThrow();
			expect(verification()).toBeUndefined();
		}
	});

	it("requires a fetched remote candidate ref", () => {
		const { repo, verify, ciProof, verification } = fixture();
		git(repo, ["update-ref", "-d", "refs/remotes/origin/dev"]);
		expect(() => verify(ciProof())).toThrow(/fetch it first/);
		expect(verification()).toBeUndefined();
	});

	it("rejects a remote candidate ref that points at another commit", () => {
		const { repo, verify, ciProof, verification } = fixture();
		writeFileSync(join(repo, "feature.txt"), "moved");
		git(repo, ["commit", "--quiet", "-am", "moved"]);
		git(repo, ["update-ref", "refs/remotes/origin/dev", snapshot(repo).head]);
		expect(() => verify(ciProof())).toThrow(/does not point/);
		expect(verification()).toBeUndefined();
	});

	it("requires an applied integration", () => {
		const { store, verify, ciProof, verification } = fixture();
		store.transaction((state) => {
			state.runs.run.status = "integrating";
		});
		expect(() => verify(ciProof())).toThrow(/applied integration/);
		expect(verification()).toBeUndefined();
	});

	it("requires the integrate-dev capability", () => {
		const { policy, verify, ciProof, verification } = fixture();
		expect(() => verify(ciProof(), { ...policy, capabilities: [] })).toThrow(/integrate-dev|autonomy/);
		expect(verification()).toBeUndefined();
	});
});
