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
import { completedTasks } from "./queue.mjs";
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
				await verifyRun({ store, policy, token, signal });
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
