// Copyright The Open Forge contributors.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadTasks } from "../worktree/contract.mjs";
import { selectAdapter } from "./adapters.mjs";
import { requireCapability } from "./contracts.mjs";
import { exportEvidence } from "./evidence.mjs";
import { applyIntegration, prepareIntegration } from "./integrate.mjs";
import { assertLease, claim } from "./leases.mjs";
import { bindRepository, prepareTask } from "./prepare.mjs";
import { claimNext, completedTasks } from "./queue.mjs";
import { executeAdapter } from "./runner.mjs";
import { taskById } from "./tasks.mjs";
import { verifyRun } from "./verify.mjs";

function adapterFor(settings, policy, role, authors = []) {
	for (const adapter of settings.adapters) {
		if (
			role === "reviewer" &&
			policy.differentReviewerFamily &&
			authors.some((author) => author.family === adapter.family)
		)
			continue;
		try {
			return selectAdapter(settings, policy, adapter.id, role).id;
		} catch {
			/* Try the next configured candidate. */
		}
	}
	throw new Error(`no authorized independent adapter for ${role}`);
}

/** One explicitly selected Task, bounded repair rounds, no shell-generated plans or implicit publishing. */
export async function cycle({
	root,
	store,
	policy,
	settings,
	taskId,
	runId,
	holder,
	tests = [],
	signal,
	through = "verify",
}) {
	if (!["verify", "integrate"].includes(through)) throw new Error("invalid cycle target");
	if (through === "integrate") requireCapability(policy, "integrate-dev");
	requireCapability(policy, "implement");
	requireCapability(policy, "review");
	requireCapability(policy, "verify");
	bindRepository(store, root);
	let task = taskById(root, taskId);
	let run = store.read().runs[runId];
	let token;
	if (!run) {
		const author = adapterFor(settings, policy, "implementer");
		adapterFor(settings, policy, "reviewer", [settings.adapters.find((adapter) => adapter.id === author)]);
		const loaded = loadTasks(root);
		if (loaded.problems.length) throw new Error(loaded.problems.join("; "));
		token = claim(store, task, {
			holder,
			runId,
			ttl: policy.limits.leaseMs,
			completed: completedTasks(loaded.tasks),
		});
		const prepared = await prepareTask({ root, store, policy, settings, token, tests, signal });
		task = prepared.task;
		run = store.read().runs[runId];
	} else {
		if (run.task !== taskId) throw new Error("run belongs to a different Task");
		const lease = store.read().leases[taskId];
		token = { task: taskId, runId, holder, generation: lease?.generation };
		assertLease(store.read(), token, Date.now());
		if (!run.contract || ["preparing", "preparation-failed"].includes(run.status))
			throw new Error("interrupted preparation requires recovery inspection; source is preserved");
	}
	const request = readFileSync(join(root, task.file), "utf8");
	try {
		while (!signal?.aborted) {
			run = store.read().runs[runId];
			if (run.status === "verified") {
				if (through !== "integrate")
					return { runId, status: "verified", evidence: exportEvidence(store, runId, policy) };
				if (run.integration?.phase === "prepared") return applyIntegration({ root, store, policy, token });
				prepareIntegration({ root, store, policy, token });
				continue;
			}
			if (["claimed", "changes-requested", "verification-failed"].includes(run.status)) {
				await executeAdapter({
					store,
					policy,
					settings,
					token,
					task,
					runContract: run.contract,
					adapterId: adapterFor(settings, policy, "implementer"),
					role: "implementer",
					signal,
					request: JSON.stringify({
						taskData: request,
						previousReview: run.review,
						verificationFailure: run.verificationFailure ?? null,
					}),
				});
			} else if (run.status === "implemented") {
				await executeAdapter({
					store,
					policy,
					settings,
					token,
					task,
					runContract: run.contract,
					adapterId: adapterFor(settings, policy, "reviewer", run.authors),
					role: "reviewer",
					signal,
					request,
				});
			} else if (run.status === "reviewed") {
				try {
					await verifyRun({ store, policy, settings, token, signal });
				} catch (error) {
					// Only an executed, safely cleaned verification failure enters repair.
					// Approval, lease and preflight failures keep their original stopping semantics.
					const stopped = store.read().runs[runId];
					if (stopped?.status !== "verification-failed" || stopped.verificationRetryable !== true) throw error;
				}
			} else {
				return { runId, status: "needs-action", reason: `run status: ${run.status}` };
			}
		}
		return { runId, status: "needs-action", reason: "cancelled" };
	} catch (error) {
		store.transaction((state) => {
			state.audit.push({ event: "cycle-stopped", runId, reason: error.message, at: Date.now() });
		});
		return { runId, status: "needs-action", reason: error.message };
	}
}

export const defaultMaxStalls = 2;

