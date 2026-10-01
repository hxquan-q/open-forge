// Copyright The Open Forge contributors.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkGlossary, glossaryTerms } from "./check-glossary.mjs";

const roots = [];
function write(root, path, text) {
	const file = join(root, path);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, text);
}
function fixture() {
	const root = mkdtempSync(join(tmpdir(), "open-forge-glossary-"));
	roots.push(root);
	write(root, "CONTEXT.md", "# Context\n## Glossary\n### Alpha\n[分册](docs/glossary/alpha.md)\n");
	write(root, "docs/glossary/alpha.md", "# Domain\n### Alpha\nAn observable result.\n");
	return root;
}
afterEach(() => {
	for (const root of roots.splice(0)) {
		if (!root.startsWith(join(tmpdir(), "open-forge-glossary-"))) throw new Error("Unexpected fixture root");
		rmSync(root, { recursive: true, force: true });
	}
});
describe("glossary lookup contract", () => {
	it("keeps the real glossary indexed without loading definitions at root", () => expect(checkGlossary()).toEqual([]));
	it("resolves a root heading into its chapter definition", () => {
		const root = fixture();
		expect(checkGlossary(root)).toEqual([]);
		const term = glossaryTerms(readFileSync(join(root, "CONTEXT.md"), "utf8"))[0];
		const chapter = readFileSync(join(root, "docs/glossary/alpha.md"), "utf8");
		expect(
			glossaryTerms(chapter)
				.find((entry) => entry.title === term.title)
				?.body.trim(),
		).toBe("An observable result.");
	});
	it("detects an unindexed new definition", () => {
		const root = fixture();
		write(root, "docs/glossary/beta.md", "### Beta\nSecond definition.\n");
		expect(checkGlossary(root)).toContain("Unindexed term: Beta");
	});
	it("detects duplicate definitions", () => {
		const root = fixture();
		write(root, "docs/glossary/beta.md", "### Alpha\nA conflicting definition.\n");
		expect(checkGlossary(root)).toContain("Duplicate definition: Alpha");
	});
	it("detects a valid file but wrong chapter", () => {
		const root = fixture();
		write(root, "docs/glossary/beta.md", "# Empty\n");
		write(root, "CONTEXT.md", "### Alpha\n[分册](docs/glossary/beta.md)\n");
		expect(checkGlossary(root)).toContain("Wrong chapter for term: Alpha");
	});
	it("detects duplicate index headings", () => {
		const root = fixture();
		const path = join(root, "CONTEXT.md");
		writeFileSync(path, `${readFileSync(path, "utf8")}### Alpha\n[分册](docs/glossary/alpha.md)\n`);
		expect(checkGlossary(root)).toContain("Duplicate index term: Alpha");
	});
	it("keeps definitions out of the root index", () => {
		const root = fixture();
		write(root, "CONTEXT.md", "### Alpha\n[分册](docs/glossary/alpha.md)\nCopied definition.\n");
		expect(checkGlossary(root)).toContain("Definition text belongs in chapter, not index: Alpha");
	});
	it("counts UTF-8 bytes for the root budget", () => {
		const root = fixture();
		write(root, "CONTEXT.md", "界".repeat(4200));
		expect(checkGlossary(root)).toEqual(expect.arrayContaining([expect.stringContaining("exceeds")]));
	});
	it("detects broken chapter references", () => {
		const root = fixture();
		write(root, "docs/glossary/alpha.md", "### Alpha\n[Evidence](missing.md)\n");
		expect(checkGlossary(root)).toEqual(expect.arrayContaining([expect.stringContaining("Broken link")]));
	});
	it("rejects a glossary directory redirected outside the workspace", () => {
		const root = mkdtempSync(join(tmpdir(), "open-forge-glossary-"));
		roots.push(root);
		write(root, "CONTEXT.md", "### Alpha\n[分册](docs/glossary/alpha.md)\n");
		const outside = fixture();
		symlinkSync(join(outside, "docs"), join(root, "docs"), "junction");
		expect(checkGlossary(root)).toContain("Glossary outside workspace");
	});
});
