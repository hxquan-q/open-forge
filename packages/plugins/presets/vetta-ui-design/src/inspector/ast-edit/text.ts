// Copyright The Open Forge contributors.
// Text-edit semantics adapted from Onlook packages/parser (Apache-2.0),
// https://github.com/onlook-dev/onlook — updateNodeTextContent behavior.
// Modified by The Open Forge contributors: rewritten as magic-string span edits
// that preserve the original formatting; multi-line text rebuilds only the
// children span instead of regenerating the whole tree.

/**
 * 文本内容的确定性编辑（TASK-0316）。
 *
 * 单行文本只替换 JSXText 的内容区间（首尾空白原样保留，缩进与邻居零扰动）；
 * 多行文本按 Onlook 语义拆成 text + `<br/>`——这需要重建子节点区间，区间内部的
 * 缩进会被压平（多行文本本来就在一个区间里，无缩进可保）。
 */
import type MagicString from "magic-string";
import type { AstNode } from "./guards";
import { childrenOfElement, closingOfElement, isJsxText, openingOfElement, rawOfJsxText } from "./guards";

export type TextEditResult = { ok: true; changed: boolean } | { ok: false; reason: "no-target" };

/** JSX 文本里的裸字符转义：`{` `}` 开表达式、`<` 开标签，全部换成实体。 */
function escapeJsxText(text: string): string {
	return text.replaceAll("{", "&#123;").replaceAll("}", "&#125;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** 多行文本 → `part<br />part` 结构（Onlook 语义：text 节点 + br 交替）。 */
function multiLineJoined(newText: string): string {
	const parts = newText.split("\n");
	const pieces: string[] = [];
	for (const [index, part] of parts.entries()) {
		if (index > 0) pieces.push("<br />");
		if (part.length > 0) pieces.push(escapeJsxText(part));
	}
	return pieces.join("");
}

/** 把一次文本编辑写进 magic-string。 */
export function applyTextEdit(ms: MagicString, element: AstNode, newText: string): TextEditResult {
	const opening = openingOfElement(element);
	if (opening === null) return { ok: false, reason: "no-target" };
	const children = childrenOfElement(element);
	const firstText = children.find(isJsxText) ?? null;

	if (!newText.includes("\n")) {
		if (firstText === null) {
			// 没有文本子节点：在开标签后插入（元素至少是配对标签或带子节点）。
			ms.appendRight(opening.end ?? 0, escapeJsxText(newText));
			return { ok: true, changed: true };
		}
		const raw = rawOfJsxText(firstText);
		const leading = raw.length - raw.trimStart().length;
		const trailing = raw.length - raw.trimEnd().length;
		const start = firstText.start ?? 0;
		const end = firstText.end ?? 0;
		if (raw.trim().length === 0) {
			// 纯空白文本节点：保留空白，把内容挂在开标签后。
			ms.appendRight(opening.end ?? 0, escapeJsxText(newText));
			return { ok: true, changed: true };
		}
		const contentStart = start + leading;
		const contentEnd = end - trailing;
		const escaped = escapeJsxText(newText);
		if (raw.trim() === newText && raw.slice(leading, raw.length - trailing) === newText) {
			return { ok: true, changed: false };
		}
		ms.overwrite(contentStart, contentEnd, escaped);
		return { ok: true, changed: true };
	}

	// 多行：重建子节点区间为 text + <br/> 交替（Onlook 会清空原有子节点，同语义）。
	const joined = multiLineJoined(newText);
	const closing = closingOfElement(element);
	if (children.length > 0 && closing !== null) {
		const first = children[0];
		const last = children[children.length - 1];
		ms.overwrite(first.start ?? 0, last.end ?? 0, joined);
		return { ok: true, changed: true };
	}
	if (children.length === 0 && closing !== null) {
		ms.appendRight(opening.end ?? 0, joined);
		return { ok: true, changed: true };
	}
	// 自闭合（无 closingElement）：`<Tag />` → `<Tag>joined</Tag>`。
	const tag = (() => {
		const name = opening.name;
		if (typeof name === "object" && name !== null) {
			const value = (name as { name?: unknown }).name;
			if (typeof value === "string") return value;
		}
		return null;
	})();
	if (tag === null) return { ok: false, reason: "no-target" };
	const selfCloseEnd = opening.end ?? 0;
	// `/>` 前可能留着空格（`<Badge />`）：连空格一起吃掉，展开成 `<Badge>…</Badge>`。
	let slashAt = selfCloseEnd - 2;
	const rawSource = ms.original;
	while (slashAt > (opening.start ?? 0) && rawSource.charAt(slashAt - 1) === " ") slashAt -= 1;
	ms.overwrite(slashAt, selfCloseEnd, `>${joined}</${tag}>`);
	return { ok: true, changed: true };
}
