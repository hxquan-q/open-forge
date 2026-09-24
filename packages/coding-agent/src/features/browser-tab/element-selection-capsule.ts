// Copyright The Open Forge contributors.
import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { BrowserElementRefSchema } from "./browser-tab-tool-contract.js";

/**
 * `vetta.browser.element-selection` capsule v1（TASK-0059 / PLAN-0006）。
 * JSON-safe；截图不进 payload，只引用会话图片缓存 attachment。
 */

export const BROWSER_ELEMENT_SELECTION_SCHEMA = "vetta.browser.element-selection";

export const BROWSER_ELEMENT_SELECTION_VERSION = 1;

export const BROWSER_ELEMENT_OUTER_HTML_MAX_CHARS = 8 * 1024;

export const BROWSER_ELEMENT_SURROUNDING_TEXT_MAX_CHARS = 2 * 1024;

/** 与 plugin-sdk prompt context 总闸对齐；capsule JSON 不得突破该上限。 */
export const BROWSER_ELEMENT_SELECTION_CONTEXT_MAX_BYTES = 256 * 1024;

export const BROWSER_ELEMENT_ATTRIBUTE_KEYS = [
	"id",
	"name",
	"type",
	"role",
	"href",
	"src",
	"alt",
	"title",
	"placeholder",
	"aria-label",
	"aria-labelledby",
	"aria-describedby",
	"for",
	"autocomplete",
] as const;

export type BrowserElementAttributeKey = (typeof BROWSER_ELEMENT_ATTRIBUTE_KEYS)[number];

export const BROWSER_ELEMENT_COMPUTED_STYLE_KEYS = [
	"display",
	"position",
	"width",
	"height",
	"margin",
	"padding",
	"color",
	"backgroundColor",
	"fontSize",
	"fontWeight",
	"fontFamily",
	"lineHeight",
	"textAlign",
	"overflow",
	"zIndex",
] as const;

export type BrowserElementComputedStyleKey = (typeof BROWSER_ELEMENT_COMPUTED_STYLE_KEYS)[number];

const optionalAttribute = Type.Optional(Type.String({ maxLength: 512 }));

export const BrowserElementAttributesSchema = Type.Object(
	{
		id: optionalAttribute,
		name: optionalAttribute,
		type: optionalAttribute,
		role: optionalAttribute,
		href: optionalAttribute,
		src: optionalAttribute,
		alt: optionalAttribute,
		title: optionalAttribute,
		placeholder: optionalAttribute,
		"aria-label": optionalAttribute,
		"aria-labelledby": optionalAttribute,
		"aria-describedby": optionalAttribute,
		for: optionalAttribute,
		autocomplete: optionalAttribute,
	},
	{ additionalProperties: false },
);

const optionalStyle = Type.Optional(Type.String({ maxLength: 256 }));

export const BrowserElementComputedStyleSchema = Type.Object(
	{
		display: optionalStyle,
		position: optionalStyle,
		width: optionalStyle,
		height: optionalStyle,
		margin: optionalStyle,
		padding: optionalStyle,
		color: optionalStyle,
		backgroundColor: optionalStyle,
		fontSize: optionalStyle,
		fontWeight: optionalStyle,
		fontFamily: optionalStyle,
		lineHeight: optionalStyle,
		textAlign: optionalStyle,
		overflow: optionalStyle,
		zIndex: optionalStyle,
	},
	{ additionalProperties: false },
);

export const BrowserElementBoundingRectSchema = Type.Object(
	{
		x: Type.Number(),
		y: Type.Number(),
		width: Type.Number(),
		height: Type.Number(),
	},
	{ additionalProperties: false },
);

/** 允许用户在 WebView 内即时预览的样式属性白名单（与 computedStyle 子集一致，v1 不放开任意 CSS）。 */
export const BROWSER_ELEMENT_LIVE_EDIT_STYLE_KEYS = [
	"color",
	"backgroundColor",
	"fontSize",
	"fontWeight",
	"fontFamily",
	"lineHeight",
	"textAlign",
	"padding",
	"margin",
	"width",
	"height",
	"opacity",
	"borderRadius",
	"display",
	"visibility",
] as const;

