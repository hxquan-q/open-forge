// Copyright The Open Forge contributors.
import {
	BROWSER_ELEMENT_ATTRIBUTE_KEYS,
	BROWSER_ELEMENT_COMPUTED_STYLE_KEYS,
	BROWSER_ELEMENT_OUTER_HTML_MAX_CHARS,
	BROWSER_ELEMENT_SURROUNDING_TEXT_MAX_CHARS,
} from "@vetta/coding-agent/function-extensions";

const ATTRIBUTE_MAX = 512;
const STYLE_MAX = 256;
const SENSITIVE_NAME = /^(password|passwd|secret|token|cookie|authorization|auth|ssn|credit|card|cvv|pin)$/i;
const SENSITIVE_AUTOCOMPLETE = /password|cc-|card|cvv|csc|ssn|one-time/i;

export interface ExtractedBrowserElement {
	readonly role: string;
	readonly accessibleName: string;
	readonly attributes: Record<string, string>;
	readonly domPath: string;
	readonly xpath: string;
	readonly computedStyle: Record<string, string>;
	readonly outerHTML: string;
	readonly surroundingText: string;
	readonly boundingRect: { x: number; y: number; width: number; height: number };
	readonly devicePixelRatio: number;
	readonly sourceHint?: BrowserElementSourceHint;
}

export interface BrowserElementSourceHint {
	readonly kind: "react" | "vue" | "attribute";
	readonly file: string;
	readonly line?: number;
	readonly column?: number;
	readonly component?: string;
}

const IMPLICIT_ROLES: Record<string, string> = {
	a: "link",
	button: "button",
	textarea: "textbox",
	select: "combobox",
	img: "img",
	nav: "navigation",
	main: "main",
	header: "banner",
	footer: "contentinfo",
	form: "form",
	h1: "heading",
	h2: "heading",
	h3: "heading",
	label: "label",
};

export function isSensitiveFormControl(element: Element): boolean {
	const type = (element.getAttribute("type") ?? "").toLowerCase();
	if (type === "password") return true;
	if (SENSITIVE_AUTOCOMPLETE.test(element.getAttribute("autocomplete") ?? "")) return true;
	return SENSITIVE_NAME.test(element.getAttribute("name") ?? element.getAttribute("id") ?? "");
}

export function implicitElementRole(element: Element): string {
	const explicit = element.getAttribute("role")?.trim();
	if (explicit) return explicit.slice(0, 128);
	const tag = element.tagName.toLowerCase();
	if (tag === "input") {
		const type = (element.getAttribute("type") ?? "text").toLowerCase();
		if (type === "button" || type === "submit" || type === "reset") return "button";
		if (type === "checkbox") return "checkbox";
		if (type === "radio") return "radio";
		if (type === "range") return "slider";
		return "textbox";
	}
	return IMPLICIT_ROLES[tag] ?? tag;
}

export function collectWhitelistedAttributes(element: Element): Record<string, string> {
	const attributes: Record<string, string> = {};
	for (const key of BROWSER_ELEMENT_ATTRIBUTE_KEYS) {
		const value = element.getAttribute(key)?.trim();
		if (!value) continue;
		if ((key === "href" || key === "src") && /^\s*(javascript:|data:)/i.test(value)) continue;
		attributes[key] = value.slice(0, ATTRIBUTE_MAX);
	}
	return attributes;
}

export function collectWhitelistedComputedStyle(style: CSSStyleDeclaration): Record<string, string> {
	const computed: Record<string, string> = {};
	for (const key of BROWSER_ELEMENT_COMPUTED_STYLE_KEYS) {
		const value = style[key as keyof CSSStyleDeclaration];
		if (typeof value !== "string" || !value) continue;
		computed[key] = value.slice(0, STYLE_MAX);
	}
	return computed;
}

