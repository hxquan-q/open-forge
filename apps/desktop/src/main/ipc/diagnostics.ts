// Modified by The Open Forge contributors.
import { copyFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, type SaveDialogOptions } from "electron";
import { buildDiagnosticsBundle, diagnosticsBundleFileName } from "../diagnostics-bundle.js";
import {
	type DiagnosticsExportOptions,
	type DiagnosticsExportResult,
	exportDiagnosticsWithSaveDialog,
} from "../diagnostics-export.js";
import { getAppLogBaseDir } from "../logger.js";

const DIAGNOSTICS_CHANNELS = {
	EXPORT: "vetta:diagnostics:export",
	GET_LOG_DIR: "vetta:diagnostics:get-log-dir",
} as const;

export { DIAGNOSTICS_CHANNELS };

function parseExportOptions(value: unknown): DiagnosticsExportOptions {
	if (typeof value !== "object" || value === null) return {};
	const title = (value as { dialogTitle?: unknown }).dialogTitle;
	return typeof title === "string" && title.trim() ? { dialogTitle: title.trim().slice(0, 200) } : {};
}

export function registerDiagnosticsIpc(): () => void {
	ipcMain.handle(DIAGNOSTICS_CHANNELS.EXPORT, async (event, rawOptions: unknown): Promise<DiagnosticsExportResult> => {
		const options = parseExportOptions(rawOptions);
		const owner = BrowserWindow.fromWebContents(event.sender);
		return exportDiagnosticsWithSaveDialog({
			defaultPath: join(app.getPath("downloads"), diagnosticsBundleFileName()),
			chooseSavePath: async (defaultPath) => {
				const dialogOptions: SaveDialogOptions = {
					...(options.dialogTitle ? { title: options.dialogTitle } : {}),
					defaultPath,
					filters: [{ name: "Zip", extensions: ["zip"] }],
					properties: ["createDirectory", "showOverwriteConfirmation"],
				};
				const result = owner
					? await dialog.showSaveDialog(owner, dialogOptions)
					: await dialog.showSaveDialog(dialogOptions);
				return result.canceled || !result.filePath ? null : result.filePath;
			},
			buildBundle: async () => (await buildDiagnosticsBundle()).zipPath,
			copyFile: (from, to) => copyFile(from, to),
			removeFile: (path) => rm(path, { force: true }),
		});
	});

	ipcMain.handle(DIAGNOSTICS_CHANNELS.GET_LOG_DIR, (): string => getAppLogBaseDir());

	return () => {
		ipcMain.removeHandler(DIAGNOSTICS_CHANNELS.EXPORT);
		ipcMain.removeHandler(DIAGNOSTICS_CHANNELS.GET_LOG_DIR);
	};
}
