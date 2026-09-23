// Copyright The Open Forge contributors.
import {
	BROWSER_SCREENSHOT_FORMAT,
	BROWSER_SCREENSHOT_MAX_LONG_EDGE_PX,
	type BrowserElementRef,
	type BrowserElementSelectionContext,
} from "@vetta/coding-agent/function-extensions";
import { type DesktopIpcUnimplemented, unimplementedDesktopIpcResult } from "./desktop-ipc-result.js";

/** Browser picker / WebView 会话桥 / 截图裁剪 IPC。 */
export const BROWSER_TAB_CHANNELS = {
	GET_SESSION: "vetta:browser-tab:session",
	SET_PICKER: "vetta:browser-tab:set-picker",
	CROP_SCREENSHOT: "vetta:browser-tab:crop-screenshot",
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

export interface DesktopBrowserTabSetPickerRequest {
	readonly workspaceId: string;
	readonly enabled: boolean;
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

export type DesktopBrowserTabEvent =
	| { readonly kind: "session-changed"; readonly session: DesktopBrowserTabSession }
	| { readonly kind: "picker-result"; readonly context: BrowserElementSelectionContext }
	| { readonly kind: "page-revision"; readonly workspaceId: string; readonly pageRevision: number };

export interface DesktopBrowserTabEventEnvelope {
	readonly workspaceId: string;
	readonly event: DesktopBrowserTabEvent;
}

export type { BrowserElementRef, BrowserElementSelectionContext };

export function unimplementedBrowserTabResult(): DesktopIpcUnimplemented {
	return unimplementedDesktopIpcResult("browserTab");
}
