/**
 * Validate rule waivers in project/decisions/waivers/ (TASK-0111).
 *
 * Every WAIVER-*.md must carry complete frontmatter (rule, owner, reason,
 * risk, compensation, created, expires, status). An `active` waiver whose
 * `expires` is in the past fails the gate — expiry forces review; it never
 * auto-revokes and never auto-renews.
 *
 * Usage:
 *   bun run scripts/quality/check-waivers.mjs [--today YYYY-MM-DD]
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fail, isDirectRun, ok, repoRoot } from "./lib.mjs";

const WAIVERS_DIR = "project/decisions/waivers";
const REQUIRED_FIELDS = ["id", "rule", "status", "owner", "reason", "risk", "compensation", "created", "expires"];
const VALID_STATUSES = new Set(["active", "resolved", "revoked"]);
const ID_PATTERN = /^WAIVER-\d{4}$/;

function parseFrontmatter(text) {
	const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) return null;
	const fields = {};
	for (const line of match[1].split(/\r?\n/)) {
		const pair = line.match(/^([A-Za-z_]+):\s*(.*)$/);
		if (pair) fields[pair[1]] = pair[2].trim().replace(/^["'](.*)["']$/, "$1");
	}
	return fields;
}

function isIsoDate(value) {
	return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

export function findWaiverProblems(root, today = new Date().toISOString().slice(0, 10)) {
	const problems = [];
	const dir = join(root, WAIVERS_DIR);
	if (!existsSync(dir)) return problems;
	const seenIds = new Set();
	for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
		if (!entry.isFile() || !entry.name.endsWith(".md") || entry.name === "README.md") continue;
		const label = `${WAIVERS_DIR}/${entry.name}`;
		const fields = parseFrontmatter(readFileSync(join(dir, entry.name), "utf8"));
		if (!fields) {
			problems.push(`${label}: missing YAML frontmatter`);
			continue;
		}
		for (const field of REQUIRED_FIELDS) {
			if (typeof fields[field] !== "string" || fields[field] === "") {
				problems.push(`${label}: missing required field ${field}`);
			}
		}
		if (fields.id) {
			if (!ID_PATTERN.test(fields.id)) problems.push(`${label}: id ${fields.id} must match WAIVER-NNNN`);
			if (seenIds.has(fields.id)) problems.push(`${label}: duplicate waiver id ${fields.id}`);
			seenIds.add(fields.id);
		}
		if (!entry.name.startsWith(`${fields.id}-`)) {
			problems.push(`${label}: file name must start with its id (${fields.id}-<slug>.md)`);
		}
		if (fields.status && !VALID_STATUSES.has(fields.status)) {
			problems.push(`${label}: status ${fields.status} must be one of ${[...VALID_STATUSES].join("/")}`);
		}
		if (fields.created && !isIsoDate(fields.created)) {
			problems.push(`${label}: created ${fields.created} must be YYYY-MM-DD`);
		}
		if (fields.expires && !isIsoDate(fields.expires)) {
			problems.push(`${label}: expires ${fields.expires} must be YYYY-MM-DD`);
		}
		if (fields.status === "active" && isIsoDate(fields.expires) && fields.expires < today) {
			problems.push(
				`${label}: waiver expired on ${fields.expires} — resolve, revoke, or re-register with fresh review`,
			);
		}
	}
	return problems;
}

export function main(args = process.argv.slice(2), root = repoRoot) {
	let today;
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--today") {
			today = args[++i];
		} else {
			console.error(`unknown argument: ${args[i]}`);
			return 1;
		}
	}
	const problems = findWaiverProblems(root, today);
	if (problems.length > 0) {
		fail(`[waivers] ${problems.length} problem(s)\n${problems.map((p) => `  - ${p}`).join("\n")}`);
		return 1;
	}
	ok("[waivers] all waivers valid and unexpired");
	return 0;
}

if (isDirectRun(import.meta.url)) {
	process.exit(main());
}
