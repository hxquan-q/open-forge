// Copyright The Open Forge contributors.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkAgentGuide, ROOT_GUIDE_MAX_BYTES, RULE_DOCUMENTS } from "./check-agent-guide.mjs";

const roots = [];
function write(root, path, text) {
	const file = join(root, path);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, text);
}
function fixture() {
	const root = mkdtempSync(join(tmpdir(), "open-forge-guide-"));
	roots.push(root);
	write(root, "AGENTS.md", RULE_DOCUMENTS.map((path) => `[Rules](${path})`).join("\n"));
	for (const path of RULE_DOCUMENTS) write(root, path, "# Rules\n");
	write(root, "CLAUDE.md", "[Root](AGENTS.md) [Claude](docs/dev/agent-rules/claude.md)\n");
	write(root, "docs/dev/agent-rules/claude.md", "# Claude\n");
	return root;
}
afterEach(() => {
	for (const root of roots.splice(0)) {
		if (!root.startsWith(join(tmpdir(), "open-forge-guide-"))) throw new Error("Unexpected test root");
		rmSync(root, { recursive: true, force: true });
	}
});
describe("root agent guide contract", () => {
	it("keeps the real root small with reachable rule extensions", () => expect(checkAgentGuide()).toEqual([]));
	it("accepts a small root and linked extensions", () => expect(checkAgentGuide(fixture())).toEqual([]));
	it("counts UTF-8 bytes rather than characters", () => {
		const root = fixture();
		write(root, "AGENTS.md", "界".repeat(Math.ceil(ROOT_GUIDE_MAX_BYTES / 3)));
		expect(checkAgentGuide(root)).toEqual(expect.arrayContaining([expect.stringContaining("exceeds")]));
	});
	it("detects a dropped discovery pointer", () => {
		const root = fixture();
		write(root, "AGENTS.md", "# Rules");
		expect(checkAgentGuide(root)).toEqual(expect.arrayContaining([expect.stringContaining("Missing root pointer")]));
	});
	it("detects broken links inside a moved rule document", () => {
		const root = fixture();
		write(root, RULE_DOCUMENTS[0], "[Missing](missing.md)");
		expect(checkAgentGuide(root)).toEqual(expect.arrayContaining([expect.stringContaining("Broken link")]));
	});
	it("reports a missing root without creating it", () => {
		const root = fixture();
		const unused = join(root, "missing");
		expect(checkAgentGuide(unused)).toEqual(["Missing AGENTS.md"]);
		expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toContain("Rules");
	});

	it("rejects an oversized Claude entry", () => {
		const root = fixture();
		write(root, "CLAUDE.md", "界".repeat(1400));
		expect(checkAgentGuide(root)).toEqual(expect.arrayContaining([expect.stringContaining("Claude guide exceeds")]));
	});
	it("requires the Claude entry to discover root rules and its own supplement", () => {
		const root = fixture();
		write(root, "CLAUDE.md", "# Claude\n");
		expect(checkAgentGuide(root)).toEqual(
			expect.arrayContaining([expect.stringContaining("Missing Claude pointer")]),
		);
	});
});
