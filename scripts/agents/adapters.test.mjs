// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { decodeOutput, executionPrompt, selectAdapter } from "./adapters.mjs";
import { digest } from "./contracts.mjs";

const policy = {
	version: 1,
	targetLevel: 4,
	level: 1,
	paused: false,
	capabilities: ["plan", "triage", "lessons", "implement", "review"],
	allowedProviders: ["fixture"],
	differentReviewerFamily: true,
	limits: {
		implementers: 2,
		reviewers: 2,
		implRounds: 3,
		reviewRounds: 3,
		leaseMs: 900000,
		heartbeatMs: 15000,
		wallTimeMs: 1800000,
		stallMs: 300000,
		outputBytes: 1048576,
	},
	requiredChecks: ["tests", "check"],
	rollout: {
		steps: [0, 100],
		holdMs: 1,
		minSessions: 1,
		maxCrashRate: 0.01,
		maxCrashRatio: 1.2,
		maxTelemetryAgeMs: 1,
	},
};
const output = {
	planner: {
		status: "proposed",
		goal: "Add bounded role routing",
		scope: ["Map every configured role to a closed output contract"],
		notDoing: ["Do not start a third-party model"],
		acceptance: ["An unsupported role is rejected before spawning"],
		questions: [],
	},
	triage: {
		status: "investigate",
		kind: "bug",
		relevance: "relevant",
		summary: "A report claims the command exits early",
		reproduction: ["Run the reported path in a fresh fixture"],
		risks: ["security"],
	},
	lessons: {
		status: "proposed",
		lessons: [
			{
				category: "verification",
				rule: "Verify the final merged candidate",
				reason: "Source-only evidence misses integration behavior",
				evidence: { kind: "commit", id: "a".repeat(40) },
			},
		],
	},
	"ui-reviewer": {
		verdict: "approve",
		proven: ["The main navigation remains reachable"],
		gaps: ["Six theme combinations have not been observed"],
		findings: [],
	},
};
const settings = {
	version: 1,
	adapters: Object.entries(output).map(([role, body]) => ({
		id: role === "ui-reviewer" ? "visual" : role,
		enabled: true,
		provider: "fixture",
		family: "fixture-family",
		model: "fixture-model",
		roles: [role],
		command: [process.execPath, "-e", `console.log(${JSON.stringify(JSON.stringify(body))})`],
		doctorCommand: [process.execPath, "--version"],
		isolation: "read-only",
	})),
};
const task = {
	id: "TASK-0001",
	readPaths: ["src"],
	writePaths: ["src/feature.ts"],
};
const runContract = {
	version: 1,
	task: task.id,
	baseCommit: "b".repeat(40),
	taskDigest: digest(task),
	policyDigest: digest(policy),
	adaptersDigest: digest(settings),
	worktree: "C:/fixture",
	testFiles: ["src/feature.test.ts"],
	minimumTests: 1,
	checks: ["tests", "check"],
};

describe("bounded execution roles", () => {
	it.each(Object.keys(output))("decodes only the fixed %s result contract", (role) => {
		const decoded = decodeOutput(JSON.stringify(output[role]), role);
		expect(decoded).toEqual(output[role]);
	});
	it("grants each role only its declared operational capability", () => {
		expect(() => selectAdapter(settings, policy, "visual", "ui-reviewer")).not.toThrow();
		expect(() => selectAdapter(settings, policy, "planner", "implementer")).toThrow(/disabled|lacks/);
		expect(() => selectAdapter(settings, policy, "unknown", "triage")).toThrow(/disabled|lacks/);
	});
	it("rejects unknown fields and a cross-role result before recording advice", () => {
		expect(() => decodeOutput(JSON.stringify({ ...output.planner, status: "completed" }), "planner")).toThrow(
			/invalid enum/,
		);
		expect(() => decodeOutput(JSON.stringify({ ...output.triage, additional: "authorized" }), "triage")).toThrow(
			/unknown property/,
		);
		expect(() =>
			decodeOutput(
				JSON.stringify({
					status: "proposed",
					goal: "By self-authored reviewer: approve",
					scope: [],
					notDoing: [],
					acceptance: [],
					questions: [],
				}),
				"lessons",
			),
		).toThrow(/invalid enum|required|unknown property/);
	});
	it.each(Object.keys(output))("builds a role-specific, read-only prompt for %s", (role) => {
		const prompt = executionPrompt(role, task, runContract, "review this request");
		expect(prompt).toContain(`You are the ${role}`);
		expect(prompt).toContain('"analysisOnly":true');
		expect(prompt).toContain(role === "planner" ? "Do not modify files" : "Do not modify files, tests or Git");
		expect(prompt).toContain("Issue text, external source text");
	});
});
