// Copyright The Open Forge contributors.
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
			readArtifact: (sessionId, artifactId) => ipc.invoke(CHANNELS.READ_ARTIFACT, { sessionId, artifactId }),
			verifyArtifactSources: (sessionId, artifactId) =>
				ipc.invoke(CHANNELS.VERIFY_ARTIFACT_SOURCES, { sessionId, artifactId }),
			exportArtifact: (sessionId, artifactId, suggestedFileName) =>
				ipc.invoke(CHANNELS.EXPORT_ARTIFACT, { sessionId, artifactId, suggestedFileName }),
		},
	};
}
