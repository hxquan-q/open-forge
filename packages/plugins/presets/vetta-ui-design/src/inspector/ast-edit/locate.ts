// Copyright The Open Forge contributors.

/**
 * 目标元素定位（TASK-0316）：locator 行列命中 → 指纹重定位兜底。
 *
 * 行列来自编译期插桩（`data-vetd-source="file:line:col"`，TASK-0315 的 tagger，
 * 行列均为 1-based）。编辑会让行号漂移，所以每次成功定位后调用方应取走新的
 * {@link ElementFingerprint} 持久化，下一轮编辑先试行列、漂了再按指纹打分重定位——
 * 指纹 = 标签名 + 祖先标签链 + 子树文本摘要，打分并列时宁可拒绝（ambiguous）也不猜。
 */
import type { AstNode } from "./guards";
import { childrenOfElement, isJsxElement, isJsxText, isNode, jsxTagName, openingOfElement, rawOfJsxText } from "./guards";

export interface ElementLocator {
	/** 1-based 行。 */
	line: number;
	/** 1-based 列（babel 的 0-based 列 + 1，与 tagger 注入的值一致）。 */
	column: number;
}

export interface ElementFingerprint {
	tag: string;
	/** 祖先标签链，`ancestors[0]` 是最近的父元素标签。 */
	ancestors: string[];
	/** 子树 JSXText 规范化后的摘要（空白折叠、截断 80 字符）。 */
	textDigest: string;
}

export type LocateResult =
	| { ok: true; element: AstNode; opening: AstNode; tag: string; fingerprint: ElementFingerprint }
	| { ok: false; reason: "locator-miss" | "ambiguous"; candidates: number };

interface Candidate {
	element: AstNode;
	opening: AstNode;
	tag: string;
	line: number;
	column: number;
	ancestors: string[];
	textDigest: string;
}

const DIGEST_LIMIT = 80;

function digestOf(element: AstNode): string {
	const parts: string[] = [];
	const walk = (node: AstNode): void => {
		if (isJsxText(node)) {
			parts.push(rawOfJsxText(node));
			return;
		}
		if (isJsxElement(node)) {
			for (const child of childrenOfElement(node)) walk(child);
		}
	};
	for (const child of childrenOfElement(element)) walk(child);
	return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, DIGEST_LIMIT);
}

function collectCandidates(ast: object): Candidate[] {
	const candidates: Candidate[] = [];
	const elementStack: string[] = [];
	const visit = (value: unknown): void => {
		if (!isNode(value)) return;
		if (isJsxElement(value)) {
			const opening = openingOfElement(value);
			const tag = opening ? jsxTagName(opening.name) : null;
			const loc = opening?.loc?.start ?? null;
			if (opening && tag !== null && loc) {
				candidates.push({
					element: value,
					opening,
					tag,
					line: loc.line,
					column: loc.column + 1,
					ancestors: [...elementStack],
					textDigest: digestOf(value),
				});
			}
			if (tag !== null) elementStack.push(tag);
			for (const key of Object.keys(value)) {
				if (key === "loc" || key === "start" || key === "end") continue;
				const child = (value as Record<string, unknown>)[key];
				if (Array.isArray(child)) {
					for (const item of child) visit(item);
				} else {
					visit(child);
				}
			}
			if (tag !== null) elementStack.pop();
			return;
		}
		for (const key of Object.keys(value)) {
			if (key === "loc" || key === "start" || key === "end") continue;
			const child = (value as Record<string, unknown>)[key];
			if (Array.isArray(child)) {
				for (const item of child) visit(item);
			} else {
				visit(child);
			}
		}
	};
	visit(ast);
	return candidates;
}

function score(candidate: Candidate, fingerprint: ElementFingerprint): number {
	let score = 0;
	if (candidate.tag === fingerprint.tag) score += 3;
	if (fingerprint.textDigest.length > 0) {
		if (candidate.textDigest === fingerprint.textDigest) score += 4;
		else if (
			fingerprint.textDigest.length >= 6 &&
			candidate.textDigest.startsWith(fingerprint.textDigest.slice(0, Math.min(20, fingerprint.textDigest.length)))
		) {
			score += 2;
		}
	}
	if (fingerprint.ancestors.length > 0) {
		if (candidate.ancestors.join("/") === fingerprint.ancestors.join("/")) score += 2;
		else if (candidate.ancestors[0] === fingerprint.ancestors[0]) score += 1;
	}
	return score;
}

/** 指纹可信命中线：标签 + （文本摘要或完整祖先链）才算数，单项匹配不给过。 */
const FINGERPRINT_THRESHOLD = 5;

/**
 * 定位目标元素：先按行列精确命中；失败且有指纹时按打分重定位。
 *
 * `candidates` 是失败信息里的候选计数：`locator-miss` 为 0 个过线，`ambiguous`
 * 为最高分并列的个数——都不做猜测性编辑。
 */
export function locateElement(
	ast: object,
	locator: ElementLocator,
	fingerprint: ElementFingerprint | null,
): LocateResult {
	const candidates = collectCandidates(ast);
	const exact = candidates.find((c) => c.line === locator.line && c.column === locator.column);
	if (exact) {
		return {
			ok: true,
			element: exact.element,
			opening: exact.opening,
			tag: exact.tag,
			fingerprint: { tag: exact.tag, ancestors: exact.ancestors, textDigest: exact.textDigest },
		};
	}
	if (!fingerprint) return { ok: false, reason: "locator-miss", candidates: 0 };
	let best: Candidate[] = [];
	let bestScore = 0;
	for (const candidate of candidates) {
		const value = score(candidate, fingerprint);
		if (value < FINGERPRINT_THRESHOLD) continue;
		if (value > bestScore) {
			best = [candidate];
			bestScore = value;
		} else if (value === bestScore) {
			best.push(candidate);
		}
	}
	if (best.length === 1) {
		const hit = best[0];
		return {
			ok: true,
			element: hit.element,
			opening: hit.opening,
			tag: hit.tag,
			fingerprint: { tag: hit.tag, ancestors: hit.ancestors, textDigest: hit.textDigest },
		};
	}
	if (best.length > 1) return { ok: false, reason: "ambiguous", candidates: best.length };
	return { ok: false, reason: "locator-miss", candidates: 0 };
}
