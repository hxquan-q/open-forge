import { describe, expect, it } from "vitest";
import { collectPrTitleScopes, validatePrTitle } from "./check-pr-title.mjs";

const SCOPES = collectPrTitleScopes();

function valid(title) {
	return validatePrTitle(title, SCOPES);
}

describe("pr title gate", () => {
	it("accepts conventional titles with workspace scopes", () => {
		expect(valid("feat(desktop): add canvas batch save")).toEqual([]);
		expect(valid("fix(runtime-node): handle lease expiry race")).toEqual([]);
		expect(valid("docs(project): record TASK-0114 contract")).toEqual([]);
		expect(valid("feat(plugin-sdk): expose official api surface")).toEqual([]);
	});

	it("accepts multi-scope titles when every scope is known", () => {
		expect(valid("feat(desktop,theme-ui): restyle settings page")).toEqual([]);
	});

	it("rejects missing or malformed shape", () => {
		expect(valid("add canvas batch save").join()).toContain("<type>(<scope>): <description>");
		expect(valid("feat: add canvas batch save").join()).toContain("<type>(<scope>): <description>");
		expect(valid("feat(desktop) add canvas batch save").join()).toContain("<type>(<scope>): <description>");
		expect(valid("feat(desktop): ").join()).toContain("<type>(<scope>): <description>");
	});

	it("rejects unknown types and scopes", () => {
		expect(valid("wip(desktop): in progress").join()).toContain('type "wip" is not allowed');
		expect(valid("feat(backend): add api").join()).toContain(
			'scope "backend" is not a workspace package or known domain',
		);
	});

	it("rejects boundary look-alikes and bad scope case", () => {
		expect(valid("feat(runtime): x")).toEqual([]); // generic runtime domain is sanctioned
		expect(valid("feat(runtime-mcp2): x").join()).toContain(
			'scope "runtime-mcp2" is not a workspace package or known domain',
		);
		expect(valid("feat(runtime-nod): x").join()).toContain(
			'scope "runtime-nod" is not a workspace package or known domain',
		);
		expect(valid("feat(Desktop): x").join()).toContain("lowercase kebab-case");
		expect(valid("feat( desktop): x").join()).toContain("<type>(<scope>): <description>");
	});

	it("covers the package scopes contributors actually use", () => {
		for (const scope of [
			"desktop",
			"cli-host",
			"coding-agent",
			"runtime-core",
			"plugins",
			"quality",
			"project",
			"docs-site",
			"remote-relay",
		]) {
			expect(SCOPES.has(scope), `missing scope ${scope}`).toBe(true);
		}
	});
});
