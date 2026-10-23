// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { sendMessageFnRef } from "@shared/store/atoms";
import { promptAttachmentAtom } from "@shared/store/plugin-atoms";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import {
	BROWSER_ELEMENT_SELECTION_SCHEMA,
	BROWSER_ELEMENT_SELECTION_VERSION,
	type BrowserElementSelectionContext,
} from "@vetta/coding-agent/function-extensions";
import { getDefaultStore } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesktopBrowserTabGetSessionResult } from "@/shared/browser-tab-ipc";
import { DESKTOP_BROWSER_ANNOTATION_CHROME_FALLBACK } from "@/shared/browser-tab-ipc";
import {
	BROWSER_ELEMENT_ATTACHMENT_ID,
	resetBrowserElementDraftForTests,
} from "../services/browser-element-draft.js";

const insertImageToken = vi.fn();
const removeImageToken = vi.fn();

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@shared/hooks/useShortcuts", () => ({
	useEffectiveShortcut: () => "mod+shift+d",
}));
vi.mock("@shared/shortcuts", () => ({
	useShortcutScope: () => undefined,
}));
const prependPlainText = vi.fn();

const focusInputEditor = vi.fn();

vi.mock(
	"@domains/conversation/components/input-bar/editor/inputEditorHandle",
	() => ({
		insertImageToken: (...args: unknown[]) => insertImageToken(...args),
		removeImageToken: (...args: unknown[]) => removeImageToken(...args),
		prependPlainText: (...args: unknown[]) => prependPlainText(...args),
		focusInputEditor: () => focusInputEditor(),
	}),
);

