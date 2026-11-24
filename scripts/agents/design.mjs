// Copyright The Open Forge contributors.
import ts from "typescript";

export const isUIPath = (path) =>
	/^(?:apps\/desktop\/src\/renderer|packages\/(?:ui|theme-ui)\/src)\/.*\.(?:tsx|css)$/u.test(path) &&
	!/\.(?:test|spec|node-test)\.(?:ts|tsx|mts|mjs|cts|cjs)$/u.test(path);
const RULES = [
	[
		"D01",
		/(?:\b(?:bg|text|border|ring|fill|stroke)-(?:slate|zinc|sky|violet|pink|orange|red|blue|green)-\d|#[\da-f]{3,8}\b|\brgba?\()/iu,
		// 任意值里的 rgb()/rgba() 是合法写法（shadow-[...rgb()...]、ring-[color-mix(...)] 等，
		// 上游与本地 SegmentedControl 均有先例）；只对未包在 [] 里的裸调用计 D01。
		(value) => /\[[^\]]*\brgba?\(/u.test(value),
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

/**
 * Checks only added occurrences. This source audit never claims visual or behavioral acceptance.
 *
 * `exemptions`（可选）逐文件逐规则豁免移植进来的原语 token：`{ "<path>": { "<rule>": <count> } }`。
 * 移植的上游原语（ButtonGroup、VettaKbd）沿用上游视觉语言，与本地 DESIGN 规则结构性冲突；
 * 不改写上游设计（会偏离移植目标），改为在 `scripts/quality/baselines/design-exceptions.json`
 * 登记并在 DESIGN.md「已知例外」说明。与 assertion-depth 棘轮不同，这里是**平账**不是只许降：
 * 改写组件回归本地设计时应删除条目，新增 token 仍按超出豁免计数判负。
 */
export function auditDesign(changes, exemptions = {}) {
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
		const exempted = { ...(exemptions[path] ?? {}) };
		for (const entry of current.entries) {
			const key = `${entry.tag}:${entry.value}`;
			if ((counts.get(key) ?? 0) > 0) {
				counts.set(key, counts.get(key) - 1);
				continue;
			}
			const add = (rule) => {
				if ((exempted[rule] ?? 0) > 0) {
					exempted[rule] -= 1;
					return;
				}
				findings.push({ rule, file: path, line: entry.line, value: entry.value });
			};
			if (entry.tag) {
				if (["button", "motion.button"].includes(entry.value)) add("D03");
				continue;
			}
			for (const [rule, expression, exempt] of RULES)
				if (expression.test(entry.value) && !exempt?.(entry.value)) add(rule);
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
