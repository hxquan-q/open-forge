// Copyright The Open Forge contributors.
import { ipcMain } from "electron";
import { CANVAS_CHANNELS, unimplementedCanvasResult } from "../../shared/canvas-ipc.js";

const CHANNELS = CANVAS_CHANNELS;

/** Canvas artifact IPC 桩：业务实现由 TASK-0060 替换，未实现时返回明确 unimplemented。 */
export function registerCanvasIpc(): () => void {
	const result = unimplementedCanvasResult();
	ipcMain.handle(CHANNELS.LIST, async () => result);
	ipcMain.handle(CHANNELS.GET, async () => result);
	ipcMain.handle(CHANNELS.SAVE_TO_PROJECT, async () => result);
	ipcMain.handle(CHANNELS.DELETE, async () => result);
	return () => {
		ipcMain.removeHandler(CHANNELS.LIST);
		ipcMain.removeHandler(CHANNELS.GET);
		ipcMain.removeHandler(CHANNELS.SAVE_TO_PROJECT);
		ipcMain.removeHandler(CHANNELS.DELETE);
	};
}
