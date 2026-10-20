// Modified by The Open Forge contributors.
/*
 * C7 说明（>400 行仍单文件）：本文件只有一个 actor —— 原生对话框 IPC 桥。所有 handler 都是
 * 「收 renderer 参数 → 弹系统对话框 / 落盘 → 回结果」的同一件事，总是一起改；按对话框类型拆开
 * 只会制造 shotgun surgery（CONSTRAINTS C7，同 http.ts 的处理）。
 */

import { copyFile, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { app, dialog, ipcMain } from "electron";
import type { DialogWriteFilesResult } from "../../preload/api-types/dialog.js";
import {
	PERSIST_IMAGE_FILES_CHANNEL,
	type PersistImageFileInput,
	type PersistImageInput,
} from "../../shared/image-cache.js";
import { cleanupOldImageCaches, persistImageCache, persistImageFileCache } from "../image-cache/image-cache-service.js";
import { getAppLogger } from "../logger.js";
import { allowProjectRoot, assertPathReadableForPreview } from "./fs.js";
import { selectFoldersWithLinuxPortal } from "./linux-portal-dialog.js";

const log = getAppLogger("dialog");

/**
 * 用户**显式选过**的导出目录白名单（经 `select-directory` 登记）。
 *
 * 批量写盘只允许落进这里登记过的目录 —— 对应 T03 的路径安全要求「只写用户显式选择的目录」。
 * 与 `select-folder` / `select-folders` 不同，导出目标**不**调用 `allowProjectRoot`：那个授权会
 * 让整个目录树对插件 fs 长期可读，而导出只需要「往这一层写文件」这一次性许可。
 */
const userSelectedExportDirectories = new Set<string>();

/** 登记用户选定的导出目录（按 `resolve` 归一化，避免同一目录多种写法绕过白名单），返回原路径。 */
function approveExportDirectory(directory: string): string {
	userSelectedExportDirectories.add(resolve(directory));
	return directory;
}

const IMAGE_MIME: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".svg": "image/svg+xml",
	".bmp": "image/bmp",
};

