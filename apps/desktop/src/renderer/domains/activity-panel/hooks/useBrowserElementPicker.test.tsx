// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { promptAttachmentAtom } from "@shared/store/plugin-atoms";
import {
	BROWSER_ELEMENT_SELECTION_SCHEMA,
	BROWSER_ELEMENT_SELECTION_VERSION,
	type BrowserElementSelectionContext,
} from "@vetta/coding-agent/function-extensions";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BROWSER_ELEMENT_ATTACHMENT_ID, resetBrowserElementDraftForTests } from "../services/browser-element-draft.js";

const insertImageToken = vi.fn();
const removeImageToken = vi.fn();

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@shared/hooks/useShortcuts", () => ({
	useEffectiveShortcut: () => "mod+shift+d",
}));
vi.mock("@shared/shortcuts", () => ({
	useShortcutScope: () => undefined,
}));
vi.mock("@domains/conversation/components/input-bar/editor/inputEditorHandle", () => ({
	insertImageToken: (...args: unknown[]) => insertImageToken(...args),
	removeImageToken: (...args: unknown[]) => removeImageToken(...args),
}));

const { useBrowserElementPicker } = await import("./useBrowserElementPicker.js");

function context(): BrowserElementSelectionContext {
	return {
		schema: BROWSER_ELEMENT_SELECTION_SCHEMA,
		version: BROWSER_ELEMENT_SELECTION_VERSION,
		payload: {
			pageUrl: "https://example.com/form",
			title: "Example",
			elementRef: { id: "e3", pageRevision: 4 },
			pageRevision: 4,
			role: "textbox",
			accessibleName: "Email",
			attributes: { id: "email" },
			domPath: "input#email",
			xpath: '//*[@id="email"]',
			computedStyle: { display: "block" },
			outerHTML: '<input id="email">',
			surroundingText: "Email",
			boundingRect: { x: 8, y: 16, width: 120, height: 24 },
		},
	};
}

describe("useBrowserElementPicker", () => {
	const store = getDefaultStore();
	let listener: ((envelope: unknown) => void) | undefined;

	beforeEach(() => {
		resetBrowserElementDraftForTests();
		store.set(promptAttachmentAtom, null);
		insertImageToken.mockReset();
		removeImageToken.mockReset();
		listener = undefined;
		window.vetta = {
			browserTab: {
				getSession: vi.fn(async () => ({
					ok: true,
					session: {
						workspaceId: "ws-1",
						pageUrl: "https://example.com/form",
						title: "Example",
						pageRevision: 4,
						pickerEnabled: false,
					},
				})),
				setPicker: vi.fn(async ({ enabled }: { enabled: boolean }) => ({ ok: true, pickerEnabled: enabled })),
				cropScreenshot: vi.fn(async () => ({
					ok: true,
					attachmentId: "img-1",
					mimeType: "png",
					width: 40,
					height: 16,
					path: "C:/cache/el.png",
				})),
				onEvent: vi.fn((next: (envelope: unknown) => void) => {
					listener = next;
					return () => {
						listener = undefined;
					};
				}),
			},
		} as unknown as Window["vetta"];
	});

	afterEach(cleanup);

	it("attaches the picked capsule and cropped screenshot to the draft without sending", async () => {
		renderHook(() => useBrowserElementPicker({ workspaceId: "ws-1", hasPage: true }));
		await waitFor(() => expect(listener).toBeTypeOf("function"));
		listener?.({
			workspaceId: "ws-1",
			event: { kind: "picker-result", context: context() },
		});
		await waitFor(() => {
			const attachment = store.get(promptAttachmentAtom);
			expect(attachment?.id).toBe(BROWSER_ELEMENT_ATTACHMENT_ID);
			expect(attachment?.context?.payload).toMatchObject({
				pageUrl: "https://example.com/form",
				role: "textbox",
				domPath: "input#email",
				screenshotAttachmentId: "img-1",
			});
			expect(insertImageToken).toHaveBeenCalledWith("C:/cache/el.png");
		});
		expect(window.vetta.browserTab.cropScreenshot).toHaveBeenCalledWith({
			workspaceId: "ws-1",
			rect: { x: 8, y: 16, width: 120, height: 24 },
			devicePixelRatio: 1,
		});
	});

	it("toggles picker through the frozen IPC and ignores workspaces without a page", async () => {
		const empty = renderHook(() => useBrowserElementPicker({ workspaceId: "ws-1", hasPage: false }));
		empty.result.current.onTogglePicker();
		expect(window.vetta.browserTab.setPicker).not.toHaveBeenCalled();

		const ready = renderHook(() => useBrowserElementPicker({ workspaceId: "ws-1", hasPage: true }));
		await waitFor(() => expect(listener).toBeTypeOf("function"));
		ready.result.current.onTogglePicker();
		await waitFor(() => expect(window.vetta.browserTab.setPicker).toHaveBeenCalledWith({ workspaceId: "ws-1", enabled: true }));
	});
});
