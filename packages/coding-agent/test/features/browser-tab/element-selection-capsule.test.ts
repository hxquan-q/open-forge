// Copyright The Open Forge contributors.
import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import {
	BROWSER_ELEMENT_ATTRIBUTE_KEYS,
	BROWSER_ELEMENT_COMPUTED_STYLE_KEYS,
	BROWSER_ELEMENT_OUTER_HTML_MAX_CHARS,
	BROWSER_ELEMENT_SELECTION_SCHEMA,
	BROWSER_ELEMENT_SELECTION_VERSION,
	BROWSER_ELEMENT_SURROUNDING_TEXT_MAX_CHARS,
	type BrowserElementSelectionContext,
	BrowserElementSelectionContextSchema,
	type BrowserElementSelectionPayload,
	readBrowserElementSelectionContext,
	readBrowserElementSelectionPayload,
} from "../../../src/features/browser-tab/element-selection-capsule.js";

function validPayload(overrides: Partial<BrowserElementSelectionPayload> = {}): BrowserElementSelectionPayload {
	return {
		pageUrl: "https://example.com/form",
		title: "Example",
		elementRef: { id: "e2", pageRevision: 7 },
		pageRevision: 7,
		role: "textbox",
		accessibleName: "Email",
		attributes: { id: "email", type: "email", name: "email" },
		domPath: "form > input#email",
		xpath: "//input[@id='email']",
		computedStyle: { display: "inline-block", width: "240px", fontSize: "14px" },
		outerHTML: '<input id="email" type="email">',
		surroundingText: "Email address",
		boundingRect: { x: 10, y: 20, width: 240, height: 32 },
		...overrides,
	};
}

describe("vetta.browser.element-selection capsule v1", () => {
	it("接受合法 v1 payload 与 context 包装", () => {
		const payload = validPayload({ screenshotAttachmentId: "img-1" });
		expect(readBrowserElementSelectionPayload(payload)).toEqual(payload);
		const context: BrowserElementSelectionContext = {
			schema: BROWSER_ELEMENT_SELECTION_SCHEMA,
			version: BROWSER_ELEMENT_SELECTION_VERSION,
			payload,
		};
		expect(Value.Check(BrowserElementSelectionContextSchema, context)).toBe(true);
		expect(readBrowserElementSelectionContext(context)).toEqual(context);
	});

	it("拒绝 pageRevision 与 elementRef 不一致、未知字段和超限文本", () => {
		expect(readBrowserElementSelectionPayload(validPayload({ pageRevision: 8 }))).toBeUndefined();
		expect(readBrowserElementSelectionPayload({ ...validPayload(), cookie: "secret" })).toBeUndefined();
		expect(
			readBrowserElementSelectionPayload(
				validPayload({ outerHTML: "x".repeat(BROWSER_ELEMENT_OUTER_HTML_MAX_CHARS + 1) }),
			),
		).toBeUndefined();
		expect(
			readBrowserElementSelectionPayload(
				validPayload({ surroundingText: "y".repeat(BROWSER_ELEMENT_SURROUNDING_TEXT_MAX_CHARS + 1) }),
			),
		).toBeUndefined();
	});

	it("属性与 computedStyle 白名单封闭，拒绝 value / 未知样式", () => {
		expect(
			readBrowserElementSelectionPayload(
				validPayload({
					attributes: { id: "email", value: "secret" } as BrowserElementSelectionPayload["attributes"],
				}),
			),
		).toBeUndefined();
		expect(
			readBrowserElementSelectionPayload(
				validPayload({
					computedStyle: {
						display: "block",
						transform: "none",
					} as BrowserElementSelectionPayload["computedStyle"],
				}),
			),
		).toBeUndefined();
		expect(BROWSER_ELEMENT_ATTRIBUTE_KEYS).not.toContain("value");
		expect(BROWSER_ELEMENT_COMPUTED_STYLE_KEYS).toHaveLength(15);
	});

	it("接受一起选中的其他元素，并拒绝超过 3 个", () => {
		const companion = {
			role: "button",
			accessibleName: "B",
			attributes: { id: "b" },
			domPath: "button#b",
			xpath: '//*[@id="b"]',
			computedStyle: { display: "block" },
			outerHTML: '<button id="b">B</button>',
			surroundingText: "B",
			boundingRect: { x: 0, y: 0, width: 10, height: 10 },
		};
		expect(readBrowserElementSelectionPayload(validPayload({ companions: [companion] }))?.companions).toEqual([
			companion,
		]);
		expect(
			readBrowserElementSelectionPayload(validPayload({ companions: [companion, companion, companion, companion] })),
		).toBeUndefined();
	});

	it("接受可选的组件位置，并拒绝多出来的字段", () => {
		const hinted = validPayload({
			sourceHint: { kind: "react", file: "src/App.tsx", line: 12, column: 3, component: "SaveButton" },
		});
		expect(readBrowserElementSelectionPayload(hinted)?.sourceHint).toEqual(hinted.sourceHint);
		expect(
			readBrowserElementSelectionPayload({
				...validPayload(),
				sourceHint: { kind: "react", file: "src/App.tsx", secret: "no" },
			} as BrowserElementSelectionPayload),
		).toBeUndefined();
	});

	it("拒绝未知 schema 版本，保持 v1 兼容边界", () => {
		expect(
			readBrowserElementSelectionContext({
				schema: BROWSER_ELEMENT_SELECTION_SCHEMA,
				version: 2,
				payload: validPayload(),
			}),
		).toBeUndefined();
		expect(
			readBrowserElementSelectionContext({
				schema: "vetta.browser.element-box",
				version: 1,
				payload: validPayload(),
			}),
		).toBeUndefined();
	});
});