export function loopLimits(limit, maxStalls) {
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("loop limit must be 1..100");
	if (!Number.isSafeInteger(maxStalls) || maxStalls < 1 || maxStalls > 10)
		throw new Error("loop max-stalls must be 1..10");
	return { limit, maxStalls };
}

export function queueSummary(queue, conflicts) {
	return {
		waiting: queue
			.filter((entry) => entry.waitingFor.length)
			.map((entry) => ({
				task: entry.task,
				waitingFor: entry.waitingFor,
			})),
		leased: queue.filter((entry) => entry.leased).map((entry) => entry.task),
		conflicts: conflicts.map((entry) => ({ task: entry.task, reason: entry.reason })),
	};
}

/**
 * Bounded multi-Task orchestration. Each iteration leases one queue candidate and
 * delegates to the existing single-Task state machine. It never loops implicitly,
 * never retries a terminal/stalled run, and never integrates or publishes by default.
 */
export async function loop({
	root,
	store,
	policy,
	settings,
	limit = 1,
	maxStalls = defaultMaxStalls,
	holder,
	runPrefix = loopRunPrefix(store),
	tests = [],
	signal,
	through = "verify",
	execute = cycle,
}) {
	const limits = loopLimits(limit, maxStalls);
	if (!/^[A-Za-z0-9:_@.-]{1,120}$/u.test(holder ?? "")) throw new Error("invalid loop holder");
	if (!/^[A-Za-z0-9:_@.-]{1,96}$/u.test(runPrefix ?? "")) throw new Error("invalid loop run prefix");
	if (!["verify", "integrate"].includes(through)) throw new Error("invalid loop target");
	const started = [];
	const notRun = [];
	const seen = new Set();
	let stalls = 0;
	let stopReason = "limit";
	let lastRunId = null;
	if (policy.paused || store.read().control.paused || signal?.aborted) {
		return {
			version: 1,
			limit: limits.limit,
			maxStalls: limits.maxStalls,
			completed: [],
			stopReason: signal?.aborted ? "cancelled" : "paused",
			started: [],
			notRun: [],
			lastRunId: null,
		};
	}
	for (let index = 0; index < limits.limit; index += 1) {
		if (signal?.aborted) {
			stopReason = "cancelled";
			break;
		}
		const state = store.read();
		if (state.control.paused || policy.paused) {
			stopReason = "paused";
			break;
		}
		const runId = `${runPrefix}-${String(index + 1)}`;
		const selection = claimNext(root, store, {
			holder,
			runId,
			ttl: policy.limits.leaseMs,
		});
		const summary = queueSummary(selection.queue ?? [], selection.conflicts);
		if (!selection.token) {
			notRun.push(...summary.waiting.map((entry) => ({ task: entry.task, reason: "dependency-waiting" })));
			notRun.push(...summary.leased.map((task) => ({ task, reason: "already-leased" })));
			notRun.push(...summary.conflicts.map((entry) => ({ task: entry.task, reason: entry.reason })));
			if (!summary.waiting.length && !summary.leased.length && !summary.conflicts.length) stopReason = "empty-queue";
			else stopReason = summary.conflicts.length ? "blocked" : "no-eligible-task";
			break;
		}
		lastRunId = runId;
		seen.add(selection.token.task);
		let result;
		try {
			result = await execute({
				root,
				store,
				policy,
				settings,
				taskId: selection.token.task,
				runId,
				holder,
				tests,
				signal,
				through,
			});
		} catch (error) {
			result = { runId, status: "needs-action", reason: error.message };
		}
		const run = store.read().runs[runId];
		started.push({
			task: selection.token.task,
			runId,
			status: result.status,
			reason: result.reason ?? null,
			stage: run?.status ?? null,
			cleanupUnknown: run?.cleanupUnknown ?? false,
		});
		if (signal?.aborted || run?.cleanupUnknown || store.read().control.paused) {
			stopReason = signal?.aborted ? "cancelled" : "cleanup-required";
			break;
		}
		if (result.status === "needs-action") {
			stalls += 1;
			if (stalls >= limits.maxStalls) {
				stopReason = "stalled";
				break;
			}
		} else {
			stalls = 0;
		}
		if (through === "verify" && result.status === "verified") {
			notRun.push({ task: selection.token.task, reason: "integration-not-requested" });
		}
	}
	if (started.length === 0 && stopReason === "limit") stopReason = "empty-queue";
	return {
		version: 1,
		limit: limits.limit,
		maxStalls: limits.maxStalls,
		completed: [...seen],
		stopReason,
		started,
		notRun,
		lastRunId,
	};
}

/** Start a new bounded loop; an existing run remains available through cycle for an explicit recovery. */
export function loopRunPrefix(store) {
	return `loop-${new Date().toISOString().replace(/[^0-9]/gu, "-")}-${store.read().revision}-${process.pid}`;
}
