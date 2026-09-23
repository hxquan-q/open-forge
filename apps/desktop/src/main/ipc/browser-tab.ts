// Copyright The Open Forge contributors.
import { ipcMain } from "electron";
import { BROWSER_TAB_CHANNELS, unimplementedBrowserTabResult } from "../../shared/browser-tab-ipc.js";

const CHANNELS = BROWSER_TAB_CHANNELS;

/** Browser picker / WebView 桥 / 截图裁剪桩：实现由 TASK-0062/0063 替换。 */
export function registerBrowserTabIpc(): () => void {
	const result = unimplementedBrowserTabResult();
	ipcMain.handle(CHANNELS.GET_SESSION, async () => result);
	ipcMain.handle(CHANNELS.SET_PICKER, async () => result);
	ipcMain.handle(CHANNELS.CROP_SCREENSHOT, async () => result);
	return () => {
		ipcMain.removeHandler(CHANNELS.GET_SESSION);
		ipcMain.removeHandler(CHANNELS.SET_PICKER);
		ipcMain.removeHandler(CHANNELS.CROP_SCREENSHOT);
	};
}
