// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { classifyChanges } from "./policy.mjs";

describe("human gates apply to the actual cumulative change", () => {
	it("allows an ordinary scoped fix and additive regression tests", () => {
		const result = classifyChanges([
			{ path: "packages/ai/src/retry.ts", before: "const retries = 1;", after: "const retries = 2;" },
			{ path: "packages/ai/test/retry.test.ts", before: "", after: "expect(retry()).toBe(2);" },
		]);
		expect(result.gates).toEqual([]);
		expect(result.unknown).toEqual([]);
	});
	it.each([
		["security", "apps/desktop/src/main/ipc/permissions.ts", "deny()", "allow()"],
		["data", "packages/runtime-storage/src/migrate.ts", "v1", "v2"],
		["license-brand", "LICENSE", "license", "different"],
		["billing", "apps/desktop/src/pricing.ts", "const price=1", "const price=2"],
		["release-signing-update", "scripts/release/publish.mjs", "old()", "newer()"],
		["tests-and-guards", "project/autonomy-policy.json", "{}", '{"level":4}'],
		["major-version", "apps/desktop/package.json", '{"version":"0.1.3"}', '{"version":"0.2.0"}'],
	])("raises %s for protected behavior", (gate, path, before, after) => {
		expect(classifyChanges([{ path, before, after }]).gates).toContain(gate);
	});
	it("does not let assertion counts or a renamed file hide a weakened test or new outbound call", () => {
		const result = classifyChanges([
			{
				path: "packages/ai/test/retry.test.ts",
				before: "expect(secret()).toBe(false);",
				after: "expect(true).toBe(true); expect(true).toBe(true);",
			},
			{ path: "packages/ai/src/innocent.ts", before: "", after: "fetch('https://new.example.invalid')" },
		]);
		expect(result.gates).toContain("tests-and-guards");
		expect(result.gates).toContain("security");
	});
	it("keeps unfamiliar formats and unreadable manifests unknown", () => {
		expect(classifyChanges([{ path: "payload.bin", before: "", after: "bytes" }]).unknown).toContain("payload.bin");
		expect(classifyChanges([{ path: "apps/desktop/package.json", before: "{", after: "{}" }]).unknown).toContain(
			"apps/desktop/package.json",
		);
	});
});
