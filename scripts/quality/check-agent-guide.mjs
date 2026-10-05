// Copyright The Open Forge contributors.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isDirectRun, repoRoot } from "./lib.mjs";
import { brokenFileLinks, relativeMarkdownLinks } from "./workflow-skill-links.mjs";

export const ROOT_GUIDE_MAX_BYTES = 8192;
export const RULE_DOCUMENTS = ["repository", "engineering", "testing", "delivery", "collaboration", "governance"].map(
	(name) => `docs/dev/agent-rules/${name}.md`,
);

export const CLAUDE_GUIDE_MAX_BYTES = 4096;
const CLAUDE_SUPPLEMENT = "docs/dev/agent-rules/claude.md";
function checkClaudeGuide(root) {
	const file = join(root, "CLAUDE.md");
	if (!existsSync(file)) return ["Missing CLAUDE.md"];
	const bytes = readFileSync(file);
	const text = bytes.toString("utf8");
	const links = relativeMarkdownLinks(text);
	const problems = brokenFileLinks(file, text);
	if (bytes.length > CLAUDE_GUIDE_MAX_BYTES)
		problems.push(`Claude guide exceeds ${CLAUDE_GUIDE_MAX_BYTES} bytes: ${bytes.length}`);
	for (const path of ["AGENTS.md", CLAUDE_SUPPLEMENT]) {
		if (!links.includes(path)) problems.push(`Missing Claude pointer: ${path}`);
	}
	const supplement = join(root, CLAUDE_SUPPLEMENT);
	if (!existsSync(supplement)) problems.push(`Missing Claude supplement: ${CLAUDE_SUPPLEMENT}`);
	else problems.push(...brokenFileLinks(supplement, readFileSync(supplement, "utf8")));
	return problems;
}

export function checkAgentGuide(root = repoRoot) {
	const file = join(root, "AGENTS.md");
	if (!existsSync(file)) return ["Missing AGENTS.md"];
	const bytes = readFileSync(file);
	const text = bytes.toString("utf8");
	const problems = checkClaudeGuide(root);
	if (bytes.length > ROOT_GUIDE_MAX_BYTES)
		problems.push(`Root guide exceeds ${ROOT_GUIDE_MAX_BYTES} bytes: ${bytes.length}`);
	problems.push(...brokenFileLinks(file, text));
	for (const path of RULE_DOCUMENTS) {
		const target = join(root, path);
		if (!text.includes(`](${path})`)) problems.push(`Missing root pointer: ${path}`);
		if (!existsSync(target)) problems.push(`Missing rule document: ${path}`);
		else problems.push(...brokenFileLinks(target, readFileSync(target, "utf8")));
	}
	return problems;
}

if (isDirectRun(import.meta.url)) {
	const problems = checkAgentGuide();
	for (const problem of problems) console.error(`[agent-guide] ${problem}`);
	if (problems.length) process.exitCode = 1;
	else
		console.log(
			`[agent-guide] root <= ${ROOT_GUIDE_MAX_BYTES}, Claude <= ${CLAUDE_GUIDE_MAX_BYTES} bytes; pointers and file links passed`,
		);
}
