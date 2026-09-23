// Copyright The Open Forge contributors.

import type { ActivityTabDefinition } from "../registry/types";

/**
 * 默认隐藏的内置 tab 被用户从上栏「+」挂出后，写进 hiddenKeys 的显式标记。
 * 普通 hiddenKeys 条目表示「默认上栏的 tab 被用户藏起来」；带此前缀则相反。
 */
export const SHOWN_BUILTIN_TAB_PREFIX = "+";

export function defaultHiddenBuiltinTabIds(definitions: readonly ActivityTabDefinition[]): string[] {
	return definitions.filter((def) => def.source === "builtin" && def.initiallyVisible === false).map((def) => def.id);
}

export function shownBuiltinTabKey(tabId: string): string {
	return `${SHOWN_BUILTIN_TAB_PREFIX}${tabId}`;
}

/**
 * 把落盘记录折成 resolveActivityTabs 认识的 hiddenKeys：出现即不上栏。
 *
 * 默认隐藏的内置 tab（如 terminal）在用户从未显式挂出时必须进 hidden，
 * 即使该 workspace 已有其它 hidden 记录、列表里还没有它的 id。
 */
export function effectiveHiddenActivityTabKeys(
	stored: readonly string[] | undefined,
	defaultHiddenIds: readonly string[],
): string[] {
	const entries = stored ?? [];
	const shown = new Set(
		entries
			.filter((key) => key.startsWith(SHOWN_BUILTIN_TAB_PREFIX))
			.map((key) => key.slice(SHOWN_BUILTIN_TAB_PREFIX.length)),
	);
	const explicitHidden = entries.filter((key) => !key.startsWith(SHOWN_BUILTIN_TAB_PREFIX));
	const implicitHidden = defaultHiddenIds.filter((id) => !shown.has(id) && !explicitHidden.includes(id));
	return [...explicitHidden, ...implicitHidden];
}

export function revealActivityTabKeys(
	stored: readonly string[] | undefined,
	tabId: string,
	defaultHiddenIds: readonly string[],
): string[] {
	const next = (stored ?? []).filter((key) => key !== tabId && key !== shownBuiltinTabKey(tabId));
	if (defaultHiddenIds.includes(tabId)) next.push(shownBuiltinTabKey(tabId));
	return next;
}

export function hideActivityTabKeys(
	stored: readonly string[] | undefined,
	tabId: string,
	defaultHiddenIds: readonly string[],
): string[] {
	const next = (stored ?? []).filter((key) => key !== tabId && key !== shownBuiltinTabKey(tabId));
	if (!defaultHiddenIds.includes(tabId)) next.push(tabId);
	return next;
}
