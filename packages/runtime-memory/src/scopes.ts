// Modified by The Open Forge contributors.

/**
 * 记忆作用域合同（REQ-0027 / PLAN-0021「身份与作用域」）。
 *
 * scope 的值由宿主绑定：principal/project/workspaceView 由宿主身份解析器给出，
 * 模型与 Renderer 不得自述。本包只定义形状与授权判定，不解析路径或 Git。
 */

/** 三层作用域：用户全局 / 项目 / 任务（含会话内临时事实）。 */
export const MEMORY_SCOPE_NAMES = ["user", "project", "task"] as const satisfies readonly string[];

export type MemoryScopeName = (typeof MEMORY_SCOPE_NAMES)[number];

/** Agent 可见性：用户全局偏好、项目知识、Agent 私有经验分开召回。 */
export const MEMORY_VISIBILITIES = ["user-visible", "agent-private"] as const satisfies readonly string[];

export type MemoryVisibility = (typeof MEMORY_VISIBILITIES)[number];

/** 宿主绑定的记忆身份。所有字段为宿主已解析的稳定标识，不含凭据正文。 */
export interface MemoryScopeIdentity {
	/** 安装/配置档级主体 ID；不随 Provider 切换变化。 */
	readonly principalId: string;
	/** 项目 UUID（记忆解析器映射，不使用临时 cwd/UUID）。 */
	readonly projectId?: string;
	/** 同项目下特定 Worktree/工作区视图；缺省表示项目级。 */
	readonly workspaceViewId?: string;
}

/** 一条记忆/一次查询声明的作用域。 */
export interface MemoryScope {
	readonly name: MemoryScopeName;
	readonly identity: MemoryScopeIdentity;
	readonly visibility?: MemoryVisibility;
}

export function isMemoryScopeName(value: unknown): value is MemoryScopeName {
	return typeof value === "string" && (MEMORY_SCOPE_NAMES as readonly string[]).includes(value);
}

export function isMemoryVisibility(value: unknown): value is MemoryVisibility {
	return typeof value === "string" && (MEMORY_VISIBILITIES as readonly string[]).includes(value);
}

/**
 * 授权判定：`requested` 必须逐字段落在 `allowed` 内。task 作用域额外允许
 * 绑定 workspaceViewId（同一 project 下的并行视图互不可见）。
 */
export function isScopeAllowed(requested: MemoryScope, allowed: readonly MemoryScope[]): boolean {
	return allowed.some(
		(entry) =>
			entry.name === requested.name &&
			entry.identity.principalId === requested.identity.principalId &&
			(entry.identity.projectId ?? undefined) === (requested.identity.projectId ?? undefined) &&
			(entry.identity.workspaceViewId ?? undefined) === (requested.identity.workspaceViewId ?? undefined) &&
			(entry.visibility ?? "user-visible") === (requested.visibility ?? "user-visible"),
	);
}
