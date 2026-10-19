// Copyright The Open Forge contributors.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findTaskProblems, loadTasks, normalizeContractPath } from "../worktree/contract.mjs";
import { contract, digest, validateAdapters, validatePolicy } from "./contracts.mjs";
import { snapshot } from "./git.mjs";

export function configuration(root) {
	return {
		policy: validatePolicy(JSON.parse(readFileSync(join(root, "project/autonomy-policy.json"), "utf8"))),
		settings: validateAdapters(JSON.parse(readFileSync(join(root, "project/agents.json"), "utf8"))),
	};
}

export function taskById(root, id) {
	const loaded = loadTasks(root);
	if (loaded.problems.length) throw new Error(loaded.problems.join("; "));
	const task = loaded.tasks.find((entry) => entry.id === id);
	if (!task) throw new Error(`Task not found: ${id}`);
	const findings = findTaskProblems(task, { strict: true, knownIds: new Set(loaded.tasks.map((entry) => entry.id)) });
	if (findings.length) throw new Error(`invalid Task: ${findings.map((finding) => finding.message).join("; ")}`);
	return task;
}

export function makeRunContract(task, { policy, settings }, worktree, tests, minimumTests = 1) {
	for (const path of tests) {
		const normalized = normalizeContractPath(path);
		if (normalized.problem || /[*?[\]]/u.test(path))
			throw new Error("test selection requires explicit repository-relative files");
	}
	return contract("run-contract", {
		version: 1,
		task: task.id,
		baseCommit: snapshot(worktree).head,
		taskDigest: digest(task),
		policyDigest: digest(policy),
		adaptersDigest: digest(settings),
		worktree,
		testFiles: tests,
		minimumTests,
		checks: policy.requiredChecks,
	});
}
