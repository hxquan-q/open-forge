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
	type DesktopBrowserTabSession,
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
	agentActivity: DesktopBrowserTabSession["agentActivity"];
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
	const [session, setSession] = useState<DesktopBrowserTabSession | null>(null);
	/** 镜像最新已应用会话：React 19 对 no-op setState 仍会提交一次，投影未变时
	 * 必须在调用 setState 之前短路。 */
	const sessionRef = useRef<DesktopBrowserTabSession | null>(null);
	const pickerToggleSeqRef = useRef(0);
	/** 可观察投影：点选开关与 Agent 动作名（activeCount 不展示）。导航/重订正等只改
	 * pageRevision/title 的事件不再触发面板重渲。 */
	const applySession = useCallback((next: DesktopBrowserTabSession | null) => {
		const previous = sessionRef.current;
		if (previous != null && next != null) {
			const sameProjection =
				previous.workspaceId === next.workspaceId &&
				previous.pickerEnabled === next.pickerEnabled &&
				previous.agentActivity?.action === next.agentActivity?.action;
			if (sameProjection) return;
		}
		sessionRef.current = next;
		setSession(next);
	}, []);
	const activeSession = session?.workspaceId === workspaceId ? session : null;
	const pickerEnabled = activeSession?.pickerEnabled ?? false;
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

	const captureSelectionRef = useRef(captureSelection);
	captureSelectionRef.current = captureSelection;
	useEffect(() => {
		let cancelled = false;
		let receivedSessionEvent = false;
		void window.vetta.browserTab.getSession({ workspaceId }).then((result) => {
			if (!cancelled && !receivedSessionEvent && result.ok) applySession(result.session);
		});
		const unsubscribe = window.vetta.browserTab.onEvent((envelope) => {
			if (envelope.workspaceId !== workspaceId) return;
			if (envelope.event.kind === "session-changed") {
				receivedSessionEvent = true;
				// 会话事件是权威：任何在途点选开关的乐观合并就此失效。
				pickerToggleSeqRef.current += 1;
				applySession(envelope.event.session);
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
			void captureSelectionRef.current(
				envelope.event.context,
				payload.boundingRect,
				1,
				comment,
				envelope.event.placement,
			);
		});
		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, [workspaceId, applySession]);

	const togglePicker = useCallback(() => {
		if (!input.hasPage) return;
		// 序号 + 工作空间双重校验：迟到的开关响应既不得倒灌更新的会话，也不得跨工作空间污染。
		const requestWorkspace = workspaceId;
		const sequence = ++pickerToggleSeqRef.current;
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
				if (
					!result.ok ||
					sequence !== pickerToggleSeqRef.current ||
					sessionRef.current?.workspaceId !== requestWorkspace
				) {
					return;
				}
				// 乐观同步开关；主进程随后的 session-changed 会被投影等值短路。
				if (result.ok) {
					const previous = sessionRef.current;
					if (previous && previous.pickerEnabled !== result.pickerEnabled) {
						const merged = { ...previous, pickerEnabled: result.pickerEnabled };
						sessionRef.current = merged;
						setSession(merged);
					}
				}
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
		agentActivity: activeSession?.agentActivity,
		pickerShortcut,
		selection,
		selectionRef: selection?.context.payload.elementRef ?? null,
		onTogglePicker: togglePicker,
		confirmSelection,
		discardSelection,
	};
}
