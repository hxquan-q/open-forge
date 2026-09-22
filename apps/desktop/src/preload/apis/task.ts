import type { IpcRenderer } from "electron";
import type { DesktopApi } from "../api.js";

const CHANNELS = {
	GET_STATE: "vetta:task:get-state",
	GET_ARTIFACT_VIEWS: "vetta:task:get-artifact-views",
	COMMAND: "vetta:task:command",
} as const;

export function createTaskApi(ipc: IpcRenderer): Pick<DesktopApi, "task"> {
	return {
		task: {
			getState: (sessionId) => ipc.invoke(CHANNELS.GET_STATE, sessionId),
			getArtifactViews: (sessionId) => ipc.invoke(CHANNELS.GET_ARTIFACT_VIEWS, sessionId),
			runCommand: (sessionId, command) => ipc.invoke(CHANNELS.COMMAND, { sessionId, command }),
		},
	};
}
