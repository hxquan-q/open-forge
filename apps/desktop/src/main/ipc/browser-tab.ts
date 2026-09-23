// Copyright The Open Forge contributors.
import { ipcMain } from "electron";
import {
	BROWSER_TAB_CHANNELS,
	type DesktopBrowserCropScreenshotRequest,
	type DesktopBrowserTabGetSessionRequest,
	type DesktopBrowserTabSetPickerRequest,
} from "../../shared/browser-tab-ipc.js";
import {
	getInAppBrowserSessionController,
	setInAppBrowserEventSink,
} from "../browser-automation/webview-session-controller.js";
import { getMainWindow } from "../window-manager.js";

const CHANNELS = BROWSER_TAB_CHANNELS;

function readWorkspaceId(value: unknown): string | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const workspaceId = (value as { workspaceId?: unknown }).workspaceId;
	return typeof workspaceId === "string" && workspaceId.trim() ? workspaceId : undefined;
}

function readCropRequest(value: unknown): DesktopBrowserCropScreenshotRequest | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const record = value as DesktopBrowserCropScreenshotRequest;
	const workspaceId = readWorkspaceId(record);
	const rect = record.rect;
	if (!workspaceId || typeof rect !== "object" || rect === null) return undefined;
	if (![rect.x, rect.y, rect.width, rect.height].every((item) => typeof item === "number" && Number.isFinite(item))) {
		return undefined;
	}
	if (typeof record.devicePixelRatio !== "number" || !(record.devicePixelRatio > 0)) return undefined;
	return { workspaceId, rect, devicePixelRatio: record.devicePixelRatio };
}

/** Browser picker / WebView 桥 / 截图裁剪：委托给 in-app WebView 会话控制器。 */
export function registerBrowserTabIpc(): () => void {
	const controller = getInAppBrowserSessionController();
	setInAppBrowserEventSink((envelope) => {
		const windowRef = getMainWindow();
		if (!windowRef || windowRef.isDestroyed()) return;
		windowRef.webContents.send(CHANNELS.EVENT, envelope);
	});

	ipcMain.handle(CHANNELS.GET_SESSION, async (_event, request: DesktopBrowserTabGetSessionRequest) => {
		const workspaceId = readWorkspaceId(request);
		return { ok: true as const, session: workspaceId ? controller.getSession(workspaceId) : null };
	});
	ipcMain.handle(CHANNELS.SET_PICKER, async (_event, request: DesktopBrowserTabSetPickerRequest) => {
		const workspaceId = readWorkspaceId(request);
		if (!workspaceId) return { ok: true as const, pickerEnabled: false };
		controller.getSession(workspaceId);
		return { ok: true as const, pickerEnabled: await controller.setPicker(workspaceId, request.enabled === true) };
	});
	ipcMain.handle(CHANNELS.CROP_SCREENSHOT, async (_event, request: DesktopBrowserCropScreenshotRequest) => {
		const parsed = readCropRequest(request);
		if (!parsed) return { ok: false as const, code: "crop_failed" as const, message: "invalid crop request" };
		return controller.cropScreenshot(parsed.workspaceId, parsed.rect, parsed.devicePixelRatio);
	});
	return () => {
		ipcMain.removeHandler(CHANNELS.GET_SESSION);
		ipcMain.removeHandler(CHANNELS.SET_PICKER);
		ipcMain.removeHandler(CHANNELS.CROP_SCREENSHOT);
	};
}
