// Modified by The Open Forge contributors.
import type { PersistedImageResult, PersistImageInput } from "../../shared/image-cache.js";

export interface SelectedImageFile {
	data: string;
	mimeType: string;
	name: string;
}

export interface DialogSaveCopyOptions {
	/** Suggested file name in the save dialog (defaults to basename of source). */
	defaultFileName?: string;
	title?: string;
	filters?: Array<{ name: string; extensions: string[] }>;
}

export interface DialogSaveDataOptions {
	title?: string;
	/** Defaults to a single filter derived from the default file name's extension. */
	filters?: Array<{ name: string; extensions: string[] }>;
	/** 保存对话框的初始目录；缺省为系统桌面（`app.getPath("desktop")`）。 */
	defaultDirectory?: string;
}

/**
 * 批量写盘的单文件条目：文件名 + 内容，内容二选一（utf8 文本 / base64）。
 *
 * 名字必须是**扁平文件名**（不含路径分隔符）；主进程会再净化一次，防路径逃逸。
 */
export type DialogWriteFileEntry = { name: string; utf8: string } | { name: string; base64: string };

/** 批量写盘结果：成功写出的绝对路径 + 每个失败条目的原因（部分失败如实上报，不假装全成功）。 */
export interface DialogWriteFilesResult {
	written: string[];
	failed: Array<{ name: string; error: string }>;
}

export interface DialogOpenFileContentsOptions {
	title?: string;
	filters?: Array<{ name: string; extensions: string[] }>;
	/** 允许多选，默认单选。 */
	multiple?: boolean;
	/** 单个文件的字节上限，超过则抛错。默认 64MB。 */
	maxBytes?: number;
}

export interface OpenedFileContents {
	path: string;
	name: string;
	/** base64 编码的文件内容。 */
	data: string;
}

export interface DesktopDialogApi {
	selectFolder(): Promise<string | null>;
	selectFolders(): Promise<string[]>;
	selectImages(): Promise<SelectedImageFile[]>;
	selectFiles(defaultPath?: string): Promise<string[]>;
	/**
	 * 选文件并直接返回内容。给「拿到路径也读不了」的调用方用（插件的 fs 被限制在已授权
	 * 项目根内），避免为读一个文件把整个目录永久加进授权根。取消时返回空数组。
	 */
	openFileContents(options?: DialogOpenFileContentsOptions): Promise<OpenedFileContents[]>;
	/** 使用原生保存对话框写出单文件 HTML；取消时返回 null。 */
	saveHtml(defaultFileName: string, content: string): Promise<string | null>;
	/**
	 * 经原生保存对话框把内存中的字节写到用户选择的路径。
	 * 与 saveCopy 互补——后者要求内容已经在磁盘上。取消时返回 null。
	 */
	saveData(
		defaultFileName: string,
		content: string,
		encoding?: "utf8" | "base64",
		options?: DialogSaveDataOptions,
	): Promise<string | null>;
	/**
	 * 经原生保存对话框把已有文件复制到用户选择的路径。
	 * 源路径需可读（项目根或用户主目录）；取消时返回 null。
	 */
	saveCopy(sourcePath: string, options?: DialogSaveCopyOptions): Promise<string | null>;
	/**
	 * 选单个目录（批量导出落地用）。取消返回 null。
	 * 选中目录会登记为批量写盘的允许目标（见 writeFilesToDirectory）。
	 */
	selectDirectory(): Promise<string | null>;
	/**
	 * 把多个内存文件写进用户**已选**目录（须先经 selectDirectory）。
	 * 只写该目录内的扁平文件名：名字含分隔符 / 逃逸一律拒绝；单个失败不中断整批，结果如实上报。
	 */
	writeFilesToDirectory(input: { directory: string; files: DialogWriteFileEntry[] }): Promise<DialogWriteFilesResult>;
	/**
	 * 把附加图片落盘到 ~/.vetta/image-cache/<sessionId>/，返回路径与压缩文件元数据。
	 * 用于以 @路径 方式引用图片，避免把 base64 直接塞进上下文。
	 */
	persistImages(sessionId: string, images: PersistImageInput[]): Promise<PersistedImageResult[]>;
	/**
	 * 把浏览器 File 直接落盘。真实文件由 Main 读取，虚拟剪贴板文件以二进制传输，
	 * 避免在 Renderer 中生成 base64 字符串。
	 */
	persistImageFiles(sessionId: string, files: File[]): Promise<PersistedImageResult[]>;
}

export type { PersistedImageResult, PersistImageInput } from "../../shared/image-cache.js";
