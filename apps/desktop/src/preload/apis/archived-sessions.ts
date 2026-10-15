// Copyright The Open Forge contributors.
import type { IpcRenderer, IpcRendererEvent } from "electron";
import { ARCHIVED_SESSIONS_CHANGED_CHANNEL, type ArchivedSessionsSnapshot } from "../../shared/archived-sessions.js";
import type { DesktopApi } from "../api.js";

const CHANNELS = {
	LIST: "vetta:archived-sessions:list",
	ARCHIVE: "vetta:archived-sessions:archive",
	UNARCHIVE: "vetta:archived-sessions:unarchive",
	FORGET: "vetta:archived-sessions:forget",
} as const;

export function createArchivedSessionsApi(ipc: IpcRenderer): Pick<DesktopApi, "archivedSessions"> {
	return {
		archivedSessions: {
			list: () => ipc.invoke(CHANNELS.LIST),
			archive: (input) => ipc.invoke(CHANNELS.ARCHIVE, input),
			unarchive: (sessionPath) => ipc.invoke(CHANNELS.UNARCHIVE, sessionPath),
			forget: (sessionPaths) => ipc.invoke(CHANNELS.FORGET, [...sessionPaths]),
			onChanged: (listener) => {
				const handler = (_event: IpcRendererEvent, snapshot: ArchivedSessionsSnapshot): void => listener(snapshot);
				ipc.on(ARCHIVED_SESSIONS_CHANGED_CHANNEL, handler);
				return () => ipc.removeListener(ARCHIVED_SESSIONS_CHANGED_CHANNEL, handler);
			},
		},
	};
}
