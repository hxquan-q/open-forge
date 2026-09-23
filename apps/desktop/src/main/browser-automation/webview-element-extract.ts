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
		const parent = current.parentElement;
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
	};
}

export function readExtractedBrowserElement(value: unknown): ExtractedBrowserElement | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const record = value as Record<string, unknown>;
	const bounding = record.boundingRect;
	if (typeof bounding !== "object" || bounding === null) return undefined;
	const box = bounding as Record<string, unknown>;
	if (![box.x, box.y, box.width, box.height].every((item) => typeof item === "number" && Number.isFinite(item))) {
		return undefined;
	}
	if (typeof record.role !== "string" || typeof record.accessibleName !== "string") return undefined;
	if (typeof record.domPath !== "string" || typeof record.xpath !== "string") return undefined;
	if (typeof record.outerHTML !== "string" || typeof record.surroundingText !== "string") return undefined;
	const attributes = readStringRecord(record.attributes, BROWSER_ELEMENT_ATTRIBUTE_KEYS, ATTRIBUTE_MAX);
	const computedStyle = readStringRecord(record.computedStyle, BROWSER_ELEMENT_COMPUTED_STYLE_KEYS, STYLE_MAX);
	if (!attributes || !computedStyle) return undefined;
	return {
		role: record.role.slice(0, 128),
		accessibleName: record.accessibleName.slice(0, 512),
		attributes,
		domPath: record.domPath.slice(0, 2048),
		xpath: record.xpath.slice(0, 2048),
		computedStyle,
		outerHTML: sanitizeOuterHTML(record.outerHTML, /value="••••"/.test(record.outerHTML)),
		surroundingText: record.surroundingText.slice(0, BROWSER_ELEMENT_SURROUNDING_TEXT_MAX_CHARS),
		boundingRect: { x: box.x, y: box.y, width: box.width, height: box.height },
		devicePixelRatio:
			typeof record.devicePixelRatio === "number" && record.devicePixelRatio > 0 ? record.devicePixelRatio : 1,
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
