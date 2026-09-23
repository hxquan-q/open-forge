// Copyright The Open Forge contributors.

import {
	insertImageToken,
	removeImageToken,
} from "@domains/conversation/components/input-bar/editor/inputEditorHandle";
import { useEffectiveShortcut } from "@shared/hooks/useShortcuts";
import { useShortcutScope } from "@shared/shortcuts";
import { promptAttachmentAtom } from "@shared/store/plugin-atoms";
import { useAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BROWSER_ELEMENT_PICKER_TOGGLE_EVENT } from "@/shared/browser-tab-ipc";
import { applyBrowserElementSelectionToDraft } from "../services/browser-element-draft";

export function useBrowserElementPicker(input: { workspaceId: string; hasPage: boolean }): {
	pickerEnabled: boolean;
	pickerShortcut: string;
	onTogglePicker: () => void;
} {
	const { t } = useTranslation("chat");
	const workspaceId = input.workspaceId;
	const [pickerEnabled, setPickerEnabled] = useState(false);
	const [promptAttachment, setPromptAttachment] = useAtom(promptAttachmentAtom);
	const attachmentRef = useRef(promptAttachment);
	attachmentRef.current = promptAttachment;
	const pickerShortcut = useEffectiveShortcut("browser-element-picker");

	const applyResult = useCallback(
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
					...(crop.ok ? { screenshotPath: crop.path } : {}),
				},
			);
		},
		[setPromptAttachment, t, workspaceId],
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
			if (envelope.event.kind !== "picker-result") return;
			const { payload } = envelope.event.context;
			void applyResult(envelope.event.context, payload.boundingRect, 1);
		});
		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, [applyResult, workspaceId]);

	const togglePicker = useCallback(() => {
		if (!input.hasPage) return;
		void window.vetta.browserTab.setPicker({ workspaceId, enabled: !pickerEnabled }).then((result) => {
			if (result.ok) setPickerEnabled(result.pickerEnabled);
		});
	}, [input.hasPage, pickerEnabled, workspaceId]);

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
		onTogglePicker: togglePicker,
	};
}
