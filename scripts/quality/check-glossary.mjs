// Copyright The Open Forge contributors.
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { isDirectRun, repoRoot } from "./lib.mjs";
import { brokenFileLinks, relativeMarkdownLinks } from "./workflow-skill-links.mjs";

export const CONTEXT_MAX_BYTES = 12 * 1024;
export function glossaryTerms(text) {
	const headings = [...text.matchAll(/^### (.+)$/gm)];
	return headings.map((match, index) => ({
		title: match[1].trim(),
		body: text.slice(match.index + match[0].length, headings[index + 1]?.index ?? text.length),
	}));
}
export function checkGlossary(root = repoRoot) {
	const indexPath = join(root, "CONTEXT.md");
	if (!existsSync(indexPath)) return ["Missing CONTEXT.md"];
	const bytes = readFileSync(indexPath);
	const index = bytes.toString("utf8");
	const problems = brokenFileLinks(indexPath, index);
	if (bytes.length > CONTEXT_MAX_BYTES)
		problems.push(`Context index exceeds ${CONTEXT_MAX_BYTES} bytes: ${bytes.length}`);
	const directory = join(root, "docs/glossary");
	if (!existsSync(directory)) return [...problems, "Missing docs/glossary"];
	const resolved = relative(realpathSync(root), realpathSync(directory));
	if (isAbsolute(resolved) || resolved === ".." || resolved.startsWith(`..${sep}`))
		return [...problems, "Glossary outside workspace"];
	const definitions = new Map();
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (!entry.name.endsWith(".md")) continue;
		if (!entry.isFile()) {
			problems.push(`Glossary chapter must be a regular file: ${entry.name}`);
			continue;
		}
		const path = `docs/glossary/${entry.name}`;
		const text = readFileSync(join(root, path), "utf8");
		problems.push(...brokenFileLinks(join(root, path), text));
		for (const term of glossaryTerms(text)) {
			if (definitions.has(term.title)) problems.push(`Duplicate definition: ${term.title}`);
			else definitions.set(term.title, path);
		}
	}
	const seen = new Set();
	for (const term of glossaryTerms(index)) {
		if (seen.has(term.title)) problems.push(`Duplicate index term: ${term.title}`);
		seen.add(term.title);
		const links = relativeMarkdownLinks(term.body).filter((link) => link.startsWith("docs/glossary/"));
		if (links.length !== 1 || definitions.get(term.title) !== links[0])
			problems.push(`Wrong chapter for term: ${term.title}`);
		const prose = term.body
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line && !line.startsWith("## "));
		if (prose.length !== 1 || !/^\[分册\]\(docs\/glossary\/[^)]+\.md\)$/.test(prose[0]))
			problems.push(`Definition text belongs in chapter, not index: ${term.title}`);
	}
	for (const title of definitions.keys()) if (!seen.has(title)) problems.push(`Unindexed term: ${title}`);
	if (!definitions.size) problems.push("Glossary has no definitions");
	return problems;
}
if (isDirectRun(import.meta.url)) {
	const problems = checkGlossary();
	for (const problem of problems) console.error(`[glossary] ${problem}`);
	if (problems.length) process.exitCode = 1;
	else
		console.log(
			`[glossary] index <= ${CONTEXT_MAX_BYTES} bytes; unique terms, chapter routing and file links passed`,
		);
}
