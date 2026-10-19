// Copyright The Open Forge contributors.
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { auditDesign, isUIPath } from "../agents/design.mjs";
import { git } from "../agents/git.mjs";
import { configuration } from "../agents/tasks.mjs";
import { isInside } from "../worktree/contract.mjs";

export function autonomyProblems(root) {
	const problems = [];
	try {
		configuration(root);
	} catch (error) {
		problems.push(error.message);
	}
	for (const path of ["CLAUDE.md", "GEMINI.md", ".cursor/rules/00-agents.mdc"]) {
		const text = readFileSync(join(root, path), "utf8");
		if (Buffer.byteLength(text) > 4096 || !text.includes("AGENTS.md"))
			problems.push(`invalid rule entrypoint: ${path}`);
	}
	const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
	if (!agents.includes("docs/dev/agent-rules/autonomy.md")) problems.push("missing autonomy route");
	const design = readFileSync(join(root, "apps/desktop/DESIGN.md"), "utf8");
	for (let index = 1; index <= 11; index++)
		if (!design.includes(`**D${String(index).padStart(2, "0")}**`)) problems.push(`missing DESIGN rule D${index}`);
	return problems;
}

export function designChanges(root, base) {
	const paths = new Set(
		[
			...git(root, ["diff", "--name-only", "-z", "--no-renames", base]).split("\0"),
			...git(root, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0"),
		].filter(isUIPath),
	);
	return [...paths].map((path) => {
		const absolute = resolve(root, path);
		let after = "";
		if (existsSync(absolute)) {
			if (lstatSync(absolute).isSymbolicLink() || !isInside(realpathSync(root), realpathSync(absolute)))
				after = null;
			else after = readFileSync(absolute, "utf8");
		}
		let before = "";
		try {
			before = git(root, ["show", "--no-textconv", `${base}:${path}`], { trim: false });
		} catch {
			/* Added file. */
		}
		return { path, before, after };
	});
}

function baseline(root) {
	if (process.env.GITHUB_EVENT_PATH) {
		const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
		const sha = event.pull_request?.base?.sha ?? event.before;
		if (typeof sha === "string" && /^[a-f0-9]{40,64}$/u.test(sha) && !/^0+$/u.test(sha)) {
			git(root, ["rev-parse", "--verify", `${sha}^{commit}`]);
			return sha;
		}
	}
	return git(root, ["merge-base", "HEAD", "origin/dev"]);
}

export function main(root = process.cwd()) {
	const problems = autonomyProblems(root);
	const audit = auditDesign(designChanges(root, baseline(root)));
	for (const finding of audit.findings)
		problems.push(`${finding.file}:${finding.line} DESIGN ${finding.rule}: ${finding.value}`);
	for (const gap of audit.gaps.filter((entry) => /unreadable|parse failed/u.test(entry))) problems.push(gap);
	if (problems.length) throw new Error(problems.join("\n"));
	console.log(
		`[autonomy] contracts, entrypoints, DESIGN source checks passed (${audit.affected.length} UI file(s)); runtime/visual acceptance is separate`,
	);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		main();
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
