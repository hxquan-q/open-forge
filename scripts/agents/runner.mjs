// Copyright The Open Forge contributors.
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { decodeOutput, executionPrompt, outputKind, ROLES, selectAdapter } from "./adapters.mjs";
import { contract, digest, requireCapability } from "./contracts.mjs";
import { assertExecutionBoundary } from "./doctor.mjs";
import { assertIndependentReview } from "./evidence.mjs";
import { assertSeparateRoots, assertWriteScope, git, snapshot } from "./git.mjs";
import { ACTIVE_RUN_STATUSES, assertLease, renew } from "./leases.mjs";
import { isolatedEnvironment, runProcess } from "./process.mjs";
import { reportedUsage } from "./usage.mjs";

export function codeBinding(runContract, code) {
	return { head: code.head, tree: code.tree, policy: runContract.policyDigest, contract: digest(runContract) };
}

/** The controller provisions the execution root; a reviewer must never share one with an implementer. */
export function assertDistinctContext(authors, contextId) {
	if (authors.some((author) => author?.contextId === contextId))
		throw new Error("review shares an execution context with an implementer");
	return true;
}

/** Remove the controller-provisioned detached review candidate; a leftover candidate fails the review. */
export function removeReviewCandidate(worktree, reviewRoot) {
	try {
		git(worktree, ["worktree", "remove", "--force", reviewRoot]);
	} catch (error) {
		throw new Error("failed to remove the detached review candidate", { cause: error });
	}
}

