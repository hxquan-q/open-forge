// Copyright The Open Forge contributors.
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { assertApproved, trustedHumans } from "./approval.mjs";
import { digest, requireCapability } from "./contracts.mjs";
import { auditDesign } from "./design.mjs";
import { assertExecutionBoundary } from "./doctor.mjs";
import { assertCheckResults, assertIndependentReview, testReport } from "./evidence.mjs";
import { changedFiles, readChanges, snapshot } from "./git.mjs";
import { assertLease, renew } from "./leases.mjs";
import { classifyChanges } from "./policy.mjs";
import { isolatedEnvironment, runProcess } from "./process.mjs";
import { codeBinding } from "./runner.mjs";
import { assertUiReport, assertVisualReview, uiPlan } from "./ui-verification.mjs";

export function readUiPlan(worktree, name) {
	if (typeof name !== "string" || isAbsolute(name) || name.split(/[\\/]/u).some((part) => part === ".."))
		throw new Error("UI execution needs a repository-relative plan");
	const path = realpathSync(resolve(worktree, name));
	const rel = relative(realpathSync(worktree), path);
	if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("UI acceptance plan escaped the repository");
	const plan = uiPlan(JSON.parse(readFileSync(path, "utf8")));
	return { path, plan };
}
export function acceptancePlan(runContract) {
	const entry = runContract.uiAcceptance;
	if (entry?.authorized !== true) throw new Error("UI execution needs explicit authorization");
	const { path, plan } = readUiPlan(runContract.worktree, entry.plan);
	if (digest(plan) !== entry.planDigest) throw new Error("UI acceptance plan changed");
	return { path, plan };
}

export function visualReviewRequest(run, runContract) {
	const cached = run?.uiAcceptance;
	const binding = codeBinding(runContract, snapshot(runContract.worktree));
	if (!cached || digest(cached.binding) !== digest(binding))
		throw new Error("Visual review needs current UI runtime evidence");
	const report = assertUiReport(JSON.parse(readFileSync(cached.path, "utf8")), {
		plan: acceptancePlan(runContract).plan,
		binding: digest(binding),
		artifactRoot: dirname(cached.path),
	});
	return {
		artifactDigest: digest(report.checks),
		checks: report.checks,
		design: "apps/desktop/DESIGN.md",
		instruction:
			"Inspect all six actual images through the adapter's explicitly provided read-only image channel. Metadata is not visual evidence. If images are inaccessible, return insufficient-evidence. Never access controller state or keys.",
	};
}

export function checkCommand(id, runContract, reportPath, files) {
	if (id === "tests")
		return [
			"bun",
			"scripts/quality/run-vitest.mjs",
			"--run",
			...runContract.testFiles,
			"--reporter=json",
			`--outputFile=${reportPath}`,
		];
	if (id === "check") return ["bun", "run", "check"];
	if (id === "impact") return ["bun", "run", "test:impact", "--", ...files];
	if (id === "packaged") return ["bun", "run", "--cwd", "apps/desktop", "test:e2e:packaged"];
	if (id === "ui") {
		const { path } = acceptancePlan(runContract);
		return [
			"bun",
			"scripts/agents/ui-verification.mjs",
			"--authorize-ui",
			path,
			reportPath,
			digest(codeBinding(runContract, snapshot(runContract.worktree))),
		];
	}
	throw new Error(`check needs an explicitly authorized verification adapter: ${id}`);
}

