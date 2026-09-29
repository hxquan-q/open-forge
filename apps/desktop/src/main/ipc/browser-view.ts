// Copyright The Open Forge contributors.
import { ipcMain, WebContentsView } from "electron";
import {
	BROWSER_VIEW_CHANNELS,
	type DesktopBrowserViewAttachRequest,
	type DesktopBrowserViewBounds,
	type DesktopBrowserViewControlRequest,
	type DesktopBrowserViewDetachRequest,
	type DesktopBrowserViewNavigateRequest,
	type DesktopBrowserViewPassthroughRequest,
	type DesktopBrowserViewUpdateRequest,
} from "../../shared/browser-view-ipc.js";
import {
	type BrowserViewHandle,
	type BrowserViewHostWindow,
	configureInAppBrowserViewHostDeps,
	getInAppBrowserViewHost,
	setInAppBrowserViewEventSink,
} from "../browser-automation/browser-view-host.js";
import { IN_APP_BROWSER_PARTITION } from "../browser-automation/webview-session-controller.js";
import { getMainWindow } from "../window-manager.js";

const CHANNELS = BROWSER_VIEW_CHANNELS;

/**
 * guest view 的构造留在主进程装配点：`WebContentsView` 与 `getMainWindow` 都是
 * 静态 import，随 main bundle 一起打包。宿主内部不得再做运行时相对路径 require
 * （单文件 bundle 下解析必然失败，见 BUG-0050）。
 */
function createInAppBrowserView(): BrowserViewHandle {
	return new WebContentsView({
		webPreferences: {
			partition: IN_APP_BROWSER_PARTITION,
			contextIsolation: true,
			nodeIntegration: false,
		},
	}) as unknown as BrowserViewHandle;
}

function readWorkspaceId(value: unknown): string | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const workspaceId = (value as { workspaceId?: unknown }).workspaceId;
	return typeof workspaceId === "string" && workspaceId.trim() ? workspaceId : undefined;
}

function readBounds(value: unknown): DesktopBrowserViewBounds | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const rect = value as DesktopBrowserViewBounds;
	if (![rect.x, rect.y, rect.width, rect.height].every((n) => typeof n === "number" && Number.isFinite(n))) {
		return undefined;
	}
	if (rect.width < 0 || rect.height < 0) return undefined;
	return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

const CONTROL_ACTIONS = new Set(["back", "forward", "reload", "stop"]);

/** 内置浏览器 WebContentsView 宿主：renderer 上报占位矩形，主进程摆 view。 */
export function registerBrowserViewIpc(): () => void {
	configureInAppBrowserViewHostDeps({
		getWindow: () => getMainWindow() as unknown as BrowserViewHostWindow | null,
		createView: createInAppBrowserView,
	});
	const host = getInAppBrowserViewHost();
	setInAppBrowserViewEventSink((envelope) => {
		const win = getMainWindow();
		if (!win || win.isDestroyed()) return;
		win.webContents.send(CHANNELS.EVENT, envelope);
	});

	ipcMain.handle(CHANNELS.ATTACH, async (_event, request: DesktopBrowserViewAttachRequest) => {
		const workspaceId = readWorkspaceId(request);
		const bounds = readBounds(request?.bounds);
		if (!workspaceId || !bounds) return { ok: false as const, code: "no_window" as const };
		const state = host.attach({
			workspaceId,
			bounds,
			url: request.url,
			visible: typeof request.visible === "boolean" ? request.visible : undefined,
		});
		return state ? { ok: true as const, state } : { ok: false as const, code: "no_window" as const };
	});
	ipcMain.handle(CHANNELS.UPDATE, async (_event, request: DesktopBrowserViewUpdateRequest) => {
		const workspaceId = readWorkspaceId(request);
		if (!workspaceId) return;
		const bounds = readBounds(request?.bounds);
		if (bounds) host.setBounds(workspaceId, bounds);
		if (typeof request?.visible === "boolean") host.setVisible(workspaceId, request.visible);
	});
	ipcMain.handle(CHANNELS.DETACH, async (_event, request: DesktopBrowserViewDetachRequest) => {
		const workspaceId = readWorkspaceId(request);
		if (workspaceId) host.detach(workspaceId);
	});
	ipcMain.handle(CHANNELS.NAVIGATE, async (_event, request: DesktopBrowserViewNavigateRequest) => {
		const workspaceId = readWorkspaceId(request);
		const url = typeof request?.url === "string" ? request.url : "";
		if (!workspaceId || !url) return { ok: false as const, code: "no_view" as const };
		return host.navigate(workspaceId, url);
	});
	ipcMain.handle(CHANNELS.CONTROL, async (_event, request: DesktopBrowserViewControlRequest) => {
		const workspaceId = readWorkspaceId(request);
		if (!workspaceId || !CONTROL_ACTIONS.has(request?.action)) return;
		host.control(workspaceId, request.action);
	});
	ipcMain.handle(CHANNELS.PASSTHROUGH, async (_event, request: DesktopBrowserViewPassthroughRequest) => {
		const workspaceId = readWorkspaceId(request);
		if (workspaceId) host.setInputPassthrough(workspaceId, request.passthrough === true);
	});
	return () => {
		ipcMain.removeHandler(CHANNELS.ATTACH);
		ipcMain.removeHandler(CHANNELS.UPDATE);
		ipcMain.removeHandler(CHANNELS.DETACH);
		ipcMain.removeHandler(CHANNELS.NAVIGATE);
		ipcMain.removeHandler(CHANNELS.CONTROL);
		ipcMain.removeHandler(CHANNELS.PASSTHROUGH);
	};
}
