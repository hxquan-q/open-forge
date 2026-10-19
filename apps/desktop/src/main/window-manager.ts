// Modified by The Open Forge contributors.
import { join } from "node:path";
import { app, BrowserWindow, nativeTheme } from "electron";
import { isSpeechInputBuildEnabled } from "../shared/feature-flags.js";
import { setAppMonitorWindowVisible } from "./app-monitor/app-monitor-service.js";
import { resolveBrandIconDirectory } from "./brand-icon-directory.js";
import { getInAppBrowserViewHost } from "./browser-automation/browser-view-host.js";
import { shouldAutoOpenDevTools } from "./devtools-policy.js";
import { sampleJavaScriptCallStack } from "./diagnostics.js";
import {
	isChromiumResizeObserverDiagnostic,
	isReactFlushSyncLifecycleDiagnostic,
	type RendererConsoleLevel,
	shouldPersistRendererConsoleMessage,
} from "./logger/renderer-console-policy.js";
import { getAppLogger } from "./logger.js";
import { openExternalUrl } from "./open-external.js";
import { configureMainWindowMediaPermissions } from "./speech-input/media-permissions.js";

const isMac = process.platform === "darwin";
const appRoot = app.isPackaged ? app.getAppPath() : process.cwd();
const resDir = app.isPackaged ? appRoot : join(appRoot, "dist");
// dev 态按品牌档案取窗口/托盘图标目录；打包态沿用暂存 resources/build（prepare-pack 已按档覆盖）。
const buildDir = resolveBrandIconDirectory({
	isPackaged: app.isPackaged,
	packagedDirectory: app.isPackaged ? join(process.resourcesPath, "build") : undefined,
	appRoot,
});
const devServerUrl = process.env.VETTA_DESKTOP_DEV_URL;

export const iconPath: Record<string, string> = {
	darwin: join(buildDir, "icon.icns"),
	win32: join(buildDir, "icon.ico"),
	linux: join(buildDir, "icon.png"),
};

// macOS 状态栏图标：直接用彩色 PNG logo（icon.icns 在 Tray 上表现不佳）。
// 不作为 template，故不跟随菜单栏深/浅色反相，但保留品牌色。
export const macTrayIconPath = join(buildDir, "icon.png");

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
	return mainWindow;
}

export function setMainWindow(win: BrowserWindow | null): void {
	mainWindow = win;
}

