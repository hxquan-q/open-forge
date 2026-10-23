// Modified by The Open Forge contributors.

/**
 * 记忆库迁移声明（TASK-0371）。迁移单调追加：已发布版本不可修改；
 * 旧实现遇到更高版本库必须拒绝打开（SCHEMA_INCOMPATIBLE），不允许
 * 空库重建掩盖不兼容。执行体随 worker 引导源内嵌，本模块暴露版本
 * 事实供宿主与测试对齐。
 */

/** 当前实现支持的 schema 版本（worker 引导源内嵌同值）。 */
export const MEMORY_SCHEMA_VERSION = 2;

export interface MemorySchemaMigration {
	readonly version: number;
	readonly summary: string;
}

/** 已发布迁移清单；新增只追加。 */
export const MEMORY_SCHEMA_MIGRATIONS: readonly MemorySchemaMigration[] = [
	{
		version: 1,
		summary:
			"identity bindings、memory_revisions（双时态修订链）、memory_sources（来源引用）、memory_erasure（撤销纪元）、memory_suppressed（遗忘家族）与 scope/status 索引",
	},
	{
		// v2（BUG-0147/R1）：memory_revisions 增完整身份列；旧行身份为空串
		// ——不进入任何具名 scope 读写，不猜测项目、不自动提升全局，待显式迁移。
		version: 2,
		summary: "memory_revisions 完整作用域身份列（principal/project/workspaceView）与身份索引；旧行空身份隔离",
	},
];
