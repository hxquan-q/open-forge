// Copyright The Open Forge contributors.

/**
 * 点选命中后的页面内即时预览（TASK-0085，Cursor Design Mode 同边界：只改 WebView DOM，不写源码）。
 * 本文件的函数体会被 `.toString()` 注入 WebView guest：不得引用模块绑定，
 * 白名单等外部数据经 `buildInAppBrowserGuestScript` 序列化注入。
 */

export interface InAppBrowserLiveEditCommand {
	readonly kind: "style" | "text";
	/** kind=style 时的 CSSStyleDeclaration 键（camelCase）。 */
	readonly property?: string;
	readonly value: string;
}

/** 公开给宿主/渲染层的改动记录（不含 element 引用；target 是元素 domPath，供多元素日志区分）。 */
export interface InAppBrowserLiveEditRecord {
	readonly kind: "style" | "text";
	readonly property?: string;
	readonly before: string;
	readonly after: string;
	readonly target?: string;
}

/** guest 内部记录：携带元素引用供撤销回放。 */
export interface InAppBrowserLiveEditEntry extends InAppBrowserLiveEditRecord {
	readonly element: Element;
}

export type InAppBrowserLiveEditApplyResult =
	| { readonly ok: true; readonly record: InAppBrowserLiveEditRecord }
	| {
			readonly ok: false;
			readonly code: "no_element" | "unknown_property" | "not_leaf_text" | "empty_style" | "limit_reached";
	  };

/**
 * 对命中元素应用一条即时改动并记录 before/after。
 * - style：只允许白名单属性；value 为空等价于移除内联属性（after=""）。
 * - text：只作用于无子元素的叶子节点（避免抹掉子树），before/after 截断到 2048。
 */
export function applyInAppBrowserLiveEdit(
	element: Element | null,
	edit: InAppBrowserLiveEditCommand,
	allowedStyleKeys: readonly string[],
	currentCount: number,
	maxEntries: number,
): InAppBrowserLiveEditApplyResult {
	const kebabCase = (property: string): string => property.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
	if (!element || element.isConnected === false) return { ok: false, code: "no_element" };
	if (currentCount >= maxEntries) return { ok: false, code: "limit_reached" };
	if (edit.kind === "style") {
		const property = (edit.property ?? "").trim();
		if (!property || !allowedStyleKeys.includes(property)) return { ok: false, code: "unknown_property" };
		const style = (element as HTMLElement).style;
		if (!style) return { ok: false, code: "empty_style" };
		const kebab = kebabCase(property);
		const before = style.getPropertyValue(kebab);
		const value = edit.value.trim().slice(0, 512);
		if (value === "") style.removeProperty(kebab);
		else style.setProperty(kebab, value);
		return { ok: true, record: { kind: "style", property, before, after: value } };
	}
	if (element.children.length > 0) return { ok: false, code: "not_leaf_text" };
	const before = (element.textContent ?? "").slice(0, 2048);
	const after = edit.value.slice(0, 2048);
	element.textContent = after;
	return { ok: true, record: { kind: "text", before, after } };
}

/** 回放一条记录的 before；元素已离文档时跳过。 */
export function revertInAppBrowserLiveEditEntry(entry: InAppBrowserLiveEditEntry): boolean {
	const kebabCase = (property: string): string => property.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
	const element = entry.element;
	if (!element || element.isConnected === false) return false;
	if (entry.kind === "style") {
		const style = (element as HTMLElement).style;
		if (!style) return false;
		const kebab = kebabCase(entry.property ?? "");
		if (entry.before === "") style.removeProperty(kebab);
		else style.setProperty(kebab, entry.before);
		return true;
	}
	element.textContent = entry.before;
	return true;
}

/** 逆序回放整份日志（后应用先撤销）。函数体同样要能独立注入：不得调用同模块的兄弟导出。 */
export function revertInAppBrowserLiveEditEntries(entries: readonly InAppBrowserLiveEditEntry[]): number {
	const kebabCase = (property: string): string => property.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
	let reverted = 0;
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		const element = entry.element;
		if (!element || element.isConnected === false) continue;
		if (entry.kind === "style") {
			const style = (element as HTMLElement).style;
			if (!style) continue;
			const kebab = kebabCase(entry.property ?? "");
			if (entry.before === "") style.removeProperty(kebab);
			else style.setProperty(kebab, entry.before);
		} else {
			element.textContent = entry.before;
		}
		reverted += 1;
	}
	return reverted;
}
