// Copyright The Open Forge contributors.
// Class-edit semantics adapted from Onlook packages/parser (Apache-2.0),
// https://github.com/onlook-dev/onlook — addClass/replaceNodeClasses behavior.
// Modified by The Open Forge contributors: rewritten as magic-string span edits
// that preserve the original formatting (Onlook mutates AST nodes and regenerates).

/**
 * Tailwind class 的确定性编辑（TASK-0316）。
 *
 * Onlook 语义：add 走冲突合并（`p-2` + `p-4` → `p-4`）、replace 整串替换；本仓
 * 实现把结果写回原区间——除目标属性外文件字节零扰动。动态 className（表达式容器、
 * 模板串、无值）一律只读拒绝，交给 agent 路径（PLAN-0018 F3 的边界）。
 */
import type MagicString from "magic-string";
import { twMerge } from "tailwind-merge";
import type { AstNode } from "./guards";
import { findClassName, jsxTagName } from "./guards";

export interface ClassOps {
	/** 追加的 class，冲突由 tailwind-merge 合并。 */
	add?: readonly string[];
	/** 精确移除的 class token（整 token 匹配，不做前缀/通配）。 */
	remove?: readonly string[];
	/** 整串替换（优先于 add/remove 应用）。 */
	replace?: string;
}

export type ClassEditResult = { ok: true; changed: boolean } | { ok: false; reason: "dynamic-class" };

function sameTokenSet(a: string, b: string): boolean {
	const left = new Set(a.split(/\s+/).filter((token) => token.length > 0));
	const right = new Set(b.split(/\s+/).filter((token) => token.length > 0));
	if (left.size !== right.size) return false;
	for (const token of left) {
		if (!right.has(token)) return false;
	}
	return true;
}

function computeClasses(current: string, ops: ClassOps): string {
	let next = ops.replace !== undefined ? ops.replace : current;
	if (ops.add !== undefined && ops.add.length > 0) next = twMerge(next, ...ops.add);
	if (ops.remove !== undefined && ops.remove.length > 0) {
		const removed = new Set(ops.remove);
		next = twMerge(next)
			.split(/\s+/)
			.filter((token) => token.length > 0 && !removed.has(token))
			.join(" ");
	}
	return next;
}

/** 把一次 class 编辑写进 magic-string；返回 changed=false 表示结果与现状一致（幂等成功）。 */
export function applyClassEdit(
	ms: MagicString,
	opening: AstNode,
	ops: ClassOps,
): ClassEditResult {
	const found = findClassName(opening);
	if (found === null) {
		// 没有 className：插入新属性（紧跟标签名之后，格式对齐 JSX 惯例）。
		const insertValue =
			ops.replace !== undefined ? ops.replace : ops.add !== undefined ? twMerge(...ops.add) : "";
		if (insertValue.length === 0) return { ok: true, changed: false };
		const name = opening.name;
		const nameEnd = typeof name === "object" && name !== null ? (name as { end?: unknown }).end : null;
		if (typeof nameEnd !== "number") return { ok: false, reason: "dynamic-class" };
		ms.appendRight(nameEnd, ` className=${JSON.stringify(insertValue)}`);
		return { ok: true, changed: true };
	}
	if (found.literal === null) return { ok: false, reason: "dynamic-class" };
	const next = computeClasses(found.value, ops);
	// tailwind-merge 会重排 token 顺序：集合没变就保持原文不动（幂等），
	// 不为「语义相同的另一种排序」产出 diff。
	if (next === found.value || sameTokenSet(next, found.value)) return { ok: true, changed: false };
	ms.overwrite(found.literal.start ?? 0, found.literal.end ?? 0, JSON.stringify(next));
	return { ok: true, changed: true };
}

/** 供定位/展示复用：元素的标签名（含成员表达式形式）。 */
export function tagNameOf(opening: AstNode): string | null {
	return jsxTagName(opening.name);
}
