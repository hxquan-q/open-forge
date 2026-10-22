// Modified by The Open Forge contributors.
import type { IpcRenderer } from "electron";
import {
	APP_LIFECYCLE_RENDERER_BOOT_PAINTED_CHANNEL,
	APP_LIFECYCLE_RENDERER_CONTENT_PAINTED_CHANNEL,
	APP_LIFECYCLE_RENDERER_STARTUP_PHASE_CHANNEL,
	APP_LIFECYCLE_WHEN_READY_CHANNEL,
} from "../../shared/app-lifecycle-ipc.js";
import type { DesktopApi } from "../api.js";

export function createAppLifecycleApi(ipcRenderer: IpcRenderer): Pick<DesktopApi, "appLifecycle"> {
	return {
		appLifecycle: {
			reportRendererBootPainted: (result) => {
				ipcRenderer.send(APP_LIFECYCLE_RENDERER_BOOT_PAINTED_CHANNEL, result);
			},
			reportRendererContentPainted: (result) => {
				ipcRenderer.send(APP_LIFECYCLE_RENDERER_CONTENT_PAINTED_CHANNEL, result);
			},
			reportStartupPhase: (phase) => ipcRenderer.send(APP_LIFECYCLE_RENDERER_STARTUP_PHASE_CHANNEL, phase),
			whenReady: () => ipcRenderer.invoke(APP_LIFECYCLE_WHEN_READY_CHANNEL),
		},
	};
}