export async function executeAdapter({
	store,
	policy,
	settings,
	adapterId,
	role,
	task,
	runContract,
	token,
	request,
	signal,
	analysis = false,
}) {
	if (!Object.hasOwn(ROLES, role)) throw new Error(`unsupported execution role: ${role}`);
	contract("run-contract", runContract);
	if (task.status !== "in_progress") throw new Error("Task must be in_progress before implementation or review");
	if (
		runContract.policyDigest !== digest(policy) ||
		runContract.adaptersDigest !== digest(settings) ||
		runContract.task !== task.id ||
		runContract.taskDigest !== digest(task)
	)
		throw new Error("stale or mismatched run contract");
	if (analysis && !["planner", "triage", "lessons", "ui-reviewer"].includes(role))
		throw new Error("only non-authoring roles are available as analysis steps");
	const adapter = selectAdapter(settings, policy, adapterId, role);
	assertExecutionBoundary({ root: runContract.worktree, stateDirectory: store.root, policy, settings });
	const worktree = assertSeparateRoots(runContract.worktree, store.root);
	const before = snapshot(worktree);
	const lease = assertLease(store.read(), token, Date.now());
	if (lease.task !== task.id) throw new Error("lease does not match Task");
	const existing = store.read().runs[token.runId];
	if (role === "implementer" && before.head !== (existing?.binding?.head ?? runContract.baseCommit))
		throw new Error("worktree does not match the contracted base or last recorded candidate");
	const attemptId = randomUUID();
	const contextId =
		role === "reviewer" ? join(dirname(worktree), `${basename(worktree)}-review-${attemptId.slice(0, 8)}`) : worktree;
	const actorId = `${adapter.id}:${attemptId}`;
	const identity = {
		actorId,
		adapterId: adapter.id,
		provider: adapter.provider,
		family: adapter.family,
		model: adapter.model,
		contextId,
	};
	const binding = codeBinding(runContract, before);
	store.transaction((state) => {
		assertLease(state, token, Date.now());
		const run = state.runs[token.runId] ?? {
			task: task.id,
			status: "claimed",
			attempts: [],
			authors: [],
			analyses: [],
			checks: [],
			review: null,
			contract: runContract,
		};
		run.analyses ??= [];
		if (ACTIVE_RUN_STATUSES.has(run.status)) throw new Error("run already has a live attempt");
		const concurrent = Object.values(state.runs).filter(
			(entry) => entry.status === "running" && entry.attempts.at(-1)?.role === role,
		).length;
		if (concurrent >= (role === "implementer" ? policy.limits.implementers : policy.limits.reviewers))
			throw new Error("run circuit breaker: concurrency limit reached");
		if (["integrated", "published", "cancelled"].includes(run.status)) throw new Error("run is terminal");
		if (digest(run.contract) !== digest(runContract))
			throw new Error("run contract cannot change during an attempt sequence");
		const rounds = run.attempts.filter((attempt) => attempt.role === role).length;
		if (rounds >= (role === "implementer" ? policy.limits.implRounds : policy.limits.reviewRounds))
			throw new Error("run circuit breaker: round limit reached");
		if (role === "reviewer") {
			assertIndependentReview(
				{ reviewer: identity, verdict: "approve", findings: [], binding },
				run.authors,
				binding,
				policy.differentReviewerFamily,
			);
			if (run.binding?.head !== before.head || run.binding?.tree !== before.tree)
				throw new Error("code changed before review");
			assertDistinctContext(run.authors, contextId);
		} else if (role === "implementer") {
			run.checks = [];
			run.review = null;
			run.authors.push(identity);
		}
		run.analysisBaseStatus = run.status;
		run.status = "running";
		run.pid = null;
		run.attempts.push({ id: attemptId, role, identity, startedAt: Date.now(), status: "running" });
		state.runs[token.runId] = run;
	});
	let reviewRoot;
	let reviewBefore;
	if (role === "reviewer") {
		reviewRoot = contextId;
		let added = false;
		try {
			git(worktree, ["worktree", "add", "--detach", reviewRoot, before.head]);
			added = true;
			reviewBefore = snapshot(reviewRoot, { clean: false });
			if (!reviewBefore.clean) throw new Error("detached review candidate is not clean");
		} catch (error) {
			if (added) removeReviewCandidate(worktree, reviewRoot);
			throw error;
		}
	}
	const attemptDirectory = join(store.root, "artifacts", attemptId);
	mkdirSync(attemptDirectory, { recursive: true, mode: 0o700 });
	const controller = new AbortController();
	const abort = () => controller.abort();
	signal?.addEventListener("abort", abort, { once: true });
	if (signal?.aborted) controller.abort();
	let heartbeatError;
	const heartbeat = setInterval(() => {
		try {
			renew(store, token, { ttl: policy.limits.leaseMs });
		} catch (error) {
			heartbeatError = error;
			controller.abort();
		}
	}, policy.limits.heartbeatMs);
	let result;
	let body;
	let after;
	let failure;
	try {
		result = await runProcess({
			command: adapter.command.map((argument) => argument.replaceAll("{model}", adapter.model)),
			cwd: role === "reviewer" ? reviewRoot : worktree,
			env: isolatedEnvironment(attemptDirectory),
			input: executionPrompt(role, task, runContract, request),
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
		if (heartbeatError) throw heartbeatError;
		assertLease(store.read(), token, Date.now());
		if (result.reason !== "success") throw new Error(`adapter ended with ${result.reason}`);
		body = decodeOutput(result.stdout, role);
		after = role === "reviewer" ? snapshot(reviewRoot, { clean: false }) : snapshot(worktree);
		if (role === "reviewer") {
			if (after.head !== reviewBefore.head || after.tree !== reviewBefore.tree || !after.clean)
				throw new Error("reviewer modified the candidate");
		} else if (role !== "implementer" && (after.head !== before.head || after.tree !== before.tree))
			throw new Error(`${role} modified the candidate`);
		if (role === "implementer") {
			const coordinatorPaths = store.read().runs[token.runId].integration?.coordinatorPaths ?? [];
			if (coordinatorPaths.some((path) => ![task.file, "project/tasks/README.md"].includes(path)))
				throw new Error("invalid integration metadata scope");
			assertWriteScope(worktree, runContract.baseCommit, [...task.writePaths, ...coordinatorPaths]);
			if (after.head === before.head) throw new Error("implementer must commit its candidate before review");
		}
	} catch (error) {
		failure = error;
	} finally {
		clearInterval(heartbeat);
		signal?.removeEventListener("abort", abort);
		if (reviewRoot) {
			try {
				removeReviewCandidate(worktree, reviewRoot);
			} catch (error) {
				if (!failure) failure = error;
			}
		}
	}
	store.transaction((state) => {
		assertLease(state, token, Date.now(), { allowExpired: true });
		const run = state.runs[token.runId];
		const attempt = run.attempts.find((entry) => entry.id === attemptId);
		const baseStatus = run.analysisBaseStatus;
		delete run.analysisBaseStatus;
		attempt.finishedAt = Date.now();
		attempt.status = failure ? "failed" : "completed";
		attempt.process = result
			? {
					reason: result.reason,
					exitCode: result.exitCode,
					outputDigest: digest(result.stdout),
					stderrDigest: digest(result.stderr),
					startedAt: result.startedAt,
					finishedAt: result.finishedAt,
					cleanupUnknown: result.cleanupUnknown,
				}
			: null;
		attempt.usage = result ? reportedUsage(result.stdout) : null;
		attempt.failure = failure?.message ?? null;
		run.cleanupUnknown = result?.cleanupUnknown ?? false;
		if (run.cleanupUnknown) state.control.paused = true;
		run.pid = run.cleanupUnknown ? result.pid : null;
		if (failure) run.status = run.cleanupUnknown ? "cleanup-required" : "failed";
		else if (role === "implementer") {
			run.binding = codeBinding(runContract, after);
			run.summary = body.summary;
			run.status = body.status === "blocked" ? "blocked" : "implemented";
		} else if (role === "reviewer") {
			run.review = { ...body, reviewer: identity, binding: run.binding };
			run.status = body.verdict === "approve" ? "reviewed" : "changes-requested";
		} else {
			run.analyses.push({
				role,
				attemptId,
				identity,
				binding: { head: before.head, tree: before.tree },
				output: { kind: outputKind(role), body },
			});
			run.status =
				body.status === "blocked" || body.verdict === "insufficient-evidence" ? "blocked-advice" : baseStatus;
		}
		state.audit.push({
			event: "attempt-finished",
			task: task.id,
			runId: token.runId,
			attemptId,
			role,
			status: run.status,
			at: Date.now(),
		});
	});
	if (failure) throw failure;
	return store.read().runs[token.runId];
}

export function assertRunnable(policy, role) {
	if (!Object.hasOwn(ROLES, role)) throw new Error(`unsupported execution role: ${role}`);
	requireCapability(policy, ROLES[role].capability);
}
