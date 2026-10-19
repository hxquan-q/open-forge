// Copyright The Open Forge contributors.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { requireCapability, validateAdapters, validatePolicy } from "../agents/contracts.mjs";
import { autonomyProblems } from "./check-autonomy.mjs";
import { collectBiomeTargets } from "./check-lint.mjs";

describe("autonomy tools participate in existing repository checks", () => {
	it("includes implementation and boundary contracts in the real lint entrypoint", () => {
		const targets = collectBiomeTargets();
		for (const target of ["scripts/agents", "schemas/agents", "project/autonomy-policy.json", "project/agents.json"])
			expect(targets).toContain(target);
		const biome = JSON.parse(readFileSync(join(process.cwd(), "biome.json"), "utf8"));
		expect(biome.files.includes).toContain("scripts/agents/**/*.mjs");
		expect(biome.files.includes).toContain("schemas/agents/**/*.json");
	});
	it("runs autonomy tests from the existing quality suite and exposes the public CLI", () => {
		const manifest = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
		expect(manifest.scripts["test:quality"]).toContain(" scripts/agents");
		expect(manifest.scripts["test:agents"]).toContain("scripts/quality/run-vitest.mjs");
		for (const command of [
			"doctor",
			"queue",
			"prepare",
			"cycle",
			"approval",
			"integration-preview",
			"integrate",
			"plan",
			"claim",
			"run",
			"verify",
			"evidence",
			"status",
			"pause",
			"resume",
			"release",
		])
			expect(manifest.scripts[`agent:${command}`]).toBe(`node scripts/agents/cli.mjs ${command}`);
	});
	it("runs the contract and incremental DESIGN gate in the always-on checks", () => {
		expect(autonomyProblems(process.cwd())).toEqual([]);
		expect(readFileSync("scripts/quality/check-guards.mjs", "utf8")).toContain(
			'["scripts/quality/check-autonomy.mjs"]',
		);
	});
	it("does not infer execution or publication capabilities from a valid configuration", () => {
		const policy = validatePolicy(JSON.parse(readFileSync("project/autonomy-policy.json", "utf8")));
		validateAdapters(JSON.parse(readFileSync("project/agents.json", "utf8")));
		expect(() => requireCapability({ ...policy, level: 0, capabilities: ["implement"] }, "implement")).toThrow(
			/paused/,
		);
		expect(() => requireCapability({ ...policy, capabilities: [] }, "publish-stable")).toThrow();
	});
});
