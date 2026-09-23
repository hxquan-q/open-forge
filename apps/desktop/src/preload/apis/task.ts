import type { IpcRenderer } from "electron";
import { TASK_CHANNELS } from "../../shared/task-ipc.js";
import type { DesktopApi } from "../api.js";

const CHANNELS = TASK_CHANNELS;

export function createTaskApi(ipc: IpcRenderer): Pick<DesktopApi, "task"> {
	return {
		task: {
			getState: (sessionId) => ipc.invoke(CHANNELS.GET_STATE, sessionId),
			getArtifactViews: (sessionId) => ipc.invoke(CHANNELS.GET_ARTIFACT_VIEWS, sessionId),
			runCommand: (sessionId, command) => ipc.invoke(CHANNELS.COMMAND, { sessionId, command }),
		},
	};
}
