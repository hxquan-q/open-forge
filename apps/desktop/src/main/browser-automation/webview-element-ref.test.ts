// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { createBrowserElementRef, validateBrowserElementRef } from "./webview-element-ref.js";

describe("in-app browser element refs", () => {
	it("embeds the current pageRevision and rejects a stale copy after navigation", () => {
		const ref = createBrowserElementRef(3, 1);
		expect(ref).toEqual({ id: "e1", pageRevision: 3 });
		expect(validateBrowserElementRef(ref, { pageRevision: 3 })).toEqual({ ok: true, ref });
		expect(validateBrowserElementRef(ref, { pageRevision: 4 })).toEqual({
			ok: false,
			code: "stale_reference",
		});
	});

	it("accepts the encoded token form the agent tool prints back", () => {
		expect(validateBrowserElementRef("v1:3:e1", { pageRevision: 3 })).toEqual({
			ok: true,
			ref: { id: "e1", pageRevision: 3 },
		});
		expect(validateBrowserElementRef("v1:4:e1", { pageRevision: 3 })).toEqual({
			ok: false,
			code: "stale_reference",
		});
		expect(validateBrowserElementRef("e1", { pageRevision: 3 })).toEqual({ ok: false, code: "invalid_input" });
	});

	it("does not relocate a missing session or a malformed ref", () => {
		expect(validateBrowserElementRef({ id: "e1", pageRevision: 1 }, null)).toEqual({
			ok: false,
			code: "no_browser_session",
		});
		expect(validateBrowserElementRef({ id: "e1" }, { pageRevision: 1 })).toEqual({
			ok: false,
			code: "invalid_input",
		});
	});
});
