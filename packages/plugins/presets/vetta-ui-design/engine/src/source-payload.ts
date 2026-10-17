// Copyright The Open Forge contributors.
/**
 * Element context pack (PLAN-0018 F2 data layer): the exact slice of a
 * selected DOM element the agent needs next to its locator — a truncated
 * outerHTML snippet and a whitelisted computed-style summary.
 *
 * Pure helpers in their own module (not inside bridge.ts) so they stay
 * unit-testable without the bridge's html-to-image dependency, and so the
 * canvas side can import the shape by type without dragging the engine in.
 */

/** Hard cap for the snippet. The full document string can be hundreds of KB. */
const MAX_OUTER_HTML = 2048;

/**
 * Layout/typography keys that answer "why does it look like this" without
 * shipping the whole ~300-key computed style (most of which is inherited noise
 * or defaults the agent cannot act on).
 */
const STYLE_KEYS = [
	"display",
	"flexDirection",
	"gap",
	"fontSize",
	"fontWeight",
	"color",
	"backgroundColor",
	"borderRadius",
	"width",
	"height",
] as const;

export type StyleSummary = Partial<Record<(typeof STYLE_KEYS)[number], string>>;

/** outerHTML truncated to a predictable size, with an explicit truncation mark. */
export function outerHtmlSnippet(element: Element): string {
	const html = element.outerHTML ?? "";
	if (html.length <= MAX_OUTER_HTML) return html;
	return `${html.slice(0, MAX_OUTER_HTML)}…[truncated ${html.length - MAX_OUTER_HTML} chars]`;
}

/**
 * Whitelisted computed style of one element. `getStyle` is injected so tests
 * (and any environment without a live layout) can pass a stub.
 */
export function styleSummaryFor(
	element: Element,
	getStyle: (element: Element) => CSSStyleDeclaration,
): StyleSummary {
	const style = getStyle(element);
	const summary: StyleSummary = {};
	for (const key of STYLE_KEYS) {
		const value = style[key];
		if (typeof value === "string" && value !== "") summary[key] = value;
	}
	return summary;
}
