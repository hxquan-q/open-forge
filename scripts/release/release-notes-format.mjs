// Copyright The Open Forge contributors.
/**
 * 本地发布说明 `.github/release-notes/v<version>.md` 的内容格式校验。
 *
 * 与上游 `## English` / `## 中文` + `###` 子节的格式不同，Open Forge 每份说明
 * 只有一种语言的四段式结构：
 *   # Open Forge <版本>
 *   发布日期：待定 | 发布日期：YYYY-MM-DD
 *   Upstream baseline: upstream/dev@<sha>
 *   ## 新增 / 改进 / 修复 / 其他   （一行 `- ` 一条）
 *
 * 本模块补齐 `release-notes.mjs --check` 结构校验（标题、日期、baseline、
 * 碎片汇编一致性）没覆盖的内容层：
 *   - 允许小节之外的 `##` 标题            → problem
 *   - 不属于任何小节的 `- ` 条目           → problem
 *   - 占位记号（TODO / 待补 / （占位）…）   → problem
 *   - 空小节                              → problem
 *   - 面向最终用户不可读的内部引用、工程黑话、超长条目 → warning
 *
 * warning 不判负，只在 `--check` 输出；升级为 problem 是存量清理之后的决定
 * （PLAN-0032 P1 第 3 项评估结论：上游 6 条/90 字硬顶套到本地存量会全灭）。
 */

export const SECTION_LABELS = ["新增", "改进", "修复", "其他"];

/**
 * 软上限：上游为 6 条 / 90 字；本地存量单节有 300+ 条、单条 2700 字，
 * 套硬顶会让全部既有说明判负。先用 warning 让偏差可见，清理后再收紧。
 */
export const SOFT_LIMITS = {
	itemsPerSection: 25,
	itemLength: 300,
};

/**
 * 「还没写完」的占位记号：判 problem。
 * 只认括号/方括号里的"占位"——单独的"占位符"是合法措辞
 * （例如描述「悬停提示显示 `%…%` 原始占位符」的修复条目，v0.1.1 存量）。
 */
const PLACEHOLDER = /\b(?:TODO|TBD|FIXME)\b|待补|待填|[（(【\[]\s*占位|占位\s*[）)】\]]/u;

/**
 * 最终用户读不懂的内部标识：判 warning。
 * 每条是 [正则, 说明]，match 文本会带进提示消息。
 */
const INTERNAL_REFERENCES = [
	[/`[^`\n]*\.(?:ts|tsx|js|jsx|mjs|cjs|json|lock|yml|yaml|sh|go|swift|kt)`/iu, "文件名"],
	[/(?:^|[\s`(（])(?:apps|packages|scripts|src)\/[\w.@/-]+/u, "仓库路径"],
	[/(?<![\w&/])#\d+/u, "issue/PR 编号"],
];

/** 工程视角黑话：条目写给开发者看而非用户。 */
const INTERNAL_TERMS = [
	"重构",
	"单测",
	"守卫",
	"类型检查",
	"回归测试",
	"refactor",
	"unit test",
	"typecheck",
	"monorepo",
];

/**
 * 把说明拆成：标题、元信息行（发布日期 / Upstream baseline）、`## <小节>`
 * 及其 `- ` 条目。越位标题/条目单独返回供诊断。
 */
export function parseReleaseNoteItems(text) {
	const parsed = {
		title: null,
		strayHeadings: [], // 允许清单之外的 ##
		strayBullets: [], // 不在任何 ## 之下的 -
		sections: [], // { label, line, items: [{ text, line }] }
	};
	let section = null;
	let line = 0;
	for (const raw of String(text ?? "")
		.replace(/\r\n/g, "\n")
		.split("\n")) {
		line += 1;
		const trimmed = raw.trimEnd();
		if (!trimmed.trim()) continue;

		const h1 = /^# (.+)$/.exec(trimmed);
		if (h1) {
			parsed.title = h1[1].trim();
			continue;
		}
		if (/^发布日期：/.test(trimmed) || /^Upstream baseline:/.test(trimmed)) continue;

		const h2 = /^## (.+)$/.exec(trimmed);
		if (h2) {
			const label = h2[1].trim();
			if (SECTION_LABELS.includes(label)) {
				section = { label, line, items: [] };
				parsed.sections.push(section);
			} else {
				parsed.strayHeadings.push({ heading: label, line });
				section = null;
			}
			continue;
		}

		const bullet = /^[-*] (.+)$/.exec(trimmed);
		if (bullet) {
			if (!section) {
				parsed.strayBullets.push({ text: bullet[1].trim(), line });
			} else {
				section.items.push({ text: bullet[1].trim(), line });
			}
			continue;
		}
	}
	return parsed;
}

/**
 * 校验一份 Open Forge 发布说明。
 * @returns {{ problems: string[], warnings: string[] }}
 *   problems 判负 --check；warnings 只记录不判负（见 SOFT_LIMITS 说明）。
 */
export function validateReleaseNoteContent(text, { file = "release notes" } = {}) {
	const parsed = parseReleaseNoteItems(text);
	const problems = [];
	const warnings = [];

	for (const stray of parsed.strayHeadings) {
		problems.push(
			`${file}:${stray.line}: 不允许的小节 "## ${stray.heading}"；只能使用 ${SECTION_LABELS.join(" / ")}`,
		);
	}
	for (const stray of parsed.strayBullets) {
		problems.push(`${file}:${stray.line}: 条目不在任何 "##" 小节之下："${stray.text.slice(0, 60)}…"`);
	}

	for (const section of parsed.sections) {
		if (section.items.length === 0) {
			problems.push(`${file}:${section.line}: 小节 "## ${section.label}" 为空；删除该小节或补上条目`);
		}
		if (section.items.length > SOFT_LIMITS.itemsPerSection) {
			warnings.push(
				`${file}:${section.line}: 小节 "## ${section.label}" 有 ${section.items.length} 条` +
					`（建议 ≤ ${SOFT_LIMITS.itemsPerSection}）；按主题归并`,
			);
		}
		for (const item of section.items) {
			if (PLACEHOLDER.test(item.text)) {
				problems.push(
					`${file}:${item.line}: 条目含占位记号（"${item.text.slice(0, 60)}…"）；` +
						"写成最终文案或删除该条",
				);
			}
			const length = [...item.text].length;
			if (length > SOFT_LIMITS.itemLength) {
				warnings.push(
					`${file}:${item.line}: 条目 ${length} 字（建议 ≤ ${SOFT_LIMITS.itemLength}）；` +
						"一条只写一项用户可见的变化",
				);
			}
			for (const [pattern, why] of INTERNAL_REFERENCES) {
				const match = pattern.exec(item.text);
				if (match) {
					warnings.push(`${file}:${item.line}: ${why} "${match[0]}" 对最终用户不可读`);
				}
			}
			const term = INTERNAL_TERMS.find((word) => item.text.includes(word));
			if (term) {
				warnings.push(
					`${file}:${item.line}: 内部术语 "${term}"；请写对用户的实际影响，而不是工程任务名`,
				);
			}
		}
	}
	return { problems, warnings };
}
