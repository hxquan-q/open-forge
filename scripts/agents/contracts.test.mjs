// Copyright The Open Forge contributors.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validatePolicy } from "./contracts.mjs";

const checkedIn = () =>
	JSON.parse(readFileSync(fileURLToPath(new URL("../../project/autonomy-policy.json", import.meta.url)), "utf8"));
const withIntegration = (integration) => ({ ...checkedIn(), integration });

describe("policy declares its integration target", () => {
	it("accepts the checked-in local main and origin/dev candidate", () => {
		expect(validatePolicy(checkedIn()).integration).toEqual({ branch: "main", candidateRef: "origin/dev" });
		expect(() =>
			validatePolicy(withIntegration({ branch: "release/1.2_x", candidateRef: "fork-1.mirror/feature/a.b" })),
		).not.toThrow();
	});
	it("requires the integration object and both fields", () => {
		const { integration: _, ...missing } = checkedIn();
		expect(() => validatePolicy(missing)).toThrow(/integration: required/);
		expect(() => validatePolicy(withIntegration("main"))).toThrow(/integration/);
		expect(() => validatePolicy(withIntegration({ branch: "main" }))).toThrow(/candidateRef: required/);
		expect(() => validatePolicy(withIntegration({ candidateRef: "origin/dev" }))).toThrow(/branch: required/);
		expect(() =>
			validatePolicy(withIntegration({ branch: "main", candidateRef: "origin/dev", remote: "origin" })),
		).toThrow(/integration/);
	});
	it("accepts names at the length limits", () => {
		expect(() =>
			validatePolicy(withIntegration({ branch: "a".repeat(100), candidateRef: `${"o".repeat(64)}/dev` })),
		).not.toThrow();
	});
	it.each([
		"",
		"-main",
		"/main",
		"main/",
		"a..b",
		"main.lock",
		"has space",
		"a~b",
		"a".repeat(101),
		"a//b",
		"a/.b",
		"main.",
		"a.lock/b",
		"HEAD",
	])("rejects the invalid branch %j", (branch) => {
		expect(() => validatePolicy(withIntegration({ branch, candidateRef: "origin/dev" }))).toThrow(/integration/);
	});
	it.each([
		"dev",
		"origin/",
		"/dev",
		"-origin/dev",
		"ori gin/dev",
		`${"o".repeat(65)}/dev`,
		"origin/a..b",
		"origin/dev.lock",
		"origin/dev/",
		"origin/a//b",
		"origin/main.",
		"origin/feature/.private",
		"origin/feature/x.lock/topic",
		"origin/HEAD",
	])("rejects the invalid candidateRef %j", (candidateRef) => {
		expect(() => validatePolicy(withIntegration({ branch: "main", candidateRef }))).toThrow(/integration/);
	});
	it("reports which field is invalid", () => {
		expect(() => validatePolicy(withIntegration({ branch: "a..b", candidateRef: "origin/dev" }))).toThrow(
			"integration branch is not a valid branch name",
		);
		expect(() => validatePolicy(withIntegration({ branch: "main", candidateRef: "dev" }))).toThrow(
			"integration candidateRef must be <remote>/<branch>",
		);
	});
});
