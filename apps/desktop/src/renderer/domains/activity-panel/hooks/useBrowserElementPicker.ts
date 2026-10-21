// Copyright The Open Forge contributors.

import {
	insertImageToken,
	prependPlainText,
	removeImageToken,
} from "@domains/conversation/components/input-bar/editor/inputEditorHandle";
import { useEffectiveShortcut } from "@shared/hooks/useShortcuts";
import { useShortcutScope } from "@shared/shortcuts";
import { promptAttachmentAtom, sendMessageFnRef } from "@shared/store/atoms";
import {
	type BrowserElementLiveEdit,
	type BrowserElementRef,
	type BrowserElementSelectionContext,
	readBrowserElementSelectionContext,
} from "@vetta/coding-agent/function-extensions";
import { useAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BROWSER_ELEMENT_PICKER_TOGGLE_EVENT } from "@/shared/browser-tab-ipc";
import { buildBrowserElementAgentText } from "../services/browser-element-agent-message";
import { applyBrowserElementSelectionToDraft } from "../services/browser-element-draft";

/** 点选命中后的编辑态：胶囊先停在卡片上，确认后才写入输入框附件（TASK-0085）。 */
export interface BrowserElementPickedSelection {
	readonly context: BrowserElementSelectionContext;
	readonly screenshotPath?: string;
}

export function useBrowserElementPicker(input: { workspaceId: string; hasPage: boolean }): {
	pickerEnabled: boolean;
	pickerShortcut: string;
	selection: BrowserElementPickedSelection | null;
	selectionRef: BrowserElementRef | null;
	onTogglePicker: () => void;
	confirmSelection: (
		edits: readonly BrowserElementLiveEdit[],
		options?: { readonly comment?: string; readonly send?: boolean },
	) => void;
	discardSelection: () => void;
} {
	const { t } = useTranslation("chat");
	const workspaceId = input.workspaceId;
	const [pickerEnabled, setPickerEnabled] = useState(false);
	const [selection, setSelection] = useState<BrowserElementPickedSelection | null>(null);
	const [promptAttachment, setPromptAttachment] = useAtom(promptAttachmentAtom);
	const attachmentRef = useRef(promptAttachment);
	attachmentRef.current = promptAttachment;
	const pickerShortcut = useEffectiveShortcut("browser-element-picker");

	const captureSelection = useCallback(
		async (
			context: unknown,
			rect: { x: number; y: number; width: number; height: number },
			devicePixelRatio: number,
		) => {
			const crop = await window.vetta.browserTab.cropScreenshot({
				workspaceId,
				rect,
				devicePixelRatio,
			});
			const nextContext =
				crop.ok && typeof context === "object" && context !== null
					? {
							...context,
							payload: {
								...(context as { payload?: Record<string, unknown> }).payload,
								screenshotAttachmentId: crop.attachmentId,
							},
						}
					: context;
			const parsed = readBrowserElementSelectionContext(nextContext);
			if (!parsed) return;
			setSelection({ context: parsed, ...(crop.ok ? { screenshotPath: crop.path } : {}) });
		},
		[workspaceId],
	);

	useEffect(() => {
		let cancelled = false;
		void window.vetta.browserTab.getSession({ workspaceId }).then((result) => {
			if (!cancelled && result.ok) setPickerEnabled(result.session?.pickerEnabled ?? false);
		});
		const unsubscribe = window.vetta.browserTab.onEvent((envelope) => {
			if (envelope.workspaceId !== workspaceId) return;
			if (envelope.event.kind === "session-changed") {
				setPickerEnabled(envelope.event.session.pickerEnabled);
				return;
			}
			if (envelope.event.kind === "page-revision") {
				// 导航/改版后旧选中引用即失效，页面 DOM 也随之消失。
				setSelection(null);
				return;
			}
			if (envelope.event.kind !== "picker-result") return;
			const { payload } = envelope.event.context;
			void captureSelection(envelope.event.context, payload.boundingRect, 1);
		});
		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, [captureSelection, workspaceId]);

	const togglePicker = useCallback(() => {
		if (!input.hasPage) return;
		void window.vetta.browserTab.setPicker({ workspaceId, enabled: !pickerEnabled }).then((result) => {
			if (result.ok) setPickerEnabled(result.pickerEnabled);
		});
	}, [input.hasPage, pickerEnabled, workspaceId]);

	const confirmSelection = useCallback(
		(edits: readonly BrowserElementLiveEdit[], options?: { comment?: string; send?: boolean }) => {
			if (!selection) return;
			const context: BrowserElementSelectionContext =
				edits.length > 0
					? { ...selection.context, payload: { ...selection.context.payload, liveEdits: [...edits] } }
					: selection.context;
			const screenshotPath = selection.screenshotPath;
			const send = options?.send ? sendMessageFnRef.current : null;
			applyBrowserElementSelectionToDraft(
				{
					getAttachment: () => attachmentRef.current,
					setAttachment: setPromptAttachment,
					insertImage: insertImageToken,
					removeImage: removeImageToken,
				},
				{
					context,
					label: t("browser.elementAttached"),
					...(screenshotPath ? { screenshotPath } : {}),
					...(send ? { stageScreenshot: false } : {}),
				},
			);
			if (send) {
				const text = buildBrowserElementAgentText({
					comment: options?.comment ?? "",
					target: context.payload.accessibleName || context.payload.domPath,
					edits,
				});
				void send(undefined, {
					composed: {
						text,
						...(screenshotPath ? { imagePaths: [screenshotPath] } : {}),
						preserveDraft: true,
					},
				}).then((result) => {
					if (result) return;
					if (screenshotPath) insertImageToken(screenshotPath);
					prependPlainText(`${text}\n\n`);
				});
			}
			setSelection(null);
			void window.vetta.browserTab.setPicker({ workspaceId, enabled: false });
		},
		[selection, setPromptAttachment, t, workspaceId],
	);

	const discardSelection = useCallback(() => {
		setSelection(null);
	}, []);

	useEffect(() => {
		const onToggle = (): void => togglePicker();
		window.addEventListener(BROWSER_ELEMENT_PICKER_TOGGLE_EVENT, onToggle);
		return () => window.removeEventListener(BROWSER_ELEMENT_PICKER_TOGGLE_EVENT, onToggle);
	}, [togglePicker]);

	useShortcutScope({
		id: "app:browser-element-picker",
		kind: "app",
		active: input.hasPage,
		bindings: [
			{
				key: pickerShortcut,
				when: "always",
				run: togglePicker,
			},
		],
	});

	return {
		pickerEnabled,
		pickerShortcut,
		selection,
		selectionRef: selection?.context.payload.elementRef ?? null,
		onTogglePicker: togglePicker,
		confirmSelection,
		discardSelection,
	};
}
