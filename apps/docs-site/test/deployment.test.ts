// Modified by The Open Forge contributors.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(appRoot, "../..");

function activeIgnoreRules(contents: string): string[] {
	return contents
		.split(/\r?\n/u)
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.startsWith("#"));
}

describe("Vercel deployment contract", () => {
	it("keeps the public documentation content in the upload", () => {
		const rules = activeIgnoreRules(readFileSync(resolve(repoRoot, ".vercelignore"), "utf8"));

		expect(rules).toContain("/docs");
		expect(rules).not.toContain("docs");
	});

	it("does not require Git history after .git has been excluded", () => {
		const config = JSON.parse(readFileSync(resolve(appRoot, "vercel.json"), "utf8")) as {
			ignoreCommand?: string;
		};

		expect(config.ignoreCommand).toBeUndefined();
	});
});

describe("documentation CI contract", () => {
	it("checks the built HTTP user flows after building and fails on errors", () => {
		const workflow = readFileSync(resolve(repoRoot, ".github/workflows/docs-site.yml"), "utf8");
		const commands = [...workflow.matchAll(/^\s+run:\s+(.+)$/gmu)].map((match) => match[1]?.trim());
		const build = commands.indexOf("bun run build:docs");
		const production = commands.indexOf("bun run --cwd apps/docs-site test:production");

		expect(build).toBeGreaterThanOrEqual(0);
		expect(production).toBeGreaterThan(build);
		expect(workflow).not.toMatch(/continue-on-error:\s*true/u);
	});
});