export function sanitizeOuterHTML(html: string, maskValues: boolean): string {
	let next = html.replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "");
	next = next.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
	next = next.replace(/\s(href|src)\s*=\s*(['"])\s*(javascript:|data:)[\s\S]*?\2/gi, "");
	if (maskValues) {
		next = next.replace(/\svalue\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, ' value="••••"');
	}
	return next.slice(0, BROWSER_ELEMENT_OUTER_HTML_MAX_CHARS);
}

export function readAccessibleName(element: Element, documentRef: Document): string {
	const labelled = element.getAttribute("aria-label")?.trim();
	if (labelled) return labelled.slice(0, 512);
	const labelledBy = element.getAttribute("aria-labelledby")?.trim();
	if (labelledBy) {
		const fromIds = labelledBy
			.split(/\s+/)
			.map((id) => documentRef.getElementById(id)?.textContent?.trim() ?? "")
			.filter(Boolean)
			.join(" ");
		if (fromIds) return fromIds.slice(0, 512);
	}
	const alt = element.getAttribute("alt")?.trim();
	if (alt) return alt.slice(0, 512);
	if (element.id) {
		const label = documentRef.querySelector(`label[for="${cssEscape(element.id)}"]`);
		const text = label?.textContent?.trim();
		if (text) return text.slice(0, 512);
	}
	const title = element.getAttribute("title")?.trim();
	if (title) return title.slice(0, 512);
	const placeholder = element.getAttribute("placeholder")?.trim();
	if (placeholder) return placeholder.slice(0, 512);
	return (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 512);
}

export function readSurroundingText(element: Element): string {
	const parent = element.parentElement;
	const source = parent?.textContent ?? element.textContent ?? "";
	return source.replace(/\s+/g, " ").trim().slice(0, BROWSER_ELEMENT_SURROUNDING_TEXT_MAX_CHARS);
}

export function buildDomPath(element: Element, documentRef: Document): string {
	const parts: string[] = [];
	let current: Element | null = element;
	while (current && current !== documentRef.documentElement) {
		parts.unshift(describeDomNode(current, documentRef));
		if (current.id && documentRef.querySelectorAll(`#${cssEscape(current.id)}`).length === 1) break;
		current = current.parentElement;
	}
	const path = parts.join(" > ");
	return (path || element.tagName.toLowerCase()).slice(0, 2048);
}

export function buildXPath(element: Element, documentRef: Document): string {
	if (element.id && documentRef.querySelectorAll(`#${cssEscape(element.id)}`).length === 1) {
		return `//*[@id=${JSON.stringify(element.id)}]`.slice(0, 2048);
	}
	const parts: string[] = [];
	let current: Element | null = element;
	while (current) {
		const tag = current.tagName.toLowerCase();
		const parent: Element | null = current.parentElement;
		if (!parent) {
			parts.unshift(`/${tag}`);
			break;
		}
		const siblings = Array.from(parent.children).filter((node) => node.tagName === current?.tagName);
		parts.unshift(`/${tag}[${siblings.indexOf(current) + 1}]`);
		current = parent;
	}
	return parts.join("").slice(0, 2048);
}

export function extractBrowserElement(
	element: Element,
	documentRef: Document,
	windowRef: Window,
): ExtractedBrowserElement {
	const maskValues = isSensitiveFormControl(element);
	const rect = element.getBoundingClientRect();
	const sourceHint = readBrowserElementSourceHint(element);
	return {
		role: implicitElementRole(element),
		accessibleName: readAccessibleName(element, documentRef),
		attributes: collectWhitelistedAttributes(element),
		domPath: buildDomPath(element, documentRef),
		xpath: buildXPath(element, documentRef),
		computedStyle: collectWhitelistedComputedStyle(windowRef.getComputedStyle(element)),
		outerHTML: sanitizeOuterHTML(element.outerHTML, maskValues),
		surroundingText: readSurroundingText(element),
		boundingRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
		devicePixelRatio: Number.isFinite(windowRef.devicePixelRatio) ? windowRef.devicePixelRatio : 1,
		...(sourceHint ? { sourceHint } : {}),
	};
}

/**
 * 从页面元素读取开发构建暴露的组件位置。函数体必须自包含：guest 按 toString() 注入，
 * 不能引用模块里的其他绑定。
 */
export function readBrowserElementSourceHint(element: Element): BrowserElementSourceHint | undefined {
	const maxHops = 8;
	const readFile = (value: unknown): string | undefined => {
		if (typeof value !== "string") return undefined;
		const trimmed = value.trim().replace(/^file:\/\//, "");
		if (!trimmed || trimmed.length > 512 || /[<>\r\n]/.test(trimmed)) return undefined;
		if (/^(javascript|data|https?):/i.test(trimmed)) return undefined;
		return trimmed;
	};
	const readName = (value: unknown): string | undefined => {
		if (typeof value !== "string") return undefined;
		const trimmed = value.trim();
		if (!trimmed || trimmed.length > 128 || !/^[$A-Za-z_][$\w.]*$/.test(trimmed)) return undefined;
		return trimmed;
	};
	const readLine = (value: unknown): number | undefined => {
		const line = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
		if (!Number.isInteger(line) || line < 1 || line > 1_000_000) return undefined;
		return line;
	};
	const parseLocation = (raw: string): { file: string; line?: number; column?: number } | undefined => {
		const trimmed = raw.trim();
		const withColumn = /^(.*):(\d+):(\d+)$/.exec(trimmed);
		const withLine = withColumn ? undefined : /^(.*):(\d+)$/.exec(trimmed);
		const match = withColumn ?? withLine;
		if (!match?.[1]) {
			const file = readFile(trimmed);
			return file ? { file } : undefined;
		}
		const file = readFile(match[1]);
		if (!file) return undefined;
		const line = readLine(match[2]);
		const column = match[3] ? readLine(match[3]) : undefined;
		return { file, ...(line ? { line } : {}), ...(column ? { column } : {}) };
	};
	const nodes: Element[] = [];
	let cursor: Element | null = element;
	for (let hop = 0; cursor && hop < maxHops; hop += 1) {
		nodes.push(cursor);
		cursor = cursor.parentElement;
	}
	for (const node of nodes) {
		const record = node as unknown as Record<string, unknown>;
		let fiber: Record<string, unknown> | undefined;
		for (const key of Object.keys(record)) {
			if (!key.startsWith("__reactFiber$") && !key.startsWith("__reactInternalInstance$")) continue;
			const value = record[key];
			if (value && typeof value === "object") fiber = value as Record<string, unknown>;
			break;
		}
		for (let hop = 0; fiber && hop < 6; hop += 1) {
			const debug = fiber._debugSource;
			if (debug && typeof debug === "object") {
				const source = debug as Record<string, unknown>;
				const file = readFile(source.fileName);
				if (file) {
					const line = readLine(source.lineNumber);
					const column = readLine(source.columnNumber);
					const type = fiber.type ?? fiber.elementType;
					const typeRecord = type && typeof type === "object" ? (type as Record<string, unknown>) : undefined;
					const component = readName(
						typeRecord?.displayName ?? typeRecord?.name ?? (typeof type === "function" ? type.name : undefined),
					);
					return {
						kind: "react",
						file,
						...(line ? { line } : {}),
						...(column ? { column } : {}),
						...(component ? { component } : {}),
					};
				}
			}
			const parent = fiber.return;
			fiber = parent && typeof parent === "object" ? (parent as Record<string, unknown>) : undefined;
		}
	}
	for (const node of nodes) {
		const vue = (node as unknown as { __vueParentComponent?: { type?: Record<string, unknown> } })
			.__vueParentComponent;
		const file = readFile(vue?.type?.__file);
		if (!file) continue;
		const component = readName(vue?.type?.name ?? vue?.type?.__name);
		return { kind: "vue", file, ...(component ? { component } : {}) };
	}
	for (const node of nodes) {
		for (const name of ["data-insp-path", "data-source-path", "data-source"]) {
			const parsed = parseLocation(node.getAttribute(name) ?? "");
			if (parsed) return { kind: "attribute", ...parsed };
		}
	}
	return undefined;
}

export function readBrowserElementSourceHintValue(value: unknown): BrowserElementSourceHint | undefined {
	if (!value || typeof value !== "object") return undefined;
	const record = value as Record<string, unknown>;
	if (record.kind !== "react" && record.kind !== "vue" && record.kind !== "attribute") return undefined;
	const hint = readBrowserElementSourceHintValueFields(record);
	return hint;
}

function readBrowserElementSourceHintValueFields(
	record: Record<string, unknown>,
): BrowserElementSourceHint | undefined {
	if (typeof record.file !== "string" || record.file.length < 1 || record.file.length > 512) return undefined;
	if (/[<>\r\n]/.test(record.file) || /^(javascript|data|https?):/i.test(record.file)) return undefined;
	const line = record.line;
	const column = record.column;
	if (line !== undefined && (typeof line !== "number" || !Number.isInteger(line) || line < 1 || line > 1_000_000)) {
		return undefined;
	}
	if (
		column !== undefined &&
		(typeof column !== "number" || !Number.isInteger(column) || column < 1 || column > 1_000_000)
	) {
		return undefined;
	}
	if (
		record.component !== undefined &&
		(typeof record.component !== "string" ||
			record.component.length < 1 ||
			record.component.length > 128 ||
			!/^[$A-Za-z_][$\w.]*$/.test(record.component))
	) {
		return undefined;
	}
	return {
		kind: record.kind as BrowserElementSourceHint["kind"],
		file: record.file,
		...(typeof line === "number" ? { line } : {}),
		...(typeof column === "number" ? { column } : {}),
		...(typeof record.component === "string" ? { component: record.component } : {}),
	};
}

export function readExtractedBrowserElement(value: unknown): ExtractedBrowserElement | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const record = value as Record<string, unknown>;
	const bounding = record.boundingRect;
	if (typeof bounding !== "object" || bounding === null) return undefined;
	const box = bounding as Record<string, unknown>;
	const { x, y, width, height } = box;
	if (
		typeof x !== "number" ||
		!Number.isFinite(x) ||
		typeof y !== "number" ||
		!Number.isFinite(y) ||
		typeof width !== "number" ||
		!Number.isFinite(width) ||
		typeof height !== "number" ||
		!Number.isFinite(height)
	) {
		return undefined;
	}
	if (typeof record.role !== "string" || typeof record.accessibleName !== "string") return undefined;
	if (typeof record.domPath !== "string" || typeof record.xpath !== "string") return undefined;
	if (typeof record.outerHTML !== "string" || typeof record.surroundingText !== "string") return undefined;
	const attributes = readStringRecord(record.attributes, BROWSER_ELEMENT_ATTRIBUTE_KEYS, ATTRIBUTE_MAX);
	const computedStyle = readStringRecord(record.computedStyle, BROWSER_ELEMENT_COMPUTED_STYLE_KEYS, STYLE_MAX);
	if (!attributes || !computedStyle) return undefined;
	const sourceHint = readBrowserElementSourceHintValue(record.sourceHint);
	return {
		role: record.role.slice(0, 128),
		accessibleName: record.accessibleName.slice(0, 512),
		attributes,
		domPath: record.domPath.slice(0, 2048),
		xpath: record.xpath.slice(0, 2048),
		computedStyle,
		outerHTML: sanitizeOuterHTML(record.outerHTML, /value="••••"/.test(record.outerHTML)),
		surroundingText: record.surroundingText.slice(0, BROWSER_ELEMENT_SURROUNDING_TEXT_MAX_CHARS),
		boundingRect: { x, y, width, height },
		devicePixelRatio:
			typeof record.devicePixelRatio === "number" && record.devicePixelRatio > 0 ? record.devicePixelRatio : 1,
		...(sourceHint ? { sourceHint } : {}),
	};
}

function describeDomNode(element: Element, documentRef: Document): string {
	const tag = element.tagName.toLowerCase();
	if (element.id && documentRef.querySelectorAll(`#${cssEscape(element.id)}`).length === 1) {
		return `${tag}#${element.id}`;
	}
	const parent = element.parentElement;
	if (!parent) return tag;
	const typed = Array.from(parent.children).filter((node) => node.tagName === element.tagName);
	return typed.length > 1 ? `${tag}:nth-of-type(${typed.indexOf(element) + 1})` : tag;
}

function readStringRecord(
	value: unknown,
	allowed: readonly string[],
	maxLength: number,
): Record<string, string> | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const record = value as Record<string, unknown>;
	const allowedSet = new Set<string>(allowed);
	const out: Record<string, string> = {};
	for (const [key, item] of Object.entries(record)) {
		if (!allowedSet.has(key) || typeof item !== "string") continue;
		if (!item) continue;
		out[key] = item.slice(0, maxLength);
	}
	return out;
}

function cssEscape(value: string): string {
	if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
	return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
