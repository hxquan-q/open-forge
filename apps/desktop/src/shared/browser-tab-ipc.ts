// Copyright The Open Forge contributors.
import {
	BROWSER_SCREENSHOT_FORMAT,
	BROWSER_SCREENSHOT_MAX_LONG_EDGE_PX,
	type BrowserElementLiveEdit,
	type BrowserElementRef,
	type BrowserElementSelectionContext,
} from "@vetta/coding-agent/function-extensions";
import { type DesktopIpcUnimplemented, unimplementedDesktopIpcResult } from "./desktop-ipc-result.js";

/** Browser picker / WebView 会话桥 / 截图裁剪 IPC。 */
export const BROWSER_TAB_CHANNELS = {
	GET_SESSION: "vetta:browser-tab:session",
	SET_PICKER: "vetta:browser-tab:set-picker",
	CROP_SCREENSHOT: "vetta:browser-tab:crop-screenshot",
	LIVE_EDIT: "vetta:browser-tab:live-edit",
	EVENT: "vetta:browser-tab:event",
} as const;

export const IN_APP_BROWSER_PARTITION = "persist:vetta-browser";

/** Host renderer event for the frozen `browser-element-picker` app shortcut. */
export const BROWSER_ELEMENT_PICKER_TOGGLE_EVENT = "vetta:browser-element-picker";

export const DESKTOP_BROWSER_SCREENSHOT_MAX_LONG_EDGE_PX = BROWSER_SCREENSHOT_MAX_LONG_EDGE_PX;
export const DESKTOP_BROWSER_SCREENSHOT_FORMAT = BROWSER_SCREENSHOT_FORMAT;

export interface DesktopBrowserTabSession {
	readonly workspaceId: string;
	readonly pageUrl: string;
	readonly title: string;
	readonly pageRevision: number;
	readonly pickerEnabled: boolean;
}

export interface DesktopBrowserTabGetSessionRequest {
	readonly workspaceId: string;
}

/**
 * 批注画在网页内部，读不到应用的 CSS 变量，所以由宿主把当前主题色传进去。
 * 字段对应浮层：popover 底、1px border、shadow-md、主按钮、输入聚焦 ring。
 */
export interface DesktopBrowserAnnotationChrome {
	readonly background: string;
	readonly foreground: string;
	readonly border: string;
	readonly primary: string;
	readonly primaryForeground: string;
	readonly muted: string;
	readonly destructive: string;
	readonly radius: string;
	readonly shadow: string;
	readonly font: string;
	readonly ring: string;
}

/**
 * 出厂 mono 暗色。宿主还没把算好的变量传进来时使用。
 * 色值对齐 `themes/mono.ts` 的 dark 与 `styles.css` 的 `--shadow-md` / `--font-sans` / `--radius`。
 */
export const DESKTOP_BROWSER_ANNOTATION_CHROME_FALLBACK: DesktopBrowserAnnotationChrome = {
	background: "rgb(28, 28, 28)",
	foreground: "rgb(208, 208, 208)",
	border: "rgb(42, 42, 42)",
	primary: "rgb(228, 228, 228)",
	primaryForeground: "rgb(8, 8, 10)",
	muted: "rgb(128, 128, 128)",
	destructive: "rgb(255, 91, 91)",
	radius: "0.5rem",
	shadow: "0px 1px 2px 0px hsl(0 0% 0% / 0.18), 0px 2px 4px -1px hsl(0 0% 0% / 0.18)",
	font: '-apple-system, "SF Pro Text", "SF Pro Display", "Helvetica Neue", sans-serif',
	ring: "rgb(228, 228, 228)",
};

export interface DesktopBrowserAnnotationLabels {
	readonly placeholder: string;
	readonly send: string;
	readonly selectedCount?: string;
	readonly selectionLimit?: string;
	readonly chrome?: DesktopBrowserAnnotationChrome;
}

export interface DesktopBrowserTabSetPickerRequest {
	readonly workspaceId: string;
	readonly enabled: boolean;
	readonly annotation?: DesktopBrowserAnnotationLabels;
}

export interface DesktopBrowserCropRect {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export interface DesktopBrowserCropScreenshotRequest {
	readonly workspaceId: string;
	readonly rect: DesktopBrowserCropRect;
	readonly devicePixelRatio: number;
}

export type DesktopBrowserTabGetSessionResult =
	| { readonly ok: true; readonly session: DesktopBrowserTabSession | null }
	| DesktopIpcUnimplemented;

export type DesktopBrowserTabSetPickerResult =
	| { readonly ok: true; readonly pickerEnabled: boolean }
	| DesktopIpcUnimplemented;

export type DesktopBrowserCropScreenshotResult =
	| {
			readonly ok: true;
			readonly attachmentId: string;
			readonly mimeType: typeof DESKTOP_BROWSER_SCREENSHOT_FORMAT;
			readonly width: number;
			readonly height: number;
			readonly path: string;
	  }
	| { readonly ok: false; readonly code: "no_browser_session" | "crop_failed"; readonly message: string }
	| DesktopIpcUnimplemented;

/** 页面内即时预览改动（TASK-0085）：只改 WebView DOM，不写源码。 */
export type DesktopBrowserLiveEditCommand =
	| { readonly kind: "style"; readonly property: string; readonly value: string }
	| { readonly kind: "text"; readonly value: string };

export type DesktopBrowserLiveEditAction =
	| { readonly type: "apply"; readonly edit: DesktopBrowserLiveEditCommand }
	| { readonly type: "revert"; readonly index?: number }
	| { readonly type: "state" };

export interface DesktopBrowserTabLiveEditRequest {
	readonly workspaceId: string;
	readonly elementRef: BrowserElementRef;
	readonly action: DesktopBrowserLiveEditAction;
}

export type DesktopBrowserTabLiveEditResult =
	| { readonly ok: true; readonly edits: readonly BrowserElementLiveEdit[]; readonly hasElement: boolean }
	| {
			readonly ok: false;
			readonly code: "no_browser_session" | "stale_reference" | "invalid_input" | "apply_failed";
			readonly message: string;
	  }
	| DesktopIpcUnimplemented;

export type DesktopBrowserTabEvent =
	| { readonly kind: "session-changed"; readonly session: DesktopBrowserTabSession }
	| {
			readonly kind: "picker-result";
			readonly context: BrowserElementSelectionContext;
			readonly comment?: string;
			readonly placement?: "input" | "annotation";
	  }
	| { readonly kind: "page-revision"; readonly workspaceId: string; readonly pageRevision: number };

export interface DesktopBrowserTabEventEnvelope {
	readonly workspaceId: string;
	readonly event: DesktopBrowserTabEvent;
}

export type { BrowserElementLiveEdit, BrowserElementRef, BrowserElementSelectionContext };

export function unimplementedBrowserTabResult(): DesktopIpcUnimplemented {
	return unimplementedDesktopIpcResult("browserTab");
}
