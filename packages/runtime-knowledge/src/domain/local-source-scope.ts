// Copyright The Open Forge contributors.

/**
 * 本地研究来源的检索范围规则（TASK-0025）。
 *
 * Work 模式本地研究的「资料集」是用户显式选定的一个本地目录。本模块定义
 * 哪些文件算可引用来源、哪些路径必须排除、以及来源「缺失/已变更」的判定
 * 规则——检索范围的口径只能在这里改，renderer/工具层不得各自发明。
 */

/** 研究来源允许的文件类型：与 work 画像可读能力对齐（文本/数据/PDF/Office/图片）。 */
export const RESEARCH_SOURCE_EXTENSIONS: ReadonlySet<string> = new Set([
	".md",
	".markdown",
	".txt",
	".log",
	".csv",
	".tsv",
	".json",
	".jsonl",
	".yaml",
	".yml",
	".xml",
	".html",
	".htm",
	".pdf",
	".doc",
	".docx",
	".xls",
	".xlsx",
	".pptx",
	".png",
	".jpg",
	".jpeg",
	".webp",
	".gif",
	".bmp",
]);

/** 递归深度上限：资料集通常是扁平或浅层目录，深层嵌套几乎总是误入的项目树。 */
export const LOCAL_SOURCE_MAX_DEPTH = 6;

/** 单次列出的来源数量上限；超出即截断并如实上报，不静默丢尾部。 */
export const LOCAL_SOURCE_MAX_FILES = 500;

/** 单文件体积上限（字节）。超大文件无法被现有读取工具消费，列为失败而非来源。 */
export const LOCAL_SOURCE_MAX_FILE_BYTES = 256 * 1024 * 1024;

/** 目录级排除：版本控制、依赖与产物目录绝不进入检索范围。 */
const RESEARCH_EXCLUDED_DIRS: ReadonlySet<string> = new Set([
	"node_modules",
	".git",
	".svn",
	".hg",
	"dist",
	"build",
	"out",
	".next",
	".turbo",
	"coverage",
]);

const RESEARCH_EXCLUDED_FILES: ReadonlySet<string> = new Set([
	"package-lock.json",
	"bun.lockb",
	"bun.lock",
	"yarn.lock",
	"pnpm-lock.yaml",
	".DS_Store",
]);

/** 文件名是否属于可引用来源（扩展名口径；大小写不敏感）。 */
export function isResearchSourceFile(name: string): boolean {
	const dot = name.lastIndexOf(".");
	if (dot <= 0) return false;
	if (RESEARCH_EXCLUDED_FILES.has(name)) return false;
	return RESEARCH_SOURCE_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

/** 目录是否应被排除在检索范围外（含隐藏目录）。 */
export function isResearchExcludedDir(name: string): boolean {
	return name.startsWith(".") || RESEARCH_EXCLUDED_DIRS.has(name);
}

export interface LocalSourceEntry {
	/** `file://` URI（posix 分隔符），产物引用清单与模型引用都用它。 */
	readonly uri: string;
	/** 绝对路径（平台分隔符），供 read/extract 工具直接消费。 */
	readonly path: string;
	/** 相对资料集根的路径（posix），展示与去重键。 */
	readonly relativePath: string;
	readonly extension: string;
	readonly sizeBytes: number;
	readonly modifiedAtMs: number;
}

export type LocalSourceFailureReason = "unreadable" | "too_large";

export interface LocalSourceFailure {
	readonly path: string;
	readonly relativePath: string;
	readonly reason: LocalSourceFailureReason;
}

/** 已登记来源在复查时的状态：可恢复判定的全部事实源。 */
export type LocalSourceStatus = "ok" | "missing" | "changed";

export interface LocalSourceCheck {
	readonly uri: string;
	readonly path: string;
	readonly status: LocalSourceStatus;
	/** 复查时观察到的指纹；missing 时缺省。 */
	readonly sizeBytes?: number;
	readonly modifiedAtMs?: number;
}

/** 引用清单里登记的来源指纹。 */
export interface LocalSourceFingerprint {
	readonly path: string;
	readonly sizeBytes: number;
	readonly modifiedAtMs: number;
}

/**
 * 来源指纹对比：mtime 允许 1ms 容差（FAT/网络盘的粒度差异），尺寸必须相等。
 * mtime 与尺寸任一不一致即判 changed——保守误报好过漏报「已变更」。
 */
export function compareLocalSourceState(
	recorded: LocalSourceFingerprint,
	observed: { readonly sizeBytes: number; readonly modifiedAtMs: number } | undefined,
): LocalSourceStatus {
	if (!observed) return "missing";
	if (observed.sizeBytes !== recorded.sizeBytes) return "changed";
	return Math.abs(observed.modifiedAtMs - recorded.modifiedAtMs) <= 1 ? "ok" : "changed";
}
