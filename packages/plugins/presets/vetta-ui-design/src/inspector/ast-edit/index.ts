// Copyright The Open Forge contributors.

/**
 * AST 写回引擎公开入口（TASK-0316，PLAN-0018 F3 前置）。
 *
 * 纯函数：源码进、源码出，不触文件系统与 DOM；输出保持原格式（仅目标区间变化）。
 * 拒绝路径显式给 reason，不抛裸异常（解析失败包成 `parse-error`，message 带位置）。
 */
import MagicString from "magic-string";
import type { ClassOps } from "./style";
import { applyClassEdit } from "./style";
import type { ElementFingerprint, ElementLocator, LocateResult } from "./locate";
import { locateElement } from "./locate";
import { parseTsx } from "./parse";
import { applyTextEdit } from "./text";

export type EditFailureReason = "parse-error" | "locator-miss" | "ambiguous" | "dynamic-class" | "no-target";

export type EditResult =
	| ({ ok: true; changed: boolean; code: string } & { fingerprint: ElementFingerprint })
	| { ok: false; reason: EditFailureReason; message?: string };

function withEngine(
	source: string,
	locator: ElementLocator,
	fingerprint: ElementFingerprint | null,
	apply: (ms: MagicString, located: Extract<LocateResult, { ok: true }>) => { ok: boolean } | { ok: false; reason: "dynamic-class" | "no-target" },
): EditResult {
	let parsed;
	try {
		parsed = parseTsx(source);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		return { ok: false, reason: "parse-error", message };
	}
	const located = locateElement(parsed.ast, locator, fingerprint);
	if (!located.ok) {
		return {
			ok: false,
			reason: located.reason,
			message: located.reason === "ambiguous" ? `${located.candidates} 个候选同分` : undefined,
		};
	}
	const ms = new MagicString(source);
	const applied = apply(ms, located);
	if (!applied.ok) {
		return "reason" in applied ? { ok: false, reason: applied.reason } : { ok: false, reason: "no-target" };
	}
	return {
		ok: true,
		changed: applied.ok && (applied as { changed?: boolean }).changed === true,
		code: ms.toString(),
		fingerprint: located.fingerprint,
	};
}

/**
 * 编辑目标元素的 Tailwind class。成功时 `code` 是新源码（内容未变则 `changed: false`
 * 且 `code` 等于原文）；返回的 `fingerprint` 供下一轮编辑重定位持久化。
 */
export function editClasses(
	source: string,
	locator: ElementLocator,
	fingerprint: ElementFingerprint | null,
	ops: ClassOps,
): EditResult {
	return withEngine(source, locator, fingerprint, (ms, located) => applyClassEdit(ms, located.opening, ops));
}

/**
 * 编辑目标元素的文本（首个 JSXText；单行保格式替换，多行重建为 text + `<br/>`）。
 */
export function editText(
	source: string,
	locator: ElementLocator,
	fingerprint: ElementFingerprint | null,
	newText: string,
): EditResult {
	return withEngine(source, locator, fingerprint, (ms, located) => applyTextEdit(ms, located.element, newText));
}

export type { ClassOps, ElementFingerprint, ElementLocator };
export { locateElement } from "./locate";
