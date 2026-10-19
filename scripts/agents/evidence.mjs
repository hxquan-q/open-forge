// Copyright The Open Forge contributors.
import { contract, digest, validatePolicy } from "./contracts.mjs";
import { readChanges, snapshot } from "./git.mjs";
import { classifyChanges } from "./policy.mjs";

export function testReport(report, { minimum = 1, files = [] } = {}) {
	if (!report || report.success !== true || !Array.isArray(report.testResults) || report.testResults.length === 0)
		throw new Error("missing successful test report");
	const totals = { passed: 0, failed: 0, skipped: 0, total: 0 };
	for (const file of report.testResults) {
		if (typeof file.name !== "string" || file.status !== "passed" || !Array.isArray(file.assertionResults))
			throw new Error("test file did not pass");
		for (const assertion of file.assertionResults) {
			if (assertion.status === "passed") totals.passed++;
			else if (assertion.status === "failed") totals.failed++;
			else if (["pending", "todo", "skipped", "disabled"].includes(assertion.status)) totals.skipped++;
			else throw new Error("unknown assertion status");
			totals.total++;
		}
	}
	if (totals.passed < minimum || totals.failed > 0)
		throw new Error("test report has no sufficient passing behavior checks");
	if (
		report.numTotalTests !== totals.total ||
		report.numPassedTests !== totals.passed ||
		report.numFailedTests !== totals.failed
	)
		throw new Error("test report counts do not match assertions");
	for (const selected of files) {
		if (
			!report.testResults.some(
				(file) => file.name.replaceAll("\\", "/").endsWith(`/${selected}`) || file.name === selected,
			)
		)
			throw new Error(`selected test did not run: ${selected}`);
	}
	return { ...totals, reportDigest: digest(report), files: report.testResults.map((file) => file.name) };
}

export function assertCheckResults(checks, required, binding) {
	if (!Array.isArray(checks)) throw new Error("missing checks");
	if (new Set(checks.map((check) => check.id)).size !== checks.length) throw new Error("duplicate check evidence");
	for (const id of required) {
		const check = checks.find((entry) => entry.id === id);
		if (!check) throw new Error(`missing required check: ${id}`);
		if (check.status !== "passed" || check.exitCode !== 0) throw new Error(`required check not passed: ${id}`);
		if (digest(check.binding) !== digest(binding)) throw new Error(`stale check evidence: ${id}`);
		if (id === "tests" && (!check.tests || check.tests.passed < 1 || check.tests.failed !== 0))
			throw new Error("missing actual passing test assertions");
	}
	return true;
}

function knownIdentity(identity) {
	return (
		identity &&
		["actorId", "family", "model"].every(
			(key) =>
				typeof identity[key] === "string" &&
				identity[key].length > 0 &&
				!["unknown", "unconfigured"].includes(identity[key]),
		)
	);
}

export function assertIndependentReview(review, authors, binding, differentFamily = true) {
	if (
		!Array.isArray(authors) ||
		authors.length === 0 ||
		!authors.every(knownIdentity) ||
		!knownIdentity(review?.reviewer)
	)
		throw new Error("unknown author or reviewer identity");
	if (
		authors.some(
			(author) =>
				author.actorId === review.reviewer.actorId || (differentFamily && author.family === review.reviewer.family),
		)
	)
		throw new Error("reviewer is not independent");
	if (digest(review.binding) !== digest(binding)) throw new Error("stale review evidence");
	if (
		review.verdict !== "approve" ||
		!Array.isArray(review.findings) ||
		review.findings.some((finding) => ["blocker", "high"].includes(finding.severity))
	)
		throw new Error("review has unresolved findings");
	return true;
}

export function exportEvidence(store, runId, policy) {
	validatePolicy(policy);
	const run = store.read().runs[runId];
	if (!run || run.status !== "verified") throw new Error("run has no verified evidence");
	if (digest(policy) !== run.contract.policyDigest) throw new Error("stale evidence policy");
	const code = snapshot(run.contract.worktree);
	const binding = {
		head: code.head,
		tree: code.tree,
		policy: run.contract.policyDigest,
		contract: digest(run.contract),
	};
	assertCheckResults(run.checks, policy.requiredChecks, binding);
	assertIndependentReview(run.review, run.authors, binding, policy.differentReviewerFamily);
	return contract("evidence", {
		version: 1,
		runId,
		task: run.task,
		binding,
		authors: run.authors,
		checks: run.checks,
		review: run.review,
		gates: classifyChanges(readChanges(run.contract.worktree, run.contract.baseCommit)),
		notRun: [],
	});
}
