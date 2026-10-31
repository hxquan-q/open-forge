// Modified by The Open Forge contributors.
import type { IpcRenderer } from "electron";
import type { DesktopApi } from "../api.js";

const CHANNELS = {
	EXPORT: "vetta:project:export",
	IMPORT: "vetta:project:import",
	READ_META: "vetta:project:read-meta",
	LIST: "vetta:projects:list",
	CREATE: "vetta:projects:create",
	OPEN: "vetta:projects:open",
	RENAME: "vetta:projects:rename",
	ARCHIVE: "vetta:projects:archive",
	UNARCHIVE: "vetta:projects:unarchive",
	REMOVE: "vetta:projects:remove",
	/** ADR-0151 第二册：版块册（allstarProjects）的登记与移除。 */
	OPEN_ALLSTAR: "vetta:projects:open-allstar",
	REMOVE_ALLSTAR: "vetta:projects:remove-allstar",
} as const;

export function createProjectApi(ipc: IpcRenderer): Pick<DesktopApi, "project"> {
	return {
		project: {
			export: (projectDir) => ipc.invoke(CHANNELS.EXPORT, projectDir),
			import: () => ipc.invoke(CHANNELS.IMPORT),
			readMeta: (projectDir) => ipc.invoke(CHANNELS.READ_META, projectDir),
			list: () => ipc.invoke(CHANNELS.LIST),
			create: (input) => ipc.invoke(CHANNELS.CREATE, input),
			open: (input) => ipc.invoke(CHANNELS.OPEN, input),
			rename: (input) => ipc.invoke(CHANNELS.RENAME, input),
			archive: (path) => ipc.invoke(CHANNELS.ARCHIVE, path),
			unarchive: (path) => ipc.invoke(CHANNELS.UNARCHIVE, path),
			remove: (path) => ipc.invoke(CHANNELS.REMOVE, path),
			openAllstar: (input) => ipc.invoke(CHANNELS.OPEN_ALLSTAR, input),
			removeAllstar: (path) => ipc.invoke(CHANNELS.REMOVE_ALLSTAR, path),
		},
	};
}