export function createWindow(): BrowserWindow {
	const windowLog = getAppLogger("window");
	const rendererLog = getAppLogger("renderer", "render");
	const preloadPath = join(resDir, "preload/index.js");
	const rendererPath = join(resDir, "renderer/index.html");
	windowLog.info("create", {
		devServerUrl,
		iconPath: iconPath[process.platform],
		preloadPath,
		rendererPath,
	});

	mainWindow = new BrowserWindow({
		width: 1280,
		height: 800,
		show: false,
		// 最小尺寸：低于此值会过度收缩导致布局不可用。窄屏响应式在此宽度下仍生效。
		minWidth: 380,
		minHeight: 600,
		icon: iconPath[process.platform],
		// macOS 不开 transparent：vibrancy 不需要它，只要下面的 backgroundColor 全透明即可。
		// 透明窗口无法被系统做遮挡剔除，旁边或背后的窗口一变化就要连带整窗重新合成，
		// 实测窗口自己完全静止时 WindowServer 仍多占约 10% GPU。
		transparent: false,
		frame: isMac,
		titleBarStyle: isMac ? "hiddenInset" : undefined,
		trafficLightPosition: isMac ? { x: 16, y: 20 } : undefined,
		vibrancy: isMac ? "sidebar" : undefined,
		visualEffectState: isMac ? "active" : undefined,
		backgroundColor: isMac ? "#00000000" : nativeTheme.shouldUseDarkColors ? "#161616" : "#f5f5f7",
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			preload: preloadPath,
			// Canvas HTML artifact 沙箱仍用 <webview> 标签渲染；内置浏览器已迁 WebContentsView。
			webviewTag: true,
			// 遮挡（document.hidden）会暂停 rAF/ResizeObserver，Virtuoso 列表停摆成空列表；
			// 而 Electron 的遮挡检测存在滞留问题（锁屏/RDP/显示器休眠后可见窗口仍报 hidden），
			// 叠加会把用户困在「可见但全空」的状态。参考 remote-desktop host 的同款配置。
			backgroundThrottling: false,
		},
	});
	if (isSpeechInputBuildEnabled()) {
		configureMainWindowMediaPermissions(mainWindow.webContents.session, mainWindow.webContents);
	}

	// TASK-0072：内置浏览器 guest 已由 WebContentsView 宿主接管（见 browser-view-host.ts）。
	// window.open/target=_blank 的「同 view 原地加载」处理在宿主创建 view 时完成；
	// 此处不再经 did-attach-webview 发现 guest（partition 匹配竞态已随之移除）。
	setAppMonitorWindowVisible(mainWindow.isVisible());

	mainWindow.on("ready-to-show", () => {
		windowLog.info("ready-to-show");
	});
	mainWindow.on("show", () => {
		windowLog.info("show");
		setAppMonitorWindowVisible(true);
	});
	mainWindow.on("hide", () => {
		windowLog.info("hide");
		setAppMonitorWindowVisible(false);
	});
	mainWindow.on("close", () => {
		windowLog.info("close");
	});
	mainWindow.on("closed", () => {
		windowLog.info("closed");
		setAppMonitorWindowVisible(false);
		// 浏览器 view 随窗口析构；清掉宿主表避免挂到已销毁 contents 上。
		getInAppBrowserViewHost().disposeAll();
	});
	mainWindow.webContents.on("did-finish-load", () => {
		windowLog.info("did-finish-load", mainWindow?.webContents.getURL());
	});
	mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
		windowLog.error("did-fail-load", {
			errorCode,
			errorDescription,
			validatedURL,
			isMainFrame,
		});
	});
	mainWindow.webContents.on("preload-error", (_event, preloadPathForError, error) => {
		windowLog.error("preload-error", { preloadPath: preloadPathForError, error });
	});
	mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
		// Chromium defers remaining ResizeObserver callbacks to the next frame while a split pane is
		// continuously resized. It reports that normal delivery behavior as an internal console error.
		if (isChromiumResizeObserverDiagnostic(message, line)) return;
		// React DEV-only call-timing advisory raised by dependency-vendored flushSync calls (BUG-0083).
		if (isReactFlushSyncLifecycleDiagnostic(message)) return;
		const levelLabel: RendererConsoleLevel = (["log", "info", "warn", "error"] as const)[level] ?? "log";
		if (!shouldPersistRendererConsoleMessage(levelLabel, message)) return;
		rendererLog[levelLabel](`[${sourceId}:${line}] ${message}`);
	});
	mainWindow.webContents.on("unresponsive", () => {
		windowLog.error("unresponsive");
		if (mainWindow) sampleJavaScriptCallStack(mainWindow.webContents, "unresponsive");
	});
	mainWindow.webContents.on("responsive", () => {
		windowLog.info("responsive");
	});
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		void openExternalUrl(url).catch((error: unknown) => {
			windowLog.error("open external failed", { url, error });
		});
		return { action: "deny" };
	});
	// 主窗口只承载应用自身内容（TASK-0309）：页面内发起的导航（被诱导的链接、脚本改
	// location）一律拦下，外部内容走上面的系统浏览器出口。程序化加载（loadURL/
	// loadFile）与 reload 不触发本事件，开发服务器的 HMR 不受影响；与 markdown
	// isolated-window 的既有做法保持一致。
	mainWindow.webContents.on("will-navigate", (event, url) => {
		event.preventDefault();
		windowLog.warn("blocked main-window navigation", { url });
	});

	return mainWindow;
}

export async function loadMainWindow(win: BrowserWindow): Promise<void> {
	if (win.isDestroyed()) return;
	const windowLog = getAppLogger("window");
	const rendererPath = join(resDir, "renderer/index.html");
	const startedAt = Date.now();
	try {
		if (devServerUrl) {
			await win.loadURL(devServerUrl);
		} else {
			await win.loadFile(rendererPath);
		}
		windowLog.info("main-renderer-ready", { durationMs: Date.now() - startedAt });
		if (win.isDestroyed() || !shouldAutoOpenDevTools({ isPackaged: app.isPackaged, env: process.env })) return;
		win.webContents.openDevTools({ mode: "detach", activate: true });
		windowLog.info("open-devtools", { opened: win.webContents.isDevToolsOpened() });
	} catch (error) {
		windowLog.error(devServerUrl ? "loadURL failed" : "loadFile failed", error);
	}
}

/**
 * Show a BrowserWindow, with a Windows STARTUPINFO workaround.
 *
 * If the process was started with STARTF_USESHOWWINDOW + SW_HIDE (older
 * windows-launcher used HideWindow:true), Windows ignores the first
 * ShowWindow nCmdShow and forces hide. Electron still emits "show", but
 * the HWND has WS_VISIBLE cleared. A second show makes it actually visible.
 * Harmless when the launcher no longer sets HideWindow.
 */
export function revealMainWindow(win: BrowserWindow): void {
	if (win.isDestroyed()) return;
	win.show();
	if (process.platform === "win32" && !win.isDestroyed()) {
		win.show();
	}
}

export function showMainWindow(): BrowserWindow {
	if (!mainWindow || mainWindow.isDestroyed()) {
		const win = createWindow();
		win.once("ready-to-show", () => {
			if (win.isDestroyed()) return;
			revealMainWindow(win);
			win.focus();
		});
		void loadMainWindow(win);
		return win;
	}

	// macOS 上仅靠 BrowserWindow.focus() 无法将后台应用带到前台，
	// 必须先通过 app.focus() 让应用成为活动应用。
	if (isMac) {
		app.focus({ steal: true });
	}

	if (mainWindow.isMinimized()) {
		mainWindow.restore();
	}
	revealMainWindow(mainWindow);
	mainWindow.focus();
	return mainWindow;
}
