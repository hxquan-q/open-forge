// Copyright The Open Forge contributors.
import { execFileSync } from "node:child_process";
import {
	appendFileSync,
	cpSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { digest } from "./contracts.mjs";
import { exportEvidence } from "./evidence.mjs";
import { testExecutionProof } from "./execution-proof-fixture.mjs";
import { git, snapshot } from "./git.mjs";
import { claim } from "./leases.mjs";
import { processFixture } from "./process-fixture.mjs";
import { codeBinding, executeAdapter as executeAdapterUnderTest } from "./runner.mjs";
import { createStore } from "./store.mjs";
import { verifyRun as verifyRunUnderTest, visualReviewRequest } from "./verify.mjs";

let template;
beforeEach((context) => {
	context.processes = processFixture(context.signal);
	context.roots = [];
	context.fixture = fixture(context);
});
function executeAdapter(context) {
	return context.processes.run((signal) => {
		testExecutionProof({ ...context, root: context.runContract.worktree });
		return executeAdapterUnderTest({ ...context, signal });
	});
}
function verifyRun(context) {
	return context.processes.run((signal) => verifyRunUnderTest({ ...context, signal }));
}
beforeAll(() => {
	template = mkdtempSync(join(tmpdir(), "forge-autonomy-runner-template-"));
	const repo = join(template, "repo");
	execFileSync("git", ["init", "--quiet", repo], { windowsHide: true });
	appendFileSync(
		join(repo, ".git/config"),
		"\n[user]\n\tname = Fixture\n\temail = fixture@example.invalid\n[commit]\n\tgpgsign = false\n",
	);
	writeFileSync(join(repo, "feature.txt"), "broken\n");
	writeFileSync(
		join(repo, "feature.test.mjs"),
		"import {strict as assert} from 'node:assert';import {readFileSync,writeFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';assert.equal(readFileSync('feature.txt','utf8'),'fixed\\n');writeFileSync(process.argv[2],JSON.stringify({success:true,numTotalTests:1,numPassedTests:1,numFailedTests:0,testResults:[{name:fileURLToPath(import.meta.url),status:'passed',assertionResults:[{status:'passed'}]}]}));",
	);
	git(repo, ["add", "--", "feature.txt", "feature.test.mjs"]);
	git(repo, ["commit", "--quiet", "-m", "baseline", "--", "feature.txt", "feature.test.mjs"]);
});
afterAll(() => {
	if (template) rmSync(template, { recursive: true, force: true });
});
function fixture({ processes, roots }) {
	processes.signal.throwIfAborted();
	const root = mkdtempSync(join(tmpdir(), "forge-autonomy-runner-"));
	roots.push(root);
	cpSync(template, root, { recursive: true });
	const repo = join(root, "repo");
	const task = {
		id: "TASK-0001",
		status: "in_progress",
		readPaths: ["feature.txt"],
		writePaths: ["feature.txt"],
		exclusivePaths: [],
		dependsOn: [],
		conflictsWith: [],
	};
	const policy = JSON.parse(
		readFileSync(fileURLToPath(new URL("../../project/autonomy-policy.json", import.meta.url)), "utf8"),
	);
	policy.level = 2;
	policy.capabilities = ["plan", "triage", "lessons", "implement", "review", "verify", "integrate-dev"];
	policy.allowedProviders = ["fixture"];
	policy.requiredChecks = ["tests", "check"];
	policy.limits.heartbeatMs = 100;
	policy.limits.leaseMs = 10000;
	policy.limits.wallTimeMs = 10000;
	policy.limits.stallMs = 5000;
	const adapter = (id, family, script) => ({
		id,
		enabled: true,
		provider: "fixture",
		family,
		model: "fixture-model",
		roles: ["implementer", "reviewer"],
		command: [process.execPath, "--input-type=module", "-e", script],
		doctorCommand: [process.execPath, "--version"],
		isolation: "external-sandbox",
	});
	const implementation =
		"import {writeFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';writeFileSync('feature.txt','fixed\\n');execFileSync('git',['commit','--quiet','-m','fix','--','feature.txt']);console.log(JSON.stringify({status:'completed',summary:'fixed behavior'}));";
	const settings = {
		version: 1,
		adapters: [
			adapter("author", "family-a", implementation),
			adapter("reviewer", "family-b", "console.log(JSON.stringify({verdict:'approve',findings:[]}))"),
		],
	};
	const runContract = {
		version: 1,
		task: task.id,
		baseCommit: snapshot(repo).head,
		taskDigest: digest(task),
		policyDigest: digest(policy),
		adaptersDigest: digest(settings),
		worktree: repo,
		testFiles: ["feature.test.mjs"],
		minimumTests: 1,
		checks: ["tests", "check"],
	};
	const store = createStore(join(root, "controller"));
	const token = claim(
		store,
		{ ...task, status: "ready" },
		{ holder: "controller", runId: "run-one", ttl: policy.limits.leaseMs },
	);
	return { store, policy, settings, task, runContract, token, repo, processes };
}
afterEach(async ({ processes, roots }) => {
	await processes.close();
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("implementation and independent review through real processes and Git", () => {
	it("keeps repository copies and controller state independent from the test template", (test) => {
		const first = test.fixture;
		const second = fixture(test);
		const original = join(template, "repo");
		const oid = snapshot(first.repo).head;
		const objects = [original, first.repo, second.repo].map((repo) => {
			expect(snapshot(repo).head).toBe(oid);
			expect(git(repo, ["rev-parse", "--git-common-dir"])).toBe(".git");
			expect(existsSync(join(repo, ".git/objects/info/alternates"))).toBe(false);
			const object = statSync(join(repo, ".git/objects", oid.slice(0, 2), oid.slice(2)));
			expect(object.nlink).toBe(1);
			return `${object.dev}:${object.ino}`;
		});
		expect(new Set(objects).size).toBe(3);
		git(first.repo, ["tag", "only-first"]);
		testExecutionProof({ ...first, root: first.repo });
		first.store.transaction((state) => {
			state.control.paused = true;
		});
		writeFileSync(join(first.repo, "feature.txt"), "only first\n");
		for (const repo of [original, second.repo]) {
			expect(git(repo, ["tag", "--list"])).toBe("");
			expect(readFileSync(join(repo, "feature.txt"), "utf8")).toBe("broken\n");
		}
		expect(second.store.read().control.paused).toBe(false);
		expect(existsSync(join(second.store.root, "execution-proof.json"))).toBe(false);
	});
	it("does not mark an exit-zero but empty verification report as automatically repairable", async (test) => {
		const context = test.fixture;
		await executeAdapter({ ...context, adapterId: "author", role: "implementer", request: "fix" });
		await executeAdapter({ ...context, adapterId: "reviewer", role: "reviewer", request: "review" });
		await expect(
			verifyRun({
				...context,
				resolveCommand: (_id, _contract, path) => [
					process.execPath,
					"--input-type=module",
					"-e",
					`import{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(path)},JSON.stringify({success:true,numTotalTests:0,numPassedTests:0,numFailedTests:0,testResults:[]}));`,
				],
			}),
		).rejects.toThrow();
		expect(context.store.read().runs[context.token.runId]).toMatchObject({
			status: "verification-failed",
			verificationRetryable: false,
		});
	});
	it("retains UI runtime artifacts pending independent visual review, then verifies the exact cached result", async (test) => {
		const context = test.fixture;
		const plan = { version: 1, steps: [{ action: "click", selector: "button" }] };
		writeFileSync(join(context.repo, "ui-plan.json"), JSON.stringify(plan));
		git(context.repo, ["add", "--", "ui-plan.json"]);
		git(context.repo, ["commit", "--quiet", "-m", "UI plan", "--", "ui-plan.json"]);
		context.policy.capabilities.push("verify-ui");
		context.runContract.policyDigest = digest(context.policy);
		context.runContract.baseCommit = snapshot(context.repo).head;
		context.runContract.uiAcceptance = { authorized: true, plan: "ui-plan.json", planDigest: digest(plan) };
		context.runContract.checks.push("ui");
		context.settings.adapters.push({
			...context.settings.adapters[1],
			id: "visual",
			family: "family-visual",
			roles: ["ui-reviewer"],
			command: [
				process.execPath,
				"--input-type=module",
				"-e",
				"let input='';for await(const chunk of process.stdin)input+=chunk;const request=JSON.parse(input.trim().split('\\n').at(-1)).requestData;console.log(request);",
			],
		});
		context.runContract.adaptersDigest = digest(context.settings);
		await executeAdapter({ ...context, adapterId: "author", role: "implementer", request: "fix" });
		await executeAdapter({ ...context, adapterId: "reviewer", role: "reviewer", request: "review" });
		let uiExecutions = 0;
		const resolveCommand = (id, _contract, reportPath) => {
			if (id === "tests") return [process.execPath, "feature.test.mjs", reportPath];
			if (id !== "ui") return [process.execPath, "--check", "feature.test.mjs"];
			uiExecutions++;
			if (uiExecutions > 1)
				return [process.execPath, "-e", "throw Error('cached UI runtime must not execute twice')"];
			const binding = digest(codeBinding(context.runContract, snapshot(context.repo)));
			return [
				process.execPath,
				"--input-type=module",
				"-e",
				`import {writeFileSync} from 'node:fs';import{dirname,join}from'node:path';import{createHash}from'node:crypto';const path=${JSON.stringify(reportPath)};const bytes=Buffer.from([137,80,78,71,13,10,26,10]);const checks=['mono','sand','default'].flatMap(theme=>['light','dark'].map(mode=>{const image=join(dirname(path),theme+'-'+mode+'.png');writeFileSync(image,bytes);return{theme,mode,assertions:3,screenshot:{path:image,sha256:createHash('sha256').update(bytes).digest('hex')}}}));writeFileSync(path,JSON.stringify({version:1,profile:'fresh',binding:${JSON.stringify(binding)},planDigest:${JSON.stringify(digest(plan))},passed:true,cleanupKnown:true,checks,errors:[]}));`,
			];
		};
		await expect(verifyRun({ ...context, resolveCommand })).rejects.toThrow(/awaiting independent visual/);
		const waiting = context.store.read().runs[context.token.runId];
		expect(waiting.status).toBe("awaiting-ui-review");
		const report = JSON.parse(readFileSync(waiting.uiAcceptance.path, "utf8"));
		expect(visualReviewRequest(waiting, context.runContract).artifactDigest).toBe(digest(report.checks));
		await executeAdapter({
			...context,
			adapterId: "visual",
			role: "ui-reviewer",
			request: JSON.stringify({
				verdict: "approve",
				proven: ["fixture artifacts only"],
				gaps: [],
				findings: [],
				artifactDigest: digest(report.checks),
				coverage: report.checks.map((c) => `${c.theme}/${c.mode}`),
			}),
		});
		expect((await verifyRun({ ...context, resolveCommand })).status).toBe("verified");
		expect(uiExecutions).toBe(2); // The second resolved command fails if the verifier mistakenly spawns it.
		expect(
			exportEvidence(context.store, context.token.runId, context.policy).checks.find((entry) => entry.id === "ui").ui
				.reviewer.family,
		).toBe("family-visual");
		expect(context.store.read().runs[context.token.runId].analyses[0].identity.family).toBe("family-visual");
		writeFileSync(waiting.uiAcceptance.path, "corrupt cleanup report");
		await expect(verifyRun({ ...context, resolveCommand })).rejects.toThrow(/cleanup unknown/);
		expect(context.store.read().control.paused).toBe(true);
		expect(context.store.read().runs[context.token.runId].status).toBe("cleanup-required");
	}, 15000);
	it("refuses real execution without a trusted boundary attestation before spawning", async (test) => {
		const context = test.fixture;
		await expect(
			executeAdapterUnderTest({ ...context, adapterId: "author", role: "implementer", request: "fix" }),
		).rejects.toThrow(/boundary is unproven/);
		expect(readFileSync(join(context.repo, "feature.txt"), "utf8")).toBe("broken\n");
		expect(context.store.read().runs).toEqual({});
	});
	it("records runner-owned authorship and independently reviews the committed candidate", async (test) => {
		const context = test.fixture;
		const implemented = await executeAdapter({
			...context,
			adapterId: "author",
			role: "implementer",
			request: "fix feature",
		});
		expect(implemented.status).toBe("implemented");
		expect(readFileSync(join(context.repo, "feature.txt"), "utf8")).toBe("fixed\n");
		expect(implemented.authors[0].family).toBe("family-a");
		expect(implemented.attempts[0].usage).toBe(null);
		const reviewed = await executeAdapter({
			...context,
			adapterId: "reviewer",
			role: "reviewer",
			request: "review behavior",
		});
		expect(reviewed.status).toBe("reviewed");
		expect(reviewed.review.binding.head).toBe(snapshot(context.repo).head);
		expect(reviewed.review.reviewer.actorId).not.toBe(reviewed.authors[0].actorId);
	});
	it("refuses same-family review before spawning and prevents model text from forging identity", async (test) => {
		const context = test.fixture;
		context.settings.adapters[1].family = "family-a";
		context.runContract.adaptersDigest = digest(context.settings);
		await executeAdapter({ ...context, adapterId: "author", role: "implementer", request: "fix" });
		await expect(
			executeAdapter({ ...context, adapterId: "reviewer", role: "reviewer", request: "review" }),
		).rejects.toThrow(/independent/);
		const forged = fixture(test);
		forged.settings.adapters[1].command = [
			process.execPath,
			"-e",
			"console.log(JSON.stringify({verdict:'approve',findings:[],reviewer:{family:'human'}}))",
		];
		forged.runContract.adaptersDigest = digest(forged.settings);
		await executeAdapter({ ...forged, adapterId: "author", role: "implementer", request: "fix" });
		await expect(
			executeAdapter({ ...forged, adapterId: "reviewer", role: "reviewer", request: "review" }),
		).rejects.toThrow(/unknown property/);
		expect(forged.store.read().runs[forged.token.runId].review).toBe(null);
	});
	it("runs the actual candidate test after review and stores version-bound verification results", async (test) => {
		const context = test.fixture;
		await executeAdapter({ ...context, adapterId: "author", role: "implementer", request: "fix" });
		await executeAdapter({ ...context, adapterId: "reviewer", role: "reviewer", request: "review" });
		const verified = await verifyRun({
			...context,
			resolveCommand: (id, _contract, reportPath) =>
				id === "tests"
					? [process.execPath, "feature.test.mjs", reportPath]
					: [process.execPath, "--check", "feature.test.mjs"],
		});
		expect(verified.status).toBe("verified");
		expect(verified.checks[0].tests.passed).toBe(1);
		expect(verified.checks.every((check) => check.binding.head === snapshot(context.repo).head)).toBe(true);
		const evidence = exportEvidence(context.store, context.token.runId, context.policy);
		expect(evidence.binding.head).toBe(snapshot(context.repo).head);
		expect(evidence.gates.gates).toEqual([]);
	});
	it("rejects a changed candidate instead of reusing its earlier review", async (test) => {
		const context = test.fixture;
		await executeAdapter({ ...context, adapterId: "author", role: "implementer", request: "fix" });
		await executeAdapter({ ...context, adapterId: "reviewer", role: "reviewer", request: "review" });
		writeFileSync(join(context.repo, "feature.txt"), "regressed\n");
		git(context.repo, ["add", "--", "feature.txt"]);
		git(context.repo, ["commit", "--quiet", "-m", "changed after review", "--", "feature.txt"]);
		await expect(verifyRun(context)).rejects.toThrow(/stale/);
		expect(context.store.read().runs[context.token.runId].checks).toEqual([]);
	});
	it("stores controller-owned triage advice without creating authorship or changing the Task status", async (test) => {
		const context = test.fixture;
		const triageOutput = {
			status: "investigate",
			kind: "bug",
			relevance: "relevant",
			summary: "The repair needs a real reproduction",
			reproduction: ["Run the fixture test"],
			risks: ["security"],
		};
		context.settings.adapters[1].family = "family-c";
		context.settings.adapters[1].roles = ["triage"];
		context.settings.adapters[1].command = [
			process.execPath,
			"-e",
			`console.log(${JSON.stringify(JSON.stringify(triageOutput))})`,
		];
		context.runContract.adaptersDigest = digest(context.settings);
		const result = await executeAdapter({
			...context,
			adapterId: "reviewer",
			role: "triage",
			request: "investigate",
		});
		expect(result.status).toBe("claimed");
		expect(result.authors).toEqual([]);
		expect(result.analyses[0]).toMatchObject({
			output: { kind: "triage", body: triageOutput },
			identity: { adapterId: "reviewer" },
		});
		expect(result.attempts[0].role).toBe("triage");
	});
	it("requires approval before executing verification for a security-sensitive candidate", async (test) => {
		const context = test.fixture;
		const command = context.settings.adapters[0].command;
		command[command.length - 1] = command.at(-1).replace("fixed", "fetch(");
		context.runContract.adaptersDigest = digest(context.settings);
		await executeAdapter({ ...context, adapterId: "author", role: "implementer", request: "fix" });
		await executeAdapter({ ...context, adapterId: "reviewer", role: "reviewer", request: "review" });
		await expect(
			verifyRun({
				...context,
				resolveCommand: () => {
					throw new Error("verification started before gate review");
				},
			}),
		).rejects.toThrow(/bound human approval/);
	});
});
