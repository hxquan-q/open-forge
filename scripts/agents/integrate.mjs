// Copyright The Open Forge contributors.
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertApproved, trustedHumans } from "./approval.mjs";
import { digest, requireCapability } from "./contracts.mjs";
import { exportEvidence } from "./evidence.mjs";
import { git, snapshot } from "./git.mjs";
import { assertLease } from "./leases.mjs";
import { bindRepository, taskIndexStatus, taskMetadata } from "./prepare.mjs";
import { codeBinding } from "./runner.mjs";
import { taskById } from "./tasks.mjs";

function eligible({ root, store, policy, token }) {
	requireCapability(policy, "integrate-dev");
	bindRepository(store, root);
	assertLease(store.read(), token, Date.now());
	if (git(root, ["branch", "--show-current"]) !== "main") throw new Error("integration target must be local main");
	const evidence = exportEvidence(store, token.runId, policy);
	const run = store.read().runs[token.runId];
	const documents = run.approvals ?? [];
	assertApproved(
		evidence.gates,
		evidence.binding,
		documents,
		documents.length ? trustedHumans(store.root) : new Map(),
	);
	if (realpathSync(root) === realpathSync(run.contract.worktree))
		throw new Error("integration needs a separate Task worktree");
	return { run, evidence, task: taskById(root, run.task), target: snapshot(root) };
}

/** Prepare a real merge commit in the existing leased Task worktree, then invalidate all review/check evidence. */
export function prepareIntegration(context) {
	const { store, token } = context;
	const { run, evidence, task, target } = eligible(context);
	const worker = run.contract.worktree;
	if (git(worker, ["branch", "--show-current"]) !== task.branchToken)
		throw new Error("Task branch is not checked out");
	const source = snapshot(worker).head;
	const rounds = (run.integration?.rounds ?? 0) + 1;
	if (rounds > 3) throw new Error("integration circuit breaker: target kept moving");
	store.transaction((state) => {
		assertLease(state, token, Date.now());
		state.runs[token.runId].status = "integrating";
		state.runs[token.runId].pid = null;
		state.runs[token.runId].integration = {
			phase: "preparing",
			rounds,
			source,
			targetBase: target.head,
			sourceEvidence: digest(evidence),
			coordinatorPaths: [task.file, "project/tasks/README.md"],
		};
	});
	try {
		git(worker, ["switch", "--detach", target.head]);
		git(worker, [
			"merge",
			"--no-ff",
			"-m",
			`merge: 集成 ${task.id} 的工程候选`,
			"-m",
			"组合后的提交须重新独立评审和验证，通过前不前进主分支。",
			source,
		]);
		const taskPath = join(worker, task.file);
		writeFileSync(
			taskPath,
			taskMetadata(readFileSync(taskPath, "utf8"), {
				status: "verifying",
				integration_status: "integrated",
				worktree: "unassigned（已集成，待推送后清理）",
			}),
		);
		const indexPath = join(worker, "project/tasks/README.md");
		writeFileSync(indexPath, taskIndexStatus(readFileSync(indexPath, "utf8"), task.id, "verifying"));
		git(worker, ["add", "--", task.file, "project/tasks/README.md"]);
		git(worker, ["diff", "--cached", "--check"]);
		if (git(worker, ["diff", "--cached", "--name-only"]))
			git(worker, [
				"commit",
				"-m",
				`docs(project): 记录 ${task.id} 的集成候选`,
				"-m",
				"人工接受与发布保持独立；实际应用状态与最终提交由控制器记录。",
				"--",
				task.file,
				"project/tasks/README.md",
			]);
		const candidate = snapshot(worker);
		git(worker, ["update-ref", `refs/heads/${task.branchToken}`, candidate.head, source]);
		git(worker, ["switch", task.branchToken]);
		const runContract = { ...run.contract, baseCommit: target.head, taskDigest: digest(task) };
		store.transaction((state) => {
			assertLease(state, token, Date.now());
			const current = state.runs[token.runId];
			current.contract = runContract;
			current.binding = codeBinding(runContract, candidate);
			current.authors.push({
				actorId: `controller:integration:${token.runId}:${rounds}`,
				adapterId: "coordinator",
				provider: "local",
				family: "deterministic-controller",
				model: "git",
			});
			current.status = "implemented";
			current.review = null;
			current.checks = [];
			current.approvals = [];
			current.integration.phase = "prepared";
			current.integration.candidate = candidate.head;
			state.audit.push({
				event: "integration-prepared",
				runId: token.runId,
				candidate: candidate.head,
				at: Date.now(),
			});
		});
		return { runId: token.runId, status: "needs-review", candidate: candidate.head };
	} catch (error) {
		store.transaction((state) => {
			assertLease(state, token, Date.now(), { allowExpired: true });
			state.runs[token.runId].status = "integration-failed";
			state.runs[token.runId].integration.failure = error.message;
		});
		throw error;
	}
}

export function applyIntegration(context) {
	const { root, store, token } = context;
	const { run, target, evidence } = eligible(context);
	if (run.integration?.phase !== "prepared" || evidence.binding.head !== run.integration.candidate)
		throw new Error("run has no verified final integration candidate");
	if (target.head !== run.integration.targetBase)
		throw new Error("integration base advanced; rebuild and reverify the candidate");
	store.transaction((state) => {
		assertLease(state, token, Date.now());
		state.runs[token.runId].status = "integrating";
		state.runs[token.runId].integration.phase = "applying";
	});
	try {
		git(root, ["merge", "--ff-only", run.integration.candidate]);
		const current = snapshot(root);
		if (current.head !== evidence.binding.head || current.tree !== evidence.binding.tree)
			throw new Error("integration result differs from the verified candidate");
		store.transaction((state) => {
			const lease = assertLease(state, token, Date.now(), { allowExpired: true });
			state.runs[token.runId].status = "integrated";
			state.runs[token.runId].integration.phase = "applied";
			state.runs[token.runId].integration.evidence = evidence;
			lease.status = "released";
			lease.expiresAt = Date.now();
			state.audit.push({ event: "integrated", runId: token.runId, head: current.head, at: Date.now() });
		});
		return { runId: token.runId, status: "integrated", head: current.head, published: false };
	} catch (error) {
		store.transaction((state) => {
			state.runs[token.runId].status = "integration-failed";
			state.runs[token.runId].integration.failure = error.message;
		});
		throw error;
	}
}
