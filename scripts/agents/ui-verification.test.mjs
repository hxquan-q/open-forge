// Copyright The Open Forge contributors.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { digest } from "./contracts.mjs";
import { assertUiReport, assertVisualReview, imageDigest, runUiVerification, uiPlan } from "./ui-verification.mjs";

const roots = [];
it("keeps the Desktop verification entry syntactically valid without starting it", () => {
	expect(() =>
		execFileSync(
			process.execPath,
			["--check", fileURLToPath(new URL("../../apps/desktop/scripts/ui-verification.mjs", import.meta.url))],
			{ windowsHide: true },
		),
	).not.toThrow();
});
const plan = {
	version: 1,
	steps: [
		{ action: "visible", selector: "#root" },
		{ action: "click", selector: "button[data-test=menu]" },
	],
};
function fixture() {
	const directory = mkdtempSync(join(tmpdir(), "forge-ui-acceptance-"));
	roots.push(directory);
	const checks = ["mono", "sand", "default"].flatMap((theme) =>
		["light", "dark"].map((mode) => {
			const path = join(directory, `${theme}-${mode}.png`);
			const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
			writeFileSync(path, bytes);
			return { theme, mode, assertions: 4, screenshot: { path, sha256: imageDigest(bytes) } };
		}),
	);
	return {
		directory,
		report: {
			version: 1,
			profile: "fresh",
			binding: "a".repeat(64),
			planDigest: digest(plan),
			passed: true,
			cleanupKnown: true,
			checks,
			errors: [],
		},
	};
}
afterEach(() => {
	for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true });
});
it("accepts bounded operations but refuses executable code and incomplete steps", () => {
	expect(uiPlan(plan)).toEqual(plan);
	expect(() => uiPlan({ version: 1, steps: [{ action: "eval", selector: "#root", code: "anything" }] })).toThrow();
	expect(() => uiPlan({ version: 1, steps: [{ action: "fill", selector: "input" }] })).toThrow(/value/);
});
it("requires real assertions, six distinct theme/mode reports, matching artifacts and confirmed cleanup", () => {
	const { directory, report } = fixture();
	const options = { plan, binding: "a".repeat(64), artifactRoot: directory };
	expect(() => assertUiReport(report, options)).not.toThrow();
	expect(() => assertUiReport({ ...report, checks: report.checks.slice(1) }, options)).toThrow();
	expect(() => assertUiReport({ ...report, cleanupKnown: false }, options)).toThrow(/cleanup/);
	writeFileSync(report.checks[0].screenshot.path, "tampered");
	expect(() => assertUiReport(report, options)).toThrow(/artifact/);
});
it("always stops an owned host after a failed user action and preserves cleanup uncertainty", async () => {
	const { directory } = fixture();
	const actions = [];
	const driver = {
		preflight: async () => {},
		start: async () => actions.push("start"),
		accept: async () => {
			actions.push("accept");
			throw Error("button absent");
		},
		stop: async () => {
			actions.push("stop");
			return false;
		},
	};
	const result = await runUiVerification({
		authorized: true,
		plan,
		binding: "a".repeat(64),
		reportPath: join(directory, "report.json"),
		driver,
	});
	expect(actions).toEqual(["start", "accept", "stop"]);
	expect(result).toMatchObject({ passed: false, cleanupKnown: false, errors: ["button absent"] });
});
it("refuses execution without explicit UI authorization before touching the host", async () => {
	await expect(runUiVerification({ plan, driver: {} })).rejects.toThrow(/authorization/);
});
it("requires an independent visual identity bound to the current candidate and exact images", () => {
	const { report } = fixture();
	const binding = { head: "a".repeat(40), tree: "b".repeat(40) };
	const analysis = {
		role: "ui-reviewer",
		identity: { actorId: "reader", family: "different" },
		binding,
		output: {
			body: {
				verdict: "approve",
				gaps: [],
				findings: [],
				artifactDigest: digest(report.checks),
				coverage: report.checks.map((c) => `${c.theme}/${c.mode}`),
			},
		},
	};
	const run = { authors: [{ actorId: "writer", family: "author" }], analyses: [analysis] };
	expect(() => assertVisualReview(run, report, binding)).not.toThrow();
	analysis.identity.family = "author";
	expect(() => assertVisualReview(run, report, binding)).toThrow(/independent/);
	analysis.identity.family = "different";
	analysis.output.body.artifactDigest = "c".repeat(64);
	expect(() => assertVisualReview(run, report, binding)).toThrow(/exact artifacts/);
});
