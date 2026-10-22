import type { IpcRenderer } from "electron";
import type { DesktopApi } from "../api.js";

const CHANNELS = {
	EXPORT: "vetta:session-archive:export",
	EXPORT_PROJECT: "vetta:session-archive:export-project",
	IMPORT: "vetta:session-archive:import",
	EXPORT_MIGRATION: "vetta:session-archive:export-migration",
	PREVIEW_MIGRATION: "vetta:session-archive:preview-migration",
	APPLY_MIGRATION: "vetta:session-archive:apply-migration",
} as const;

export function createSessionArchiveApi(ipc: IpcRenderer): Pick<DesktopApi, "sessionArchive"> {
	return {
		sessionArchive: {
			export: (input) => ipc.invoke(CHANNELS.EXPORT, input),
			exportProject: (input) => ipc.invoke(CHANNELS.EXPORT_PROJECT, input),
			import: (input) => ipc.invoke(CHANNELS.IMPORT, input),
			exportMigration: (input) => ipc.invoke(CHANNELS.EXPORT_MIGRATION, input),
			previewMigration: (input) => ipc.invoke(CHANNELS.PREVIEW_MIGRATION, input),
			applyMigration: (input) => ipc.invoke(CHANNELS.APPLY_MIGRATION, input),
		},
	};
}