export function registerDialogIpc(): () => void {
	// 启动期顺手清理过期图片缓存（fire-and-forget，不阻塞 IPC 注册）。
	void cleanupOldImageCaches();

	// 把用户附加的图片（base64）落盘到按会话分目录的缓存，返回绝对路径。
	// 调用方据此用 @路径 引用图片，交由 agent 的 Read 工具按需读取，
	// 从而不再把 base64 直接塞进上下文（不支持视觉的模型也能用工具处理图片）。
	ipcMain.handle("vetta:dialog:persist-images", async (_event, sessionId: string, images: PersistImageInput[]) =>
		Array.isArray(images) ? persistImageCache(sessionId, images) : [],
	);
	ipcMain.handle(PERSIST_IMAGE_FILES_CHANNEL, async (_event, sessionId: string, images: PersistImageFileInput[]) =>
		Array.isArray(images) ? persistImageFileCache(sessionId, images) : [],
	);

	ipcMain.handle("vetta:dialog:select-images", async () => {
		const result = await dialog.showOpenDialog({
			properties: ["openFile", "multiSelections"],
			title: "Select Images",
			filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"] }],
		});
		if (result.canceled || result.filePaths.length === 0) return [];
		const images = await Promise.all(
			result.filePaths.map(async (filePath) => {
				const buffer = await readFile(filePath);
				const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
				return {
					data: buffer.toString("base64"),
					mimeType: IMAGE_MIME[ext] || "image/png",
					name: basename(filePath),
				};
			}),
		);
		return images;
	});

	ipcMain.handle("vetta:dialog:select-folder", async () => {
		const result = await dialog.showOpenDialog({ properties: ["openDirectory"], title: "Select Project Folder" });
		if (result.canceled || result.filePaths.length === 0) return null;
		const selectedPath = result.filePaths[0];
		allowProjectRoot(selectedPath);
		return selectedPath;
	});

	ipcMain.handle("vetta:dialog:select-files", async (_event, defaultPath?: string) => {
		const result = await dialog.showOpenDialog({
			properties: ["openFile", "multiSelections"],
			title: "选择文件",
			defaultPath: defaultPath || undefined,
		});
		if (result.canceled || result.filePaths.length === 0) return [];
		return result.filePaths;
	});

	/**
	 * 选文件并**连内容一起**返回。
	 *
	 * 为什么不复用 select-files 的「只回路径」：插件的 fs 被限制在已授权的项目根内
	 * （filesystem-service 的 allowedRoots），用户从下载目录挑一个文件，插件拿到路径也
	 * 读不了。让主进程当场读完回传，既不用把那个目录永久加进授权根（select-folder 就是
	 * 那么做的，代价是整棵目录树从此可读），也不必发明按路径的一次性授权。
	 */
	ipcMain.handle("vetta:dialog:open-file-contents", async (_event, options: unknown) => {
		const input = (options ?? {}) as {
			title?: unknown;
			filters?: unknown;
			multiple?: unknown;
			maxBytes?: unknown;
		};
		const filters = Array.isArray(input.filters)
			? input.filters.flatMap((filter) => {
					const candidate = filter as { name?: unknown; extensions?: unknown };
					if (typeof candidate?.name !== "string" || !Array.isArray(candidate.extensions)) return [];
					const extensions = candidate.extensions.filter((ext): ext is string => typeof ext === "string");
					return extensions.length > 0 ? [{ name: candidate.name, extensions }] : [];
				})
			: [];
		const properties: Array<"openFile" | "multiSelections"> =
			input.multiple === true ? ["openFile", "multiSelections"] : ["openFile"];
		const result = await dialog.showOpenDialog({
			properties,
			title: typeof input.title === "string" && input.title.trim() ? input.title : "选择文件",
			...(filters.length > 0 ? { filters } : {}),
		});
		if (result.canceled || result.filePaths.length === 0) return [];
		// 上限兜底：内容要经 IPC 以 base64 回传，一个被误选的大文件足以撑爆渲染进程。
		const maxBytes = typeof input.maxBytes === "number" && input.maxBytes > 0 ? input.maxBytes : 64 * 1024 * 1024;
		const files = [];
		for (const filePath of result.filePaths) {
			const info = await stat(filePath);
			if (info.size > maxBytes) {
				throw new Error(`File is too large to open: ${basename(filePath)} (${info.size} bytes)`);
			}
			const buffer = await readFile(filePath);
			files.push({ path: filePath, name: basename(filePath), data: buffer.toString("base64") });
		}
		return files;
	});

	ipcMain.handle("vetta:dialog:save-html", async (_event, defaultFileName: unknown, content: unknown) => {
		if (typeof defaultFileName !== "string" || !defaultFileName.trim()) {
			throw new Error("Invalid HTML export file name");
		}
		if (typeof content !== "string") {
			throw new Error("Invalid HTML export content");
		}
		const result = await dialog.showSaveDialog({
			title: "导出会话 HTML",
			defaultPath: defaultFileName,
			filters: [{ name: "HTML", extensions: ["html"] }],
		});
		if (result.canceled || !result.filePath) return null;
		await writeFile(result.filePath, content, "utf8");
		return result.filePath;
	});

	/**
	 * Write in-memory bytes to a path chosen via the native save dialog. The
	 * complement to save-copy, which needs the payload to already exist on disk.
	 * Returns the saved path, or null if cancelled.
	 */
	ipcMain.handle(
		"vetta:dialog:save-data",
		async (
			_event,
			defaultFileName: unknown,
			content: unknown,
			encoding?: unknown,
			options?: {
				title?: string;
				filters?: Array<{ name: string; extensions: string[] }>;
				/** 保存对话框的初始目录；缺省为系统桌面（见 resolveDefaultDirectory）。 */
				defaultDirectory?: string;
			},
		): Promise<string | null> => {
			if (typeof defaultFileName !== "string" || !defaultFileName.trim()) {
				throw new Error("Invalid save file name");
			}
			if (typeof content !== "string") {
				throw new Error("Invalid save content");
			}
			if (encoding !== undefined && encoding !== "utf8" && encoding !== "base64") {
				throw new Error(`Invalid save encoding: ${String(encoding)}`);
			}
			const name = basename(defaultFileName.trim());
			const ext = extname(name).replace(/^\./, "").toLowerCase();
			const filters =
				Array.isArray(options?.filters) && options.filters.length > 0
					? options.filters.filter(
							(filter) =>
								typeof filter?.name === "string" &&
								Array.isArray(filter.extensions) &&
								filter.extensions.every((entry) => typeof entry === "string"),
						)
					: ext
						? [{ name: ext.toUpperCase(), extensions: [ext] }]
						: undefined;
			// 默认目录只影响对话框起始位置，不改变写盘语义（既有调用方零回归）。
			const directory = resolveDefaultDirectory(options?.defaultDirectory);

			const result = await dialog.showSaveDialog({
				title: typeof options?.title === "string" && options.title.trim() ? options.title.trim() : "Save File",
				defaultPath: directory ? join(directory, name) : name,
				filters,
			});
			if (result.canceled || !result.filePath) return null;
			await writeFile(result.filePath, content, encoding === "base64" ? "base64" : "utf8");
			return result.filePath;
		},
	);

	/**
	 * Copy an existing file to a path chosen via the native save dialog.
	 * Source must be readable under host preview rules (project roots or home).
	 * Destination is user-chosen (no project-root write restriction).
	 * Returns the saved path, or null if cancelled.
	 */
	ipcMain.handle(
		"vetta:dialog:save-copy",
		async (
			_event,
			sourcePath: unknown,
			options?: {
				defaultFileName?: string;
				title?: string;
				filters?: Array<{ name: string; extensions: string[] }>;
			},
		): Promise<string | null> => {
			if (typeof sourcePath !== "string" || !sourcePath.trim()) {
				throw new Error("Invalid source path");
			}
			assertPathReadableForPreview(sourcePath);
			let sourceStat: Awaited<ReturnType<typeof stat>>;
			try {
				sourceStat = await stat(sourcePath);
			} catch {
				throw new Error(`Source file not found: ${sourcePath}`);
			}
			if (!sourceStat.isFile()) {
				throw new Error(`Source is not a file: ${sourcePath}`);
			}

			const defaultFileName =
				typeof options?.defaultFileName === "string" && options.defaultFileName.trim()
					? options.defaultFileName.trim()
					: basename(sourcePath);
			const title = typeof options?.title === "string" && options.title.trim() ? options.title.trim() : "Save File";
			const filters =
				Array.isArray(options?.filters) && options.filters.length > 0
					? options.filters.filter(
							(f) =>
								typeof f?.name === "string" &&
								Array.isArray(f.extensions) &&
								f.extensions.every((e) => typeof e === "string"),
						)
					: undefined;
			const ext = extname(defaultFileName).replace(/^\./, "").toLowerCase();
			const resolvedFilters =
				filters && filters.length > 0
					? filters
					: ext
						? [{ name: ext.toUpperCase(), extensions: [ext] }]
						: undefined;

			const result = await dialog.showSaveDialog({
				title,
				defaultPath: defaultFileName,
				filters: resolvedFilters,
			});
			if (result.canceled || !result.filePath) return null;
			await copyFile(sourcePath, result.filePath);
			return result.filePath;
		},
	);

	ipcMain.handle("vetta:dialog:select-folders", async () => {
		if (process.platform === "linux") {
			try {
				const selected = await selectFoldersWithLinuxPortal();
				for (const p of selected) {
					allowProjectRoot(p);
				}
				return selected;
			} catch (error) {
				log.warn("Linux portal folder picker failed, falling back to Electron dialog:", error);
			}
		}

		const result = await dialog.showOpenDialog({
			properties: ["openDirectory", "multiSelections"],
			title: "Select Folders",
		});
		if (result.canceled || result.filePaths.length === 0) return [];
		for (const p of result.filePaths) {
			allowProjectRoot(p);
		}
		return result.filePaths;
	});

	/**
	 * 选单个目录作为导出落地位置（批量导出用）。取消返回 null。
	 *
	 * 与 `select-folder` 的区别：这里**不** `allowProjectRoot` —— 导出目标只需要「往这一层
	 * 写文件」的许可，不该顺带把整棵目录树加进插件可读根（见 userSelectedExportDirectories 注释）。
	 */
	ipcMain.handle("vetta:dialog:select-directory", async (): Promise<string | null> => {
		const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
		if (result.canceled || result.filePaths.length === 0) return null;
		return approveExportDirectory(result.filePaths[0]);
	});

	/**
	 * 批量写盘：把多个内存文件写进**用户已选**目录（{@link userSelectedExportDirectories}）。
	 *
	 * 路径安全（T03）：目标目录必须在白名单内；每个文件名再经 {@link resolveFileTarget} 净化，
	 * 含分隔符 / 逃逸 / 空名的条目一律拒绝、不落盘。**部分失败如实上报**：单个条目失败不中断整批。
	 */
	ipcMain.handle(
		"vetta:dialog:write-files-to-directory",
		async (_event, input: unknown): Promise<DialogWriteFilesResult> => {
			const { directory, files } = parseWriteFilesInput(input);
			const root = resolve(directory);
			if (!userSelectedExportDirectories.has(root)) {
				throw new Error("Target directory was not selected by the user");
			}
			const written: string[] = [];
			const failed: Array<{ name: string; error: string }> = [];
			for (const file of files) {
				const target = resolveFileTarget(root, file.name);
				if (target === undefined) {
					failed.push({ name: file.name, error: "invalid file name" });
					continue;
				}
				try {
					await writeFile(target, file.content, file.encoding);
					written.push(target);
				} catch (error) {
					failed.push({ name: file.name, error: error instanceof Error ? error.message : String(error) });
				}
			}
			return { written, failed };
		},
	);

	return () => {
		ipcMain.removeHandler("vetta:dialog:persist-images");
		ipcMain.removeHandler(PERSIST_IMAGE_FILES_CHANNEL);
		ipcMain.removeHandler("vetta:dialog:select-images");
		ipcMain.removeHandler("vetta:dialog:select-folder");
		ipcMain.removeHandler("vetta:dialog:select-files");
		ipcMain.removeHandler("vetta:dialog:open-file-contents");
		ipcMain.removeHandler("vetta:dialog:save-html");
		ipcMain.removeHandler("vetta:dialog:save-data");
		ipcMain.removeHandler("vetta:dialog:save-copy");
		ipcMain.removeHandler("vetta:dialog:select-folders");
		ipcMain.removeHandler("vetta:dialog:select-directory");
		ipcMain.removeHandler("vetta:dialog:write-files-to-directory");
	};
}

