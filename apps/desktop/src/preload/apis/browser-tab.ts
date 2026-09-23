// Copyright The Open Forge contributors.
import type { IpcRenderer, IpcRendererEvent } from "electron";
import { BROWSER_TAB_CHANNELS, type DesktopBrowserTabEventEnvelope } from "../../shared/browser-tab-ipc.js";
import type { DesktopApi } from "../api.js";

const CHANNELS = BROWSER_TAB_CHANNELS;

export function createBrowserTabApi(ipc: IpcRenderer): Pick<DesktopApi, "browserTab"> {
	return {
		browserTab: {
			getSession: (request) => ipc.invoke(CHANNELS.GET_SESSION, request),
			setPicker: (request) => ipc.invoke(CHANNELS.SET_PICKER, request),
			cropScreenshot: (request) => ipc.invoke(CHANNELS.CROP_SCREENSHOT, request),
			onEvent: (listener) => {
				const handler = (_event: IpcRendererEvent, envelope: DesktopBrowserTabEventEnvelope): void => {
					listener(envelope);
				};
				ipc.on(CHANNELS.EVENT, handler);
				return () => ipc.removeListener(CHANNELS.EVENT, handler);
			},
		},
	};
}
