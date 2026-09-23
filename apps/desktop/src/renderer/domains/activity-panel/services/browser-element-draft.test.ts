// Copyright The Open Forge contributors.
import type { RegisteredPromptAttachment } from "@shared/store/atoms";
import {
	BROWSER_ELEMENT_SELECTION_SCHEMA,
	BROWSER_ELEMENT_SELECTION_VERSION,
	type BrowserElementSelectionContext,
} from "@vetta/coding-agent/function-extensions";
import { beforeEach, describe, expect, it } from "vitest";
import {
	applyBrowserElementSelectionToDraft,
	createBrowserElementAttachment,
	isBrowserElementAttachment,
	readLastBrowserScreenshotPathForTests,
	resetBrowserElementDraftForTests,
} from "./browser-element-draft.js";

function context(name: string): BrowserElementSelectionContext {
	return {
		schema: BROWSER_ELEMENT_SELECTION_SCHEMA,
		version: BROWSER_ELEMENT_SELECTION_VERSION,
		payload: {
			pageUrl: "https://example.com/form",
			title: "Example",
			elementRef: { id: "e1", pageRevision: 2 },
			pageRevision: 2,
			role: "textbox",
			accessibleName: name,
			attributes: { id: "email" },
			domPath: "input#email",
			xpath: '//*[@id="email"]',
			computedStyle: { display: "block" },
			outerHTML: '<input id="email">',
			surroundingText: "Email",
			boundingRect: { x: 1, y: 2, width: 3, height: 4 },
		},
	};
}

describe("browser element draft attachment", () => {
	beforeEach(() => resetBrowserElementDraftForTests());

	it("replaces the previous capsule and screenshot without sending", () => {
		let attachment: RegisteredPromptAttachment | null = createBrowserElementAttachment(
			context("Old"),
			"已附加页面元素",
		);
		const images: string[] = [];
		const ports = {
			getAttachment: () => attachment,
			setAttachment: (next: RegisteredPromptAttachment | null) => {
				attachment = next;
			},
			insertImage: (path: string) => {
				images.push(path);
			},
			removeImage: (path: string) => {
				const index = images.indexOf(path);
				if (index >= 0) images.splice(index, 1);
			},
		};

		applyBrowserElementSelectionToDraft(ports, {
			context: context("First"),
			label: "已附加页面元素",
			screenshotPath: "/cache/one.png",
		});
		expect(isBrowserElementAttachment(attachment)).toBe(true);
		expect(attachment?.labels).toEqual(["First"]);
		expect(images).toEqual(["/cache/one.png"]);

		applyBrowserElementSelectionToDraft(ports, {
			context: context("Second"),
			label: "已附加页面元素",
			screenshotPath: "/cache/two.png",
		});
		expect(attachment?.labels).toEqual(["Second"]);
		expect(images).toEqual(["/cache/two.png"]);
		expect(readLastBrowserScreenshotPathForTests()).toBe("/cache/two.png");
	});

	it("rejects an invalid capsule and leaves the draft untouched", () => {
		let attachment: RegisteredPromptAttachment | null = null;
		const result = applyBrowserElementSelectionToDraft(
			{
				getAttachment: () => attachment,
				setAttachment: (next: RegisteredPromptAttachment | null) => {
					attachment = next;
				},
				insertImage: () => undefined,
				removeImage: () => undefined,
			},
			{ context: { schema: "nope", version: 1, payload: {} }, label: "x" },
		);
		expect(result).toBeUndefined();
		expect(attachment).toBeNull();
	});
});
