import type { IpcRenderer } from "electron";
import type { DesktopApi } from "../api.js";

const CHANNELS = {
	EXPORT: "vetta:session-archive:export",
	IMPORT: "vetta:session-archive:import",
} as const;

export function createSessionArchiveApi(ipc: IpcRenderer): Pick<DesktopApi, "sessionArchive"> {
	return {
		sessionArchive: {
			export: (input) => ipc.invoke(CHANNELS.EXPORT, input),
			import: (input) => ipc.invoke(CHANNELS.IMPORT, input),
		},
	};
}
