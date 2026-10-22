// Copyright The Open Forge contributors.

import {
	focusInputEditor,
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
import {
	BROWSER_ELEMENT_PICKER_TOGGLE_EVENT,
	DESKTOP_BROWSER_ANNOTATION_CHROME_FALLBACK,
	type DesktopBrowserAnnotationChrome,
} from "@/shared/browser-tab-ipc";
import { buildBrowserElementAgentText } from "../services/browser-element-agent-message";
import { applyBrowserElementSelectionToDraft } from "../services/browser-element-draft";

/** 网页里的批注用不到应用样式表，这里读取当前主题已经算好的颜色。 */
function readAnnotationChrome(): DesktopBrowserAnnotationChrome {
	const style = getComputedStyle(document.documentElement);
	const read = (name: keyof DesktopBrowserAnnotationChrome, variable: string): string => {
		const value = style.getPropertyValue(variable).replace(/\s+/g, " ").trim();
		if (!value || value.length > 240 || /[;{}<>]|url\s*\(|expression\s*\(/i.test(value)) {
			return DESKTOP_BROWSER_ANNOTATION_CHROME_FALLBACK[name];
		}
		return value;
	};
	return {
		background: read("background", "--popover"),
		foreground: read("foreground", "--popover-foreground"),
		border: read("border", "--border"),
		primary: read("primary", "--primary"),
		primaryForeground: read("primaryForeground", "--primary-foreground"),
		muted: read("muted", "--muted-foreground"),
		destructive: read("destructive", "--destructive"),
		radius: read("radius", "--radius"),
		shadow: read("shadow", "--shadow-md"),
		font: read("font", "--font-sans"),
		ring: read("ring", "--ring"),
	};
}

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

	const deliverSelection = useCallback(
		(
			context: BrowserElementSelectionContext,
			screenshotPath: string | undefined,
			edits: readonly BrowserElementLiveEdit[],
			options?: { comment?: string; send?: boolean },
		) => {
			const nextContext: BrowserElementSelectionContext =
				edits.length > 0 ? { ...context, payload: { ...context.payload, liveEdits: [...edits] } } : context;
			const send = options?.send ? sendMessageFnRef.current : null;
			applyBrowserElementSelectionToDraft(
				{
					getAttachment: () => attachmentRef.current,
					setAttachment: setPromptAttachment,
					insertImage: insertImageToken,
					removeImage: removeImageToken,
				},
				{
					context: nextContext,
					label: t("browser.elementAttached"),
					...(screenshotPath ? { screenshotPath } : {}),
					...(send ? { stageScreenshot: false } : {}),
				},
			);
			const text = buildBrowserElementAgentText({
				comment: options?.comment ?? "",
				target: nextContext.payload.accessibleName || nextContext.payload.domPath,
				edits,
			});
			if (send) {
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
				return;
			}
			if (typeof options?.comment === "string") prependPlainText(`${text}\n\n`);
		},
		[setPromptAttachment, t],
	);

	const captureSelection = useCallback(
		async (
			context: unknown,
			rect: { x: number; y: number; width: number; height: number },
			devicePixelRatio: number,
			comment?: string,
			placement?: "input" | "annotation",
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
			const screenshotPath = crop.ok ? crop.path : undefined;
			if (placement === "input") {
				deliverSelection(parsed, screenshotPath, [], { send: false });
				focusInputEditor();
				return;
			}
			if (typeof comment === "string") {
				deliverSelection(parsed, screenshotPath, [], { comment, send: true });
				return;
			}
			setSelection({ context: parsed, ...(crop.ok ? { screenshotPath: crop.path } : {}) });
		},
		[deliverSelection, workspaceId],
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
			const comment = envelope.event.comment;
			void captureSelection(envelope.event.context, payload.boundingRect, 1, comment, envelope.event.placement);
		});
		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, [captureSelection, workspaceId]);

	const togglePicker = useCallback(() => {
		if (!input.hasPage) return;
		void window.vetta.browserTab
			.setPicker({
				workspaceId,
				enabled: !pickerEnabled,
				annotation: {
					placeholder: t("browser.liveEdit.commentPlaceholder"),
					send: t("browser.liveEdit.send"),
					selectedCount: t("browser.liveEdit.selectedCount"),
					selectionLimit: t("browser.liveEdit.selectionLimit"),
					chrome: readAnnotationChrome(),
				},
			})
			.then((result) => {
				if (result.ok) setPickerEnabled(result.pickerEnabled);
			});
	}, [input.hasPage, pickerEnabled, t, workspaceId]);

	const confirmSelection = useCallback(
		(edits: readonly BrowserElementLiveEdit[], options?: { comment?: string; send?: boolean }) => {
			if (!selection) return;
			deliverSelection(selection.context, selection.screenshotPath, edits, options);
			setSelection(null);
			void window.vetta.browserTab.setPicker({ workspaceId, enabled: false });
		},
		[deliverSelection, selection, workspaceId],
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
