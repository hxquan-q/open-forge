// Modified by The Open Forge contributors.
import { extname } from "node:path";

export interface DiagnosticsExportOptions {
	/** 系统保存对话框的标题，由界面按当前语言传入。 */
	readonly dialogTitle?: string;
}

export type DiagnosticsExportResult =
	| { readonly canceled: true }
	| { readonly canceled: false; readonly zipPath: string };

export interface DiagnosticsExportDeps {
	/** 让用户选保存位置；取消时返回 null。 */
	readonly chooseSavePath: (defaultPath: string) => Promise<string | null>;
	/** 打包到临时位置，返回临时 zip 路径。 */
	readonly buildBundle: () => Promise<string>;
	readonly copyFile: (from: string, to: string) => Promise<void>;
	readonly removeFile: (path: string) => Promise<void>;
	readonly defaultPath: string;
}

/**
 * 先问保存位置再打包：用户取消就什么都不做。
 * 打包落在临时目录，写完整后才拷到用户选的位置，失败时不会在那里留下半截文件。
 */
export async function exportDiagnosticsWithSaveDialog(deps: DiagnosticsExportDeps): Promise<DiagnosticsExportResult> {
	const chosen = await deps.chooseSavePath(deps.defaultPath);
	if (!chosen) return { canceled: true };
	const zipPath = extname(chosen).toLowerCase() === ".zip" ? chosen : `${chosen}.zip`;
	const tempPath = await deps.buildBundle();
	try {
		await deps.copyFile(tempPath, zipPath);
	} finally {
		await deps.removeFile(tempPath).catch(() => {});
	}
	return { canceled: false, zipPath };
}
