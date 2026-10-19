// Copyright The Open Forge contributors.
import ts from "typescript";

export const isUIPath = (path) =>
	/^(?:apps\/desktop\/src\/renderer|packages\/(?:ui|theme-ui)\/src)\/.*\.(?:tsx|css)$/u.test(path);
const RULES = [
	[
		"D01",
		/(?:\b(?:bg|text|border|ring|fill|stroke)-(?:slate|zinc|sky|violet|pink|orange|red|blue|green)-\d|#[\da-f]{3,8}\b|\brgba?\()/iu,
	],
	["D02", /shadow-\[/u],
	["D04", /(?:^|:)(?:border-(?:2|4)|outline-2|border-\[\d+px\])(?:$|\s)/u],
	["D05", /rounded-(?:3xl|\[\d+px\])/u],
	["D06", /(?:^|:)transition-all$/u],
	["D11", /::-webkit-scrollbar|scrollbar-(?:width|color)\s*:/u],
];

function tokens(path, body) {
	if (path.endsWith(".css"))
		return {
			entries: body.split("\n").map((value, index) => ({ value, line: index + 1, tag: false })),
			unknown: false,
		};
	const file = ts.createSourceFile(path, body, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
	const entries = [];
	const visit = (node) => {
		if (ts.isStringLiteralLike(node)) {
			for (const value of node.text.split(/\s+/u).filter(Boolean))
				entries.push({ value, line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1, tag: false });
		}
		if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
			entries.push({
				value: node.tagName.getText(file),
				line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
				tag: true,
			});
		ts.forEachChild(node, visit);
	};
	visit(file);
	return { entries, unknown: file.parseDiagnostics.length > 0 };
}

/** Checks only added occurrences. This source audit never claims visual or behavioral acceptance. */
export function auditDesign(changes) {
	const findings = [];
	const affected = [];
	const gaps = new Set();
	for (const { path, before, after } of changes.filter((change) => isUIPath(change.path))) {
		affected.push(path);
		if (typeof before !== "string" || typeof after !== "string") {
			gaps.add(`${path}: unreadable source`);
			continue;
		}
		const previous = tokens(path, before);
		const current = tokens(path, after);
		if (previous.unknown || current.unknown) gaps.add(`${path}: source parse failed`);
		const counts = new Map();
		for (const entry of previous.entries) {
			const key = `${entry.tag}:${entry.value}`;
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
		for (const entry of current.entries) {
			const key = `${entry.tag}:${entry.value}`;
			if ((counts.get(key) ?? 0) > 0) {
				counts.set(key, counts.get(key) - 1);
				continue;
			}
			const add = (rule) => findings.push({ rule, file: path, line: entry.line, value: entry.value });
			if (entry.tag) {
				if (["button", "motion.button"].includes(entry.value)) add("D03");
				continue;
			}
			for (const [rule, expression] of RULES) if (expression.test(entry.value)) add(rule);
			const font = /(?:^|:)text-\[(\d+)px\]$/u.exec(entry.value);
			if (font && !([10, 11, 12, 13, 14, 15].includes(Number(font[1])) || Number(font[1]) >= 20)) add("D07");
			if (/(?:^|:)text-(?:base|lg)$/u.test(entry.value))
				gaps.add(`${path}: D07 input/typography exception needs semantic verification`);
			if (/animation.*infinite/u.test(entry.value)) add("D09");
		}
		for (const rule of ["D08", "D10"]) gaps.add(`${path}: ${rule} requires runtime/layout evidence`);
		gaps.add(
			`${path}: dynamic styles, interaction, i18n and six theme/mode combinations require runtime/visual evidence`,
		);
	}
	return {
		lint: findings.length ? "failed" : "passed",
		accepted: affected.length === 0,
		affected,
		findings,
		gaps: [...gaps],
		rulesSource: "apps/desktop/DESIGN.md",
	};
}