export async function verifyRun({ store, policy, settings, token, signal, resolveCommand = checkCommand }) {
	requireCapability(policy, "verify");
	const run = store.read().runs[token.runId];
	if (!run || !["reviewed", "verified", "awaiting-ui-review"].includes(run.status))
		throw new Error("run has no completed independent review");
	assertLease(store.read(), token, Date.now());
	if (run.contract.policyDigest !== digest(policy)) throw new Error("verification policy changed");
	if (!settings || run.contract.adaptersDigest !== digest(settings)) throw new Error("verification adapters changed");
	assertExecutionBoundary({ root: run.contract.worktree, stateDirectory: store.root, policy, settings });
	const binding = codeBinding(run.contract, snapshot(run.contract.worktree));
	assertIndependentReview(run.review, run.authors, binding, policy.differentReviewerFamily);
	const approvals = run.approvals ?? [];
	const changes = readChanges(run.contract.worktree, run.contract.baseCommit);
	const design = auditDesign(changes);
	if (design.findings.length)
		throw new Error(
			`DESIGN source violations: ${design.findings.map((finding) => `${finding.rule} ${finding.file}:${finding.line}`).join(", ")}`,
		);
	if (design.affected.length && !run.contract.checks.includes("ui"))
		throw new Error("UI changes require runtime and visual verification; source lint is insufficient");
	assertApproved(
		classifyChanges(changes),
		binding,
		approvals,
		approvals.length ? trustedHumans(store.root) : new Map(),
	);
	if (policy.requiredChecks.some((id) => !run.contract.checks.includes(id)))
		throw new Error("run contract omits a required check");
	for (const id of run.contract.checks) {
		if (id === "ui") {
			requireCapability(policy, "verify-ui");
			acceptancePlan(run.contract);
		}
		if (id === "packaged") requireCapability(policy, "verify-packaged");
	}
	const checkDirectory = join(store.root, "artifacts", randomUUID());
	mkdirSync(checkDirectory, { recursive: true, mode: 0o700 });
	const files = changedFiles(run.contract.worktree, run.contract.baseCommit);
	const controller = new AbortController();
	const abort = () => controller.abort();
	signal?.addEventListener("abort", abort, { once: true });
	if (signal?.aborted) controller.abort();
	let heartbeatError;
	store.transaction((state) => {
		assertLease(state, token, Date.now());
		state.runs[token.runId].status = "verifying";
		state.runs[token.runId].checks = [];
		state.runs[token.runId].verificationArtifacts ??= [];
		state.runs[token.runId].verificationArtifacts.push(checkDirectory);
	});
	const heartbeat = setInterval(() => {
		try {
			renew(store, token, { ttl: policy.limits.leaseMs });
		} catch (error) {
			heartbeatError = error;
			controller.abort();
		}
	}, policy.limits.heartbeatMs);
	let failure;
	let awaitingVisual = false;
	try {
		for (const id of run.contract.checks) {
			assertLease(store.read(), token, Date.now());
			const reportPath = join(checkDirectory, `${id}.json`);
			const resolvedCommand = resolveCommand(id, run.contract, reportPath, files);
			const cached = id === "ui" && store.read().runs[token.runId].uiAcceptance;
			const reusable = cached && digest(cached.binding) === digest(binding);
			const command = reusable ? cached.command : resolvedCommand;
			const result = reusable
				? { ...cached.result, cleanupUnknown: false }
				: await runProcess({
						command,
						cwd: run.contract.worktree,
						env: isolatedEnvironment(checkDirectory),
						timeoutMs: policy.limits.wallTimeMs,
						stallMs: policy.limits.stallMs,
						maxOutputBytes: policy.limits.outputBytes,
						signal: controller.signal,
						onSpawn: (pid) =>
							store.transaction((state) => {
								assertLease(state, token, Date.now());
								state.runs[token.runId].pid = pid;
							}),
					});
			if (result.cleanupUnknown)
				store.transaction((state) => {
					assertLease(state, token, Date.now(), { allowExpired: true });
					state.runs[token.runId].cleanupUnknown = true;
					state.runs[token.runId].pid = result.pid;
					state.control.paused = true;
				});
			if (heartbeatError) throw heartbeatError;
			writeFileSync(join(checkDirectory, `${id}.stdout.log`), result.stdout, { mode: 0o600 });
			writeFileSync(join(checkDirectory, `${id}.stderr.log`), result.stderr, { mode: 0o600 });
			assertLease(store.read(), token, Date.now());
			const check = {
				id,
				command,
				binding,
				status: result.reason === "success" ? "passed" : "failed",
				exitCode: result.exitCode,
				outputDigest: digest(result.stdout),
				stderrDigest: digest(result.stderr),
				tests: null,
				startedAt: result.startedAt,
				finishedAt: result.finishedAt,
			};
			if (check.status === "passed" && id === "tests") {
				check.tests = testReport(JSON.parse(readFileSync(reportPath, "utf8")), {
					minimum: run.contract.minimumTests,
					files: run.contract.testFiles,
				});
			}
			if (id === "ui") {
				const path = reusable ? cached.path : reportPath;
				let report = null;
				try {
					if (existsSync(path)) report = JSON.parse(readFileSync(path, "utf8"));
				} catch {
					/* An unreadable cleanup report cannot establish safe resource release. */
				}
				if (!report || report.cleanupKnown !== true) {
					store.transaction((state) => {
						assertLease(state, token, Date.now());
						state.runs[token.runId].cleanupUnknown = true;
						state.control.paused = true;
					});
					throw new Error("UI cleanup unknown; execution paused");
				}
				assertUiReport(report, {
					plan: acceptancePlan(run.contract).plan,
					binding: digest(binding),
					artifactRoot: dirname(path),
				});
				if (check.status === "passed") {
					store.transaction((state) => {
						assertLease(state, token, Date.now());
						state.runs[token.runId].uiAcceptance = { path, binding, result, command };
					});
					try {
						const visual = assertVisualReview(store.read().runs[token.runId], report, binding);
						check.ui = {
							artifactDigest: digest(report.checks),
							coverage: report.checks.map((entry) => `${entry.theme}/${entry.mode}`),
							reviewer: visual.identity,
						};
					} catch {
						awaitingVisual = true;
					}
				}
			}
			const current = codeBinding(run.contract, snapshot(run.contract.worktree));
			if (digest(current) !== digest(binding)) throw new Error("candidate changed during verification");
			store.transaction((state) => {
				assertLease(state, token, Date.now());
				state.runs[token.runId].checks.push(check);
				state.runs[token.runId].cleanupUnknown = result.cleanupUnknown;
				state.runs[token.runId].pid = result.cleanupUnknown ? result.pid : null;
			});
			if (check.status !== "passed") {
				const error = new Error(`verification failed: ${id} (${result.reason})`);
				error.retryable = result.reason === "failed" && Number.isInteger(result.exitCode) && result.exitCode !== 0;
				throw error;
			}
			if (awaitingVisual)
				throw new Error("UI runtime passed; awaiting independent visual review for the exact artifacts");
		}
		assertCheckResults(store.read().runs[token.runId].checks, policy.requiredChecks, binding);
	} catch (error) {
		failure = error;
	} finally {
		clearInterval(heartbeat);
		signal?.removeEventListener("abort", abort);
	}
	store.transaction((state) => {
		assertLease(state, token, Date.now(), { allowExpired: true });
		const current = state.runs[token.runId];
		if (!current.cleanupUnknown) current.pid = null;
		current.status = current.cleanupUnknown
			? "cleanup-required"
			: awaitingVisual
				? "awaiting-ui-review"
				: failure
					? "verification-failed"
					: "verified";
		current.verificationFailure = failure?.message ?? null;
		current.verificationRetryable = failure?.retryable === true;
		state.audit.push({
			event: "verification-finished",
			task: token.task,
			runId: token.runId,
			status: current.status,
			at: Date.now(),
		});
	});
	if (failure) throw failure;
	return store.read().runs[token.runId];
}
