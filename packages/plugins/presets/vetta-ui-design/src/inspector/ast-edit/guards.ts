// Copyright The Open Forge contributors.

/**
 * AST 外部边界的结构守卫（TASK-0316）。
 *
 * `@babel/parser` 的节点类型来自 `@babel/types`，本模块不为类型加依赖：所有节点
 * 以 `AstNode` 呈现，字段按需收窄；访问未知字段前必须过这里的守卫。
 */

export interface AstNode {
	type: string;
	start: number | null;
	end: number | null;
	loc: { start: { line: number; column: number }; end: { line: number; column: number } } | null;
	[key: string]: unknown;
}

export function isNode(value: unknown): value is AstNode {
	return typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";
}

/** 标签名：JSXIdentifier 原样；成员表达式（A.B）点连；其余（命名空间等）不支持。 */
export function jsxTagName(name: unknown): string | null {
	if (!isNode(name)) return null;
	if (name.type === "JSXIdentifier") return String(name.name);
	if (name.type === "JSXMemberExpression") {
		const object = jsxTagName(name.object);
		const property = name.property;
		const propertyTag = isNode(property) && property.type === "JSXIdentifier" ? String(property.name) : null;
		return object !== null && propertyTag !== null ? `${object}.${propertyTag}` : null;
	}
	return null;
}

export function isJsxElement(node: AstNode): boolean {
	return node.type === "JSXElement";
}

export function openingOfElement(element: AstNode): AstNode | null {
	const opening = element.openingElement;
	return isNode(opening) && opening.type === "JSXOpeningElement" ? opening : null;
}

export function closingOfElement(element: AstNode): AstNode | null {
	const closing = element.closingElement;
	return isNode(closing) && closing.type === "JSXClosingElement" ? closing : null;
}

export function attributesOf(opening: AstNode): AstNode[] {
	const list = opening.attributes;
	if (!Array.isArray(list)) return [];
	return list.filter(isNode);
}

export function childrenOfElement(element: AstNode): AstNode[] {
	const list = element.children;
	if (!Array.isArray(list)) return [];
	return list.filter(isNode);
}

export function isJsxText(node: AstNode): boolean {
	return node.type === "JSXText";
}

/** JSXText 的原文（含首尾空白）。`extra.raw` 是源码逐字符副本，实体未解码。 */
export function rawOfJsxText(node: AstNode): string {
	const extra = node.extra as { raw?: unknown } | undefined;
	if (extra !== undefined && typeof extra.raw === "string") return extra.raw;
	return typeof node.value === "string" ? node.value : "";
}

export interface ClassNameAttr {
	attr: AstNode;
	/** StringLiteral 值节点（区间含引号），静态字符串时非空。 */
	literal: AstNode | null;
	value: string;
}

/**
 * 找 `className` 属性并判定形态。
 *
 * - 静态字符串 → `{ literal, value }`；
 * - 表达式容器 / 模板串 / 无值 → `literal: null`（调用方按 dynamic-class 拒绝）；
 * - 不存在 → `null`（调用方走插入分支）。
 */
export function findClassName(opening: AstNode): ClassNameAttr | null {
	for (const attr of attributesOf(opening)) {
		if (attr.type !== "JSXAttribute") continue;
		const name = attr.name;
		if (!isNode(name) || name.type !== "JSXIdentifier" || String(name.name) !== "className") continue;
		const value = attr.value;
		if (isNode(value) && value.type === "StringLiteral" && typeof value.value === "string") {
			return { attr, literal: value, value: value.value };
		}
		return { attr, literal: null, value: "" };
	}
	return null;
}
