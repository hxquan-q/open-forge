// Copyright The Open Forge contributors.
import type { IpcRenderer } from "electron";
import { CANVAS_CHANNELS } from "../../shared/canvas-ipc.js";
import type { DesktopApi } from "../api.js";

const CHANNELS = CANVAS_CHANNELS;

export function createCanvasApi(ipc: IpcRenderer): Pick<DesktopApi, "canvas"> {
	return {
		canvas: {
			list: (request) => ipc.invoke(CHANNELS.LIST, request),
			get: (request) => ipc.invoke(CHANNELS.GET, request),
			update: (request) => ipc.invoke(CHANNELS.UPDATE, request),
			openInBrowser: (request) => ipc.invoke(CHANNELS.OPEN_IN_BROWSER, request),
			saveToProject: (request) => ipc.invoke(CHANNELS.SAVE_TO_PROJECT, request),
			delete: (request) => ipc.invoke(CHANNELS.DELETE, request),
		},
	};
}
