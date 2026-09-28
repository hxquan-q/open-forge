// Copyright The Open Forge contributors.

/**
 * Minimal reader for the YAML subset used by `project/**` frontmatter.
 *
 * Task tooling and quality guards must stay dependency-free (see `scripts/quality/lib.mjs`),
 * so this deliberately does not re-implement YAML. It reads exactly the shapes the
 * repository's management files use: top-level `key: value` scalars, inline `[a, b]`
 * arrays, and block lists of `- item` lines. Nested mappings are skipped rather than
 * mis-parsed — a contract that needs one must extend this module instead of guessing.
 *
 * Values are returned raw (quotes stripped, nothing else interpreted) because several
 * Task fields carry prose after the machine-readable token, e.g.
 * `integration_status: integrated（forge/dev 主工作区；随 f9a79d399 落地）`.
 * Callers that need the token must use `firstToken` rather than parsing here.
 */

const INLINE_LIST = /^\[(.*)\]$/s;
const KEY_VALUE = /^([A-Za-z_][\w-]*):\s*(.*)$/;

function unquote(value) {
	const trimmed = value.trim();
	if (trimmed.length >= 2) {
		const first = trimmed[0];
		const last = trimmed[trimmed.length - 1];
		if ((first === '"' && last === '"') || (first === "'" && last === "'")) return trimmed.slice(1, -1);
	}
	return trimmed;
}

function splitInlineList(body) {
	return body
		.split(",")
		.map((item) => unquote(item))
		.filter((item) => item.length > 0);
}

/** The raw frontmatter block body, or null when absent or unterminated. */
export function extractFrontmatterBlock(text) {
	const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	if (!normalized.startsWith("---")) return null;
	const end = normalized.indexOf("\n---", 3);
	if (end === -1) return null;
	return normalized.slice(4, end);
}

/**
 * `{ present, fields, problems }` — `fields` maps a key to a string, or to a string[]
 * for inline and block lists. An empty value parses to `""`, never `undefined`, so
 * "declared but empty" stays distinguishable from "absent".
 */
export function parseFrontmatter(text) {
	const block = extractFrontmatterBlock(text);
	if (block === null) {
		return { present: false, fields: {}, problems: ["missing or unterminated --- frontmatter block"] };
	}

	const fields = {};
	const problems = [];
	const lines = block.split("\n");

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		if (line.trim() === "" || line.startsWith("#")) continue;
		if (/^\s/.test(line)) continue; // indented content belongs to the key above it

		const match = line.match(KEY_VALUE);
		if (!match) {
			problems.push(`line ${index + 2}: not a \`key: value\` entry — ${JSON.stringify(line.slice(0, 60))}`);
			continue;
		}

		const [, key, rawValue] = match;
		const value = rawValue.trim();

		if (value === "") {
			const items = [];
			let cursor = index + 1;
			while (cursor < lines.length) {
				const next = lines[cursor];
				if (next.trim() === "") {
					cursor += 1;
					continue;
				}
				if (!/^\s/.test(next)) break;
				const item = next.trim().match(/^-\s*(.*)$/);
				if (item) items.push(unquote(item[1]));
				cursor += 1;
			}
			if (items.length > 0) {
				fields[key] = items;
				index = cursor - 1;
				continue;
			}
			fields[key] = "";
			continue;
		}

		const inline = value.match(INLINE_LIST);
		fields[key] = inline ? splitInlineList(inline[1]) : unquote(value);
	}

	return { present: true, fields, problems };
}

/** Read a field as a list: a list stays as-is, a scalar becomes a one-item list, empty is []. */
export function asList(fields, key) {
	const value = fields[key];
	if (Array.isArray(value)) return value;
	if (typeof value === "string" && value.trim() !== "") return [value.trim()];
	return [];
}

/** Read a scalar field, tolerating a list by joining it. */
export function asText(fields, key) {
	const value = fields[key];
	if (Array.isArray(value)) return value.join(", ");
	return typeof value === "string" ? value.trim() : "";
}

/**
 * The machine-readable head of a field whose value may carry prose afterwards.
 * `"parallel（code review 修复批…）"` → `"parallel"`.
 */
export function firstToken(value) {
	const trimmed = (value ?? "").trim();
	if (trimmed === "") return "";
	const match = trimmed.match(/^[^\s（(]+/);
	return match ? match[0] : "";
}
