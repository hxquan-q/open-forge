// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { assertCheckResults, assertIndependentReview, testReport } from "./evidence.mjs";

const report = {
	success: true,
	numTotalTests: 2,
	numPassedTests: 2,
	numFailedTests: 0,
	numPendingTests: 0,
	testResults: [
		{
			name: "/repo/feature.test.mjs",
			status: "passed",
			assertionResults: [{ status: "passed" }, { status: "passed" }],
		},
	],
};
describe("verification evidence rather than self-reported success", () => {
	it("requires real passing assertions and checks selected files", () => {
		expect(testReport(report, { minimum: 2, files: ["feature.test.mjs"] }).passed).toBe(2);
		expect(() => testReport({ ...report, numTotalTests: 0, numPassedTests: 0, testResults: [] })).toThrow();
		expect(() => testReport(report, { files: ["missing.test.mjs"] })).toThrow(/selected/);
		expect(() => testReport({ ...report, numPassedTests: 3 })).toThrow(/counts/);
	});
	it("does not accept a compile failure or a skipped file as regression evidence", () => {
		for (const status of ["failed", "skipped"])
			expect(() => testReport({ ...report, testResults: [{ ...report.testResults[0], status }] })).toThrow();
	});
	it("rejects absent, failed, and stale required checks", () => {
		const binding = { head: "a", tree: "b", policy: "c", contract: "d" };
		const checks = ["tests", "check"].map((id) => ({
			id,
			status: "passed",
			exitCode: 0,
			binding,
			tests: id === "tests" ? { passed: 2, failed: 0 } : null,
		}));
		expect(assertCheckResults(checks, ["tests", "check"], binding)).toBe(true);
		expect(() => assertCheckResults(checks.slice(1), ["tests", "check"], binding)).toThrow(/missing/);
		expect(() => assertCheckResults(checks, ["tests", "check"], { ...binding, tree: "changed" })).toThrow(/stale/);
		expect(() =>
			assertCheckResults([{ ...checks[0], status: "not-run" }, checks[1]], ["tests", "check"], binding),
		).toThrow();
	});
	it("requires known identities, an independent session, and the reviewed code binding", () => {
		const author = { actorId: "author-one", family: "openai", model: "pinned" };
		const review = {
			reviewer: { actorId: "reviewer-one", family: "anthropic", model: "pinned" },
			verdict: "approve",
			binding: { head: "a" },
			findings: [],
		};
		expect(assertIndependentReview(review, [author], { head: "a" }, true)).toBe(true);
		expect(() => assertIndependentReview({ ...review, reviewer: author }, [author], { head: "a" }, true)).toThrow(
			/independent/,
		);
		expect(() => assertIndependentReview(review, [{ ...author, family: "unknown" }], { head: "a" }, true)).toThrow(
			/unknown/,
		);
		expect(() => assertIndependentReview(review, [author], { head: "b" }, true)).toThrow(/stale/);
	});
});
