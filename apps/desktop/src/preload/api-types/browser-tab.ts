// Copyright The Open Forge contributors.
import type {
	DesktopBrowserCropScreenshotRequest,
	DesktopBrowserCropScreenshotResult,
	DesktopBrowserTabEventEnvelope,
	DesktopBrowserTabGetSessionRequest,
	DesktopBrowserTabGetSessionResult,
	DesktopBrowserTabSetPickerRequest,
	DesktopBrowserTabSetPickerResult,
} from "../../shared/browser-tab-ipc.js";

export interface DesktopBrowserTabApi {
	getSession: (request: DesktopBrowserTabGetSessionRequest) => Promise<DesktopBrowserTabGetSessionResult>;
	setPicker: (request: DesktopBrowserTabSetPickerRequest) => Promise<DesktopBrowserTabSetPickerResult>;
	cropScreenshot: (request: DesktopBrowserCropScreenshotRequest) => Promise<DesktopBrowserCropScreenshotResult>;
	onEvent: (listener: (envelope: DesktopBrowserTabEventEnvelope) => void) => () => void;
}

export type {
	DesktopBrowserCropRect,
	DesktopBrowserCropScreenshotRequest,
	DesktopBrowserCropScreenshotResult,
	DesktopBrowserTabEvent,
	DesktopBrowserTabEventEnvelope,
	DesktopBrowserTabGetSessionRequest,
	DesktopBrowserTabGetSessionResult,
	DesktopBrowserTabSession,
	DesktopBrowserTabSetPickerRequest,
	DesktopBrowserTabSetPickerResult,
} from "../../shared/browser-tab-ipc.js";
