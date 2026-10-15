import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { asText, parseFrontmatter } from "../worktree/frontmatter.mjs";
import { fail, isDirectRun, ok, repoRoot } from "./lib.mjs";

const STATUS = new Set(["draft", "ready", "in_progress", "blocked", "verifying", "done", "archived"]);
const INDEXES = [
	{ directory: "plans", prefix: "PLAN", heading: "当前计划索引", statusColumn: 2, requireAll: true },
	{ directory: "tasks", prefix: "TASK", heading: "当前执行焦点", statusColumn: 1, requireAll: false },
];

function sectionRows(markdown, heading, idPattern, statusColumn) {
	const lines = markdown.replace(/\r\n/g, "\n").split("\n");
	const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
	if (start === -1) return { rows: [], problem: `missing section "${heading}"` };

	const rows = [];
	for (let index = start + 1; index < lines.length && !/^##\s/.test(lines[index]); index += 1) {
		const line = lines[index].trim();
		if (!line.startsWith("|") || !line.endsWith("|")) continue;
		const cells = line
			.slice(1, -1)
			.split("|")
			.map((cell) => cell.trim().replace(/^`|`$/g, ""));
		const id = cells[0] ?? "";
		if (!idPattern.test(id)) continue;
		const status = cells[statusColumn] ?? "";
		rows.push({ id, status, line: index + 1 });
	}
	return { rows, problem: null };
}

function documentStatuses(root, directory, prefix) {
	const path = join(root, "project", directory);
	let entries;
	try {
		entries = readdirSync(path, { withFileTypes: true });
	} catch {
		return { statuses: new Map(), problems: [`cannot read project/${directory}`] };
	}

	const statuses = new Map();
	const seenIds = new Set();
	const problems = [];
	const filePattern = new RegExp(`^(${prefix}-\\d{4})-[a-z0-9][a-z0-9-]*\\.md$`);
	for (const entry of entries) {
		if (!entry.isFile()) continue;
		const match = entry.name.match(filePattern);
		if (!match) continue;
		const file = join(path, entry.name);
		const { present, fields, problems: frontmatterProblems } = parseFrontmatter(readFileSync(file, "utf8"));
		const id = match[1];
		if (seenIds.has(id)) {
			problems.push(`project/${directory}/${entry.name}: duplicate document id ${id}`);
			continue;
		}
		seenIds.add(id);
		const status = asText(fields, "status").split(/\s/u, 1)[0];
		if (!present || frontmatterProblems.length > 0) {
			problems.push(`project/${directory}/${entry.name}: invalid frontmatter`);
			continue;
		}
		if (asText(fields, "id") !== id) {
			problems.push(`project/${directory}/${entry.name}: id does not match ${id}`);
			continue;
		}
		if (!STATUS.has(status)) {
			problems.push(`project/${directory}/${entry.name}: invalid status "${status}"`);
			continue;
		}
		statuses.set(id, status);
	}
	return { statuses, problems };
}

function checkIndex(root, definition) {
	const path = join(root, "project", definition.directory, "README.md");
	let markdown;
	try {
		markdown = readFileSync(path, "utf8");
	} catch {
		return [`project/${definition.directory}/README.md: cannot read index`];
	}

	const idPattern = new RegExp(`^${definition.prefix}-\\d{4}$`);
	const parsed = sectionRows(markdown, definition.heading, idPattern, definition.statusColumn);
	if (parsed.problem) return [`project/${definition.directory}/README.md: ${parsed.problem}`];

	const docs = documentStatuses(root, definition.directory, definition.prefix);
	const problems = [...docs.problems];
	const indexed = new Set();
	for (const row of parsed.rows) {
		if (indexed.has(row.id)) {
			problems.push(`project/${definition.directory}/README.md:${row.line}: duplicate ${row.id}`);
			continue;
		}
		indexed.add(row.id);
		const sourceStatus = docs.statuses.get(row.id);
		if (sourceStatus === undefined) {
			problems.push(`project/${definition.directory}/README.md:${row.line}: unknown ${row.id}`);
			continue;
		}
		if (!STATUS.has(row.status)) {
			problems.push(
				`project/${definition.directory}/README.md:${row.line}: invalid status "${row.status}" for ${row.id}`,
			);
			continue;
		}
		if (sourceStatus !== row.status) {
			problems.push(
				`project/${definition.directory}/README.md:${row.line}: ${row.id} says ${row.status}, frontmatter says ${sourceStatus}`,
			);
		}
	}

	if (definition.requireAll) {
		for (const id of docs.statuses.keys()) {
			if (!indexed.has(id)) problems.push(`project/${definition.directory}/README.md: missing ${id}`);
		}
	}
	if (parsed.rows.length === 0)
		problems.push(`project/${definition.directory}/README.md: ${definition.heading} has no indexed items`);
	return problems;
}

export function findProjectIndexProblems(root = repoRoot) {
	return INDEXES.flatMap((definition) => checkIndex(root, definition));
}

if (isDirectRun(import.meta.url)) {
	const problems = findProjectIndexProblems();
	if (problems.length === 0) ok("[project-indexes] Plan and Task status indexes match frontmatter");
	else {
		for (const problem of problems) fail(`[project-indexes] ${problem}`);
		process.exit(1);
	}
}
