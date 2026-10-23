// Modified by The Open Forge contributors.

/**
 * 记忆来源引用合同：一条事实可多来源，一段来源可多事实。
 *
 * 来源是稳定规范 ID（会话/回合/条目/span 或文档版本），不存凭据、
 * thinking、完整系统 Prompt 或原始二进制。来源哈希用于「来源改写后
 * 不沿用旧抽取结果」的幂等判定。
 */

export const MEMORY_SOURCE_ROLES = [
	"user-input",
	"assistant-output",
	"tool-outcome",
	"legacy-import",
] as const satisfies readonly string[];

export type MemorySourceRole = (typeof MEMORY_SOURCE_ROLES)[number];

export interface MemorySourceReference {
	/** 规范来源 ID（如 session/turn/entry/span 或 legacy 文件+行段）。 */
	readonly sourceId: string;
	readonly role: MemorySourceRole;
	/** 来源内容指纹；来源改写/删除后旧派生结果不复活。 */
	readonly contentHash?: string;
	/** 是否允许为该来源保留片段副本（遗忘时按此清理派生物）。 */
	readonly retainsExcerpt?: boolean;
}

export function isMemorySourceRole(value: unknown): value is MemorySourceRole {
	return typeof value === "string" && (MEMORY_SOURCE_ROLES as readonly string[]).includes(value);
}
