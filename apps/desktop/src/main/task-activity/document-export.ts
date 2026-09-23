// Copyright The Open Forge contributors.
import { copyFile, stat } from "node:fs/promises";
import { dialog } from "electron";
import { mainT } from "../i18n/index.js";
import { getAppLogger } from "../logger.js";
import { artifactUriToPath, desktopTaskActivityService } from "./task-activity-service.js";

const log = getAppLogger("document-export");

/** 渲染端导出结果：cancelled 表示用户放弃；失败分支保留 artifactId 供定位。 */
export type DocumentExportOutcome =
	| { readonly status: "exported"; readonly targetUri: string }
	| { readonly status: "cancelled" }
	| { readonly status: "source-missing"; readonly artifactId: string }
	| { readonly status: "not-exportable"; readonly artifactId: string }
	| { readonly status: "not-found"; readonly artifactId: string };

/** 从产物标题派生保存对话框默认文件名；无扩展名时按 Markdown 处理。 */
function defaultFileName(title: string): string {
	const trimmed = title.trim();
	if (!trimmed) return "document.md";
	const lastDot = trimmed.lastIndexOf(".");
	return lastDot > 0 ? trimmed : `${trimmed}.md`;
}

/**
 * 文档产物导出：只在 Review 接受后可用，落点由用户经原生对话框选定，
 * 内容复制留在主进程，不经过 Renderer。
 * 意外错误（磁盘、权限）会向上抛出，由 IPC 层转成 Promise rejection，
 * Renderer 以 toast 呈现，不与四个显式结果分支混淆。
 */
export class DesktopDocumentExportService {
	readonly exportArtifact = async (
		sessionId: string,
		artifactId: string,
		suggestedFileName?: string,
	): Promise<DocumentExportOutcome> => {
		const descriptor = desktopTaskActivityService
			.getState(sessionId)
			.artifacts.find((artifact) => artifact.artifactId === artifactId);
		if (!descriptor) return { status: "not-found", artifactId };
		// Review 合同：approved 之后产物才是 accepted；未接受的产物不允许离开暂存区。
		if (descriptor.status !== "accepted") return { status: "not-exportable", artifactId };
		const source = descriptor.uri ? artifactUriToPath(descriptor.uri) : undefined;
		if (
			!source ||
			!(await stat(source).then(
				() => true,
				() => false,
			))
		) {
			log.warn(`document export source missing: ${artifactId}`);
			return { status: "source-missing", artifactId };
		}
		const outcome = await dialog.showSaveDialog({
			title: mainT("documentExport.title"),
			defaultPath: suggestedFileName?.trim() || defaultFileName(descriptor.title),
		});
		if (outcome.canceled || !outcome.filePath) return { status: "cancelled" };
		await copyFile(source, outcome.filePath);
		return { status: "exported", targetUri: outcome.filePath };
	};
}

export const desktopDocumentExportService = new DesktopDocumentExportService();
