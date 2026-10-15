// Copyright The Open Forge contributors.
import type { IpcRenderer, IpcRendererEvent } from "electron";
import { BROWSER_VIEW_CHANNELS, type DesktopBrowserViewEventEnvelope } from "../../shared/browser-view-ipc.js";
import type { DesktopApi } from "../api.js";

const CHANNELS = BROWSER_VIEW_CHANNELS;

export function createBrowserViewApi(ipc: IpcRenderer): Pick<DesktopApi, "browserView"> {
	return {
		browserView: {
			attach: (request) => ipc.invoke(CHANNELS.ATTACH, request),
			update: (request) => ipc.invoke(CHANNELS.UPDATE, request),
			detach: (request) => ipc.invoke(CHANNELS.DETACH, request),
			navigate: (request) => ipc.invoke(CHANNELS.NAVIGATE, request),
			control: (request) => ipc.invoke(CHANNELS.CONTROL, request),
			setInputPassthrough: (request) => ipc.invoke(CHANNELS.PASSTHROUGH, request),
			onEvent: (listener) => {
				const handler = (_event: IpcRendererEvent, envelope: DesktopBrowserViewEventEnvelope): void => {
					listener(envelope);
				};
				ipc.on(CHANNELS.EVENT, handler);
				return () => ipc.removeListener(CHANNELS.EVENT, handler);
			},
		},
	};
}
