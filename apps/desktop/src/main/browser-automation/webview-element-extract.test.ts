// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { BROWSER_ELEMENT_OUTER_HTML_MAX_CHARS } from "@vetta/coding-agent/function-extensions";
import { afterEach, describe, expect, it } from "vitest";
import {
	buildDomPath,
	buildXPath,
	extractBrowserElement,
	readBrowserElementSourceHint,
	readExtractedBrowserElement,
	sanitizeOuterHTML,
} from "./webview-element-extract.js";

function mount(html: string): HTMLElement {
	document.body.innerHTML = html;
	const root = document.body.firstElementChild;
	if (!(root instanceof HTMLElement)) throw new Error("expected fixture root");
	return root;
}

afterEach(() => {
	document.body.innerHTML = "";
});

describe("browser element extract", () => {
	it("keeps a stable id-based domPath and xpath for a unique input", () => {
		mount(`<form id="login"><label for="email">Email</label><input id="email" name="email" type="email"></form>`);
		const input = document.getElementById("email");
		if (!input) throw new Error("missing input");
		expect(buildDomPath(input, document)).toBe("input#email");
		expect(buildXPath(input, document)).toBe('//*[@id="email"]');
		const extracted = extractBrowserElement(input, document, window);
		expect(extracted.role).toBe("textbox");
		expect(extracted.accessibleName).toBe("Email");
		expect(extracted.attributes).toMatchObject({ id: "email", name: "email", type: "email" });
	});

	it("reads React, Vue and attribute source locations, and drops javascript urls", () => {
		const button = mount(`<button id="save" data-insp-path="javascript:alert(1)">Save</button>`);
		expect(readBrowserElementSourceHint(button)).toBeUndefined();
		Object.assign(button, {
			__reactFiber$test: {
				_debugSource: { fileName: "file://src/SaveButton.tsx", lineNumber: 8, columnNumber: 2 },
				type: { displayName: "SaveButton" },
			},
		});
		expect(readBrowserElementSourceHint(button)).toEqual({
			kind: "react",
			file: "src/SaveButton.tsx",
			line: 8,
			column: 2,
			component: "SaveButton",
		});

		const vue = mount(`<p id="label">Hi</p>`);
		Object.assign(vue, { __vueParentComponent: { type: { __file: "src/Label.vue", name: "Label" } } });
		expect(extractBrowserElement(vue, document, window).sourceHint).toEqual({
			kind: "vue",
			file: "src/Label.vue",
			component: "Label",
		});
	});

	it("uses nth-of-type when siblings share a tag and have no unique id", () => {
		mount(`<nav><button>One</button><button id="second">Two</button></nav>`);
		const second = document.getElementById("second");
		if (!second) throw new Error("missing button");
		expect(buildDomPath(second, document)).toBe("button#second");
		const first = document.querySelector("button");
		if (!first) throw new Error("missing first button");
		expect(buildDomPath(first, document)).toBe("body > nav > button:nth-of-type(1)");
		expect(buildXPath(first, document)).toContain("/button[1]");
	});

	it("strips scripts and event handlers and masks password values", () => {
		const dirty = '<input type="password" value="hunter2" onclick="steal()"><script>document.cookie</script>';
		expect(sanitizeOuterHTML(dirty, true)).not.toContain("hunter2");
		expect(sanitizeOuterHTML(dirty, true)).not.toContain("onclick");
		expect(sanitizeOuterHTML(dirty, true)).not.toContain("document.cookie");
		expect(sanitizeOuterHTML(dirty, true)).toContain('value="••••"');
	});

	it("does not keep value, cookie, or unknown style keys from guest payloads", () => {
		mount(`<input id="token" name="token" type="text" value="secret-token">`);
		const input = document.getElementById("token");
		if (!input) throw new Error("missing token");
		const extracted = extractBrowserElement(input, document, window);
		expect(extracted.attributes).not.toHaveProperty("value");
		expect(extracted.outerHTML).toContain("••••");
		expect(
			readExtractedBrowserElement({
				...extracted,
				attributes: { ...extracted.attributes, value: "nope" },
				computedStyle: { ...extracted.computedStyle, transform: "none" },
			}),
		).toMatchObject({
			attributes: expect.not.objectContaining({ value: "nope" }),
			computedStyle: expect.not.objectContaining({ transform: "none" }),
		});
	});

	it("caps outerHTML at the frozen 8KB contract", () => {
		const oversized = `<div>${"x".repeat(BROWSER_ELEMENT_OUTER_HTML_MAX_CHARS + 80)}</div>`;
		expect(sanitizeOuterHTML(oversized, false).length).toBe(BROWSER_ELEMENT_OUTER_HTML_MAX_CHARS);
	});
});