/**
 * 保存对话框的初始目录：显式传入优先，缺省回落系统桌面（T03 AC「默认目录=桌面」）。
 *
 * 桌面路径不可得时（非 Electron 环境 / 取路径失败）返回 undefined，调用方退化为只给文件名 ——
 * 保证既有 save-data 调用方在异常环境下不崩（零回归）。
 */
function resolveDefaultDirectory(requested: unknown): string | undefined {
	if (typeof requested === "string" && requested.trim()) return requested.trim();
	try {
		const desktop = app.getPath("desktop");
		return desktop.trim() ? desktop : undefined;
	} catch {
		return undefined;
	}
}

/** 归一化后的写盘条目：内容 + 编码，写盘循环只认这一种形状。 */
interface NormalizedWriteFileEntry {
	name: string;
	content: string;
	encoding: "utf8" | "base64";
}

/**
 * 校验批量写盘入参（不信任 renderer）。**顶层形状错误直接抛**；条目内的不安全**名字**不在此处拦，
 * 留给 {@link resolveFileTarget} 作为「按条目失败」处理（一个坏名字不该拖垮整批）。
 */
function parseWriteFilesInput(value: unknown): { directory: string; files: NormalizedWriteFileEntry[] } {
	const input = requirePlainObject(value, "write-files-to-directory");
	const directory = requireNonEmptyString(input.directory, "directory");
	if (!Array.isArray(input.files)) throw new Error("write-files-to-directory requires a files array");
	const files: NormalizedWriteFileEntry[] = [];
	for (const raw of input.files) files.push(parseWriteFileEntry(raw));
	return { directory, files };
}

