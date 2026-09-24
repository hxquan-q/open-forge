// Copyright The Open Forge contributors.
import type { BrowserElementRef } from "@vetta/coding-agent/function-extensions";
import { readBrowserElementRef } from "@vetta/coding-agent/function-extensions";

export type ElementRefValidation =
	| { readonly ok: true; readonly ref: BrowserElementRef }
	| { readonly ok: false; readonly code: "stale_reference" | "no_browser_session" | "invalid_input" };

export function createBrowserElementRef(pageRevision: number, nextId: number): BrowserElementRef {
	return { id: `e${nextId}`, pageRevision };
}

export function validateBrowserElementRef(
	ref: unknown,
	session: { readonly pageRevision: number } | null,
): ElementRefValidation {
	if (!session) return { ok: false, code: "no_browser_session" };
	const parsed = readBrowserElementRef(ref);
	if (!parsed) return { ok: false, code: "invalid_input" };
	if (parsed.pageRevision !== session.pageRevision) return { ok: false, code: "stale_reference" };
	return { ok: true, ref: parsed };
}
