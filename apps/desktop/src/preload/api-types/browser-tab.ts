// Copyright The Open Forge contributors.
import type {
	DesktopBrowserCropScreenshotRequest,
	DesktopBrowserCropScreenshotResult,
	DesktopBrowserTabEventEnvelope,
	DesktopBrowserTabGetSessionRequest,
	DesktopBrowserTabGetSessionResult,
	DesktopBrowserTabLiveEditRequest,
	DesktopBrowserTabLiveEditResult,
	DesktopBrowserTabSetPickerRequest,
	DesktopBrowserTabSetPickerResult,
} from "../../shared/browser-tab-ipc.js";

export interface DesktopBrowserTabApi {
	getSession: (request: DesktopBrowserTabGetSessionRequest) => Promise<DesktopBrowserTabGetSessionResult>;
	setPicker: (request: DesktopBrowserTabSetPickerRequest) => Promise<DesktopBrowserTabSetPickerResult>;
	cropScreenshot: (request: DesktopBrowserCropScreenshotRequest) => Promise<DesktopBrowserCropScreenshotResult>;
	liveEdit: (request: DesktopBrowserTabLiveEditRequest) => Promise<DesktopBrowserTabLiveEditResult>;
	onEvent: (listener: (envelope: DesktopBrowserTabEventEnvelope) => void) => () => void;
}

export type {
	DesktopBrowserCropRect,
	DesktopBrowserCropScreenshotRequest,
	DesktopBrowserCropScreenshotResult,
	DesktopBrowserLiveEditAction,
	DesktopBrowserLiveEditCommand,
	DesktopBrowserTabEvent,
	DesktopBrowserTabEventEnvelope,
	DesktopBrowserTabGetSessionRequest,
	DesktopBrowserTabGetSessionResult,
	DesktopBrowserTabLiveEditRequest,
	DesktopBrowserTabLiveEditResult,
	DesktopBrowserTabSession,
	DesktopBrowserTabSetPickerRequest,
	DesktopBrowserTabSetPickerResult,
} from "../../shared/browser-tab-ipc.js";