export type BrowserElementLiveEditStyleKey = (typeof BROWSER_ELEMENT_LIVE_EDIT_STYLE_KEYS)[number];

/** picker 选中后用户在页面上即时预览的改动记录；`before`/`after` 供 Agent 定位与落地源码。 */
export const BrowserElementLiveEditSchema = Type.Union(
	[
		Type.Object(
			{
				kind: Type.Literal("style"),
				property: Type.String({ minLength: 1, maxLength: 64 }),
				before: Type.String({ maxLength: 512 }),
				after: Type.String({ maxLength: 512 }),
				target: Type.Optional(Type.String({ maxLength: 2048 })),
			},
			{ additionalProperties: false },
		),
		Type.Object(
			{
				kind: Type.Literal("text"),
				before: Type.String({ maxLength: 2048 }),
				after: Type.String({ maxLength: 2048 }),
				target: Type.Optional(Type.String({ maxLength: 2048 })),
			},
			{ additionalProperties: false },
		),
	],
	{ additionalProperties: false },
);

export type BrowserElementLiveEdit = Static<typeof BrowserElementLiveEditSchema>;

export const BROWSER_ELEMENT_LIVE_EDIT_MAX_ITEMS = 64;

export const BrowserElementSelectionPayloadSchema = Type.Object(
	{
		pageUrl: Type.String({ minLength: 1, maxLength: 2048 }),
		title: Type.String({ maxLength: 512 }),
		elementRef: BrowserElementRefSchema,
		pageRevision: Type.Integer({ minimum: 0 }),
		role: Type.String({ maxLength: 128 }),
		accessibleName: Type.String({ maxLength: 512 }),
		attributes: BrowserElementAttributesSchema,
		domPath: Type.String({ minLength: 1, maxLength: 2048 }),
		xpath: Type.String({ minLength: 1, maxLength: 2048 }),
		computedStyle: BrowserElementComputedStyleSchema,
		outerHTML: Type.String({ maxLength: BROWSER_ELEMENT_OUTER_HTML_MAX_CHARS }),
		surroundingText: Type.String({ maxLength: BROWSER_ELEMENT_SURROUNDING_TEXT_MAX_CHARS }),
		boundingRect: BrowserElementBoundingRectSchema,
		screenshotAttachmentId: Type.Optional(Type.String({ minLength: 1, maxLength: 160 })),
		liveEdits: Type.Optional(
			Type.Array(BrowserElementLiveEditSchema, { maxItems: BROWSER_ELEMENT_LIVE_EDIT_MAX_ITEMS }),
		),
	},
	{ additionalProperties: false },
);

export type BrowserElementSelectionPayload = Static<typeof BrowserElementSelectionPayloadSchema>;

export const BrowserElementSelectionContextSchema = Type.Object(
	{
		schema: Type.Literal(BROWSER_ELEMENT_SELECTION_SCHEMA),
		version: Type.Literal(BROWSER_ELEMENT_SELECTION_VERSION),
		payload: BrowserElementSelectionPayloadSchema,
	},
	{ additionalProperties: false },
);

export type BrowserElementSelectionContext = Static<typeof BrowserElementSelectionContextSchema>;

export function readBrowserElementSelectionPayload(value: unknown): BrowserElementSelectionPayload | undefined {
	if (!Value.Check(BrowserElementSelectionPayloadSchema, value)) return undefined;
	if (value.elementRef.pageRevision !== value.pageRevision) return undefined;
	return value;
}

export function readBrowserElementSelectionContext(value: unknown): BrowserElementSelectionContext | undefined {
	if (!Value.Check(BrowserElementSelectionContextSchema, value)) return undefined;
	if (value.payload.elementRef.pageRevision !== value.payload.pageRevision) return undefined;
	const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
	if (bytes > BROWSER_ELEMENT_SELECTION_CONTEXT_MAX_BYTES) return undefined;
	return value;
}