const { useBrowserElementPicker } = await import(
	"./useBrowserElementPicker.js"
);

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
		prependPlainText.mockReset();
		focusInputEditor.mockReset();
		sendMessageFnRef.current = null;
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
				setPicker: vi.fn(async ({ enabled }: { enabled: boolean }) => ({
					ok: true,
					pickerEnabled: enabled,
				})),
				liveEdit: vi.fn(async () => ({
					ok: true,
					edits: [],
					hasElement: true,
				})),
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

	it("projects live Agent activity without letting an older session query overwrite it", async () => {
		let finishQuery:
			| ((value: DesktopBrowserTabGetSessionResult) => void)
			| undefined;
		vi.mocked(window.vetta.browserTab.getSession).mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finishQuery = resolve;
				}),
		);
		const { result } = renderHook(() =>
			useBrowserElementPicker({ workspaceId: "ws-1", hasPage: true }),
		);
		await waitFor(() => expect(listener).toBeTypeOf("function"));
		const session = {
			workspaceId: "ws-1",
			pageUrl: "https://example.com",
			title: "Example",
			pageRevision: 4,
			pickerEnabled: false,
		};
		act(() =>
			listener?.({
				workspaceId: "ws-1",
				event: {
					kind: "session-changed",
					session: {
						...session,
						agentActivity: { action: "snapshot", activeCount: 1 },
					},
				},
			}),
		);
		expect(result.current.agentActivity).toEqual({
			action: "snapshot",
			activeCount: 1,
		});
		await act(async () => finishQuery?.({ ok: true, session }));
		expect(result.current.agentActivity).toEqual({
			action: "snapshot",
			activeCount: 1,
		});
		act(() =>
			listener?.({
				workspaceId: "ws-other",
				event: {
					kind: "session-changed",
					session: { ...session, workspaceId: "ws-other" },
				},
			}),
		);
		expect(result.current.agentActivity?.action).toBe("snapshot");
		act(() =>
			listener?.({
				workspaceId: "ws-1",
				event: { kind: "session-changed", session },
			}),
		);
		expect(result.current.agentActivity).toBeUndefined();
	});

	it("点选命中后先停在选择态、不立即附加；确认后才把胶囊（含 liveEdits）写入草稿", async () => {
		const { result } = renderHook(() =>
			useBrowserElementPicker({ workspaceId: "ws-1", hasPage: true }),
		);
		await waitFor(() => expect(listener).toBeTypeOf("function"));
		listener?.({
			workspaceId: "ws-1",
			event: { kind: "picker-result", context: context() },
		});
		// 选中即截图并打开编辑卡，但草稿附件尚未写入
		await waitFor(() =>
			expect(result.current.selection?.context.payload.domPath).toBe(
				"input#email",
			),
		);
		expect(store.get(promptAttachmentAtom)).toBeNull();
		expect(result.current.selectionRef).toEqual({ id: "e3", pageRevision: 4 });

		act(() => {
			result.current.confirmSelection([
				{
					kind: "style",
					property: "color",
					before: "",
					after: "red",
					target: "input#email",
				},
				{ kind: "text", before: "Old", after: "New", target: "input#email" },
			]);
		});
		await waitFor(() => {
			const attachment = store.get(promptAttachmentAtom);
			expect(attachment?.id).toBe(BROWSER_ELEMENT_ATTACHMENT_ID);
			expect(attachment?.context?.payload).toMatchObject({
				pageUrl: "https://example.com/form",
				role: "textbox",
				domPath: "input#email",
				screenshotAttachmentId: "img-1",
				liveEdits: [
					{
						kind: "style",
						property: "color",
						before: "",
						after: "red",
						target: "input#email",
					},
					{ kind: "text", before: "Old", after: "New", target: "input#email" },
				],
			});
			expect(insertImageToken).toHaveBeenCalledWith("C:/cache/el.png");
		});
		expect(result.current.selection).toBeNull();
		expect(window.vetta.browserTab.setPicker).toHaveBeenCalledWith({
			workspaceId: "ws-1",
			enabled: false,
		});
		expect(window.vetta.browserTab.cropScreenshot).toHaveBeenCalledWith({
			workspaceId: "ws-1",
			rect: { x: 8, y: 16, width: 120, height: 24 },
			devicePixelRatio: 1,
		});
	});

	it("放弃选择不写附件；页面翻页事件清空失效的选中态", async () => {
		const { result } = renderHook(() =>
			useBrowserElementPicker({ workspaceId: "ws-1", hasPage: true }),
		);
		await waitFor(() => expect(listener).toBeTypeOf("function"));
		listener?.({
			workspaceId: "ws-1",
			event: { kind: "picker-result", context: context() },
		});
		await waitFor(() => expect(result.current.selection).not.toBeNull());

		act(() => {
			result.current.discardSelection();
		});
		expect(result.current.selection).toBeNull();
		expect(store.get(promptAttachmentAtom)).toBeNull();

		listener?.({
			workspaceId: "ws-1",
			event: { kind: "picker-result", context: context() },
		});
		await waitFor(() => expect(result.current.selection).not.toBeNull());
		listener?.({
			workspaceId: "ws-1",
			event: { kind: "page-revision", workspaceId: "ws-1", pageRevision: 5 },
		});
		await waitFor(() => expect(result.current.selection).toBeNull());
	});

	it("toggles picker through the frozen IPC and ignores workspaces without a page", async () => {
		const empty = renderHook(() =>
			useBrowserElementPicker({ workspaceId: "ws-1", hasPage: false }),
		);
		empty.result.current.onTogglePicker();
		expect(window.vetta.browserTab.setPicker).not.toHaveBeenCalled();

		const ready = renderHook(() =>
			useBrowserElementPicker({ workspaceId: "ws-1", hasPage: true }),
		);
		await waitFor(() => expect(listener).toBeTypeOf("function"));
		ready.result.current.onTogglePicker();
		await waitFor(() =>
			expect(window.vetta.browserTab.setPicker).toHaveBeenCalledWith({
				workspaceId: "ws-1",
				enabled: true,
				annotation: {
					placeholder: "browser.liveEdit.commentPlaceholder",
					send: "browser.liveEdit.send",
					selectedCount: "browser.liveEdit.selectedCount",
					selectionLimit: "browser.liveEdit.selectionLimit",
					chrome: DESKTOP_BROWSER_ANNOTATION_CHROME_FALLBACK,
				},
			}),
		);
	});

	it("发送给 Agent 时发起带评论的会话，截图不先写入草稿；发送未启动则把正文留在输入框", async () => {
		const send = vi.fn(async () => undefined);
		sendMessageFnRef.current = send;
		const { result } = renderHook(() =>
			useBrowserElementPicker({ workspaceId: "ws-1", hasPage: true }),
		);
		await waitFor(() => expect(listener).toBeTypeOf("function"));
		listener?.({
			workspaceId: "ws-1",
			event: { kind: "picker-result", context: context() },
		});
		await waitFor(() => expect(result.current.selection).not.toBeNull());

		act(() => {
			result.current.confirmSelection([], {
				comment: "把按钮改成蓝色",
				send: true,
			});
		});

		expect(send).toHaveBeenCalledWith(undefined, {
			composed: {
				text: "把按钮改成蓝色",
				imagePaths: ["C:/cache/el.png"],
				preserveDraft: true,
			},
		});
		expect(insertImageToken).not.toHaveBeenCalled();
		expect(store.get(promptAttachmentAtom)?.context?.payload).toMatchObject({
			accessibleName: "Email",
			domPath: "input#email",
		});
		await waitFor(() =>
			expect(prependPlainText).toHaveBeenCalledWith("把按钮改成蓝色\n\n"),
		);
		expect(insertImageToken).toHaveBeenCalledWith("C:/cache/el.png");
	});

	it("页面旁批注提交后把元素和这句话发给 Agent，不再停在页面下方的卡片", async () => {
		const send = vi.fn(async () => ({ status: "sent" as const }));
		sendMessageFnRef.current = send;
		const { result } = renderHook(() =>
			useBrowserElementPicker({ workspaceId: "ws-1", hasPage: true }),
		);
		await waitFor(() => expect(listener).toBeTypeOf("function"));
		listener?.({
			workspaceId: "ws-1",
			event: {
				kind: "picker-result",
				context: context(),
				comment: "把按钮改成蓝色",
			},
		});
		await waitFor(() =>
			expect(send).toHaveBeenCalledWith(undefined, {
				composed: {
					text: "把按钮改成蓝色",
					imagePaths: ["C:/cache/el.png"],
					preserveDraft: true,
				},
			}),
		);
		expect(result.current.selection).toBeNull();
	});

	it("Alt+点击只把元素放进输入框并聚焦，不发送", async () => {
		const send = vi.fn(async () => ({ status: "sent" as const }));
		sendMessageFnRef.current = send;
		const { result } = renderHook(() =>
			useBrowserElementPicker({ workspaceId: "ws-1", hasPage: true }),
		);
		await waitFor(() => expect(listener).toBeTypeOf("function"));
		listener?.({
			workspaceId: "ws-1",
			event: { kind: "picker-result", context: context(), placement: "input" },
		});
		await waitFor(() =>
			expect(store.get(promptAttachmentAtom)?.context?.payload).toMatchObject({
				domPath: "input#email",
			}),
		);
		expect(send).not.toHaveBeenCalled();
		expect(focusInputEditor).toHaveBeenCalled();
		expect(result.current.selection).toBeNull();
	});
});
