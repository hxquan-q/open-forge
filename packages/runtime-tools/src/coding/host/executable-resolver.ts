// Modified by The Open Forge contributors.
export type CodingToolExecutable = "fd" | "rg";

/** 解析记录的来源：缓存目录、PATH、两者皆缺，或此前一次下载尝试失败。 */
export type CodingToolInspectionSource = "cache" | "path" | "missing" | "download-failed";

/**
 * `inspect()` 的只读解析记录。纯静态检查语义：不下载、不联网、不改变解析状态；
 * `version` 尽力而为（PATH 探针输出或缓存侧 `.version` 标记），`lastError` 仅在
 * 同一 resolver 实例内记录过下载失败时出现——跨进程的静态调用方（doctor 出口）
 * 不应依赖它。`download-failed` 只可能由同实例的历史失败把 `missing` 升级而来。
 */
export interface CodingToolInspection {
	readonly tool: CodingToolExecutable;
	readonly source: CodingToolInspectionSource;
	readonly path?: string;
	readonly version?: string;
	readonly lastError?: string;
	readonly offline: boolean;
}

export interface CodingToolExecutableResolver {
	readonly resolve: (tool: CodingToolExecutable) => Promise<string | undefined>;
	/** 可选的只读解析记录面，供诊断出口使用；`resolve()` 合同不受影响。 */
	readonly inspect?: (tool: CodingToolExecutable) => Promise<CodingToolInspection>;
}