/** 单个写盘条目：`{name, utf8}` 或 `{name, base64}`，二者恰好其一。 */
function parseWriteFileEntry(raw: unknown): NormalizedWriteFileEntry {
	const entry = requirePlainObject(raw, "write-files-to-directory file entry");
	const name = requireNonEmptyString(entry.name, "file name");
	const { utf8, base64 } = entry;
	if (typeof utf8 === "string" && base64 === undefined) return { name, content: utf8, encoding: "utf8" };
	if (typeof base64 === "string" && utf8 === undefined) return { name, content: base64, encoding: "base64" };
	throw new Error("file entry requires exactly one of utf8 or base64 content");
}

function requirePlainObject(value: unknown, channel: string): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${channel} requires an object argument`);
	}
	return value as Record<string, unknown>;
}

function requireNonEmptyString(value: unknown, field: string): string {
	if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a non-empty string`);
	return value;
}

/**
 * 把条目名解析成目标目录内的绝对路径；任何逃逸都返回 undefined（不落盘）。
 *
 * 三道闸：空名 / `.` / `..` 直接拒；含路径分隔符直接拒（批量文件名一律是扁平名）；最后用
 * `dirname(resolve(root, name)) === root` 兜底，拦住盘符相对路径等平台特定写法。
 */
function resolveFileTarget(root: string, name: string): string | undefined {
	if (!name || name === "." || name === "..") return undefined;
	if (name.includes("/") || name.includes("\\") || name.includes("\0")) return undefined;
	const target = resolve(root, name);
	return dirname(target) === root ? target : undefined;
}
