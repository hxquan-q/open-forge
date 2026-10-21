import type { IpcRenderer } from "electron";
import type { DesktopApi } from "../api.js";

const CHANNELS = {
	EXPORT: "vetta:session-archive:export",
	EXPORT_PROJECT: "vetta:session-archive:export-project",
	IMPORT: "vetta:session-archive:import",
} as const;

export function createSessionArchiveApi(ipc: IpcRenderer): Pick<DesktopApi, "sessionArchive"> {
	return {
		sessionArchive: {
			export: (input) => ipc.invoke(CHANNELS.EXPORT, input),
			exportProject: (input) => ipc.invoke(CHANNELS.EXPORT_PROJECT, input),
			import: (input) => ipc.invoke(CHANNELS.IMPORT, input),
		},
	};
}
