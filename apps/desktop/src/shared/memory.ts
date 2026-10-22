// Modified by The Open Forge contributors.

/**
 * 记忆控制面共享合同（TASK-0376）。
 *
 * Renderer 只通过本合同与主进程通信：不暴露 principalId、数据库路径或
 * 任意 SQL；分页/expectedRevision/来源访问都在主进程授权后执行。
 * 忘记与工具走同一 erasure 事务合同；「处理原始来源」只转发用户选择，
 * 不在控制面伪装完成。
 */

export const MEMORY_CONTROL_CHANNELS = {
	LIST: "vetta:memory:list",
	SEARCH: "vetta:memory:search",
	DETAIL: "vetta:memory:detail",
	CORRECT: "vetta:memory:correct",
	FORGET: "vetta:memory:forget",
	POLICY: "vetta:memory:policy",
} as const;

export type MemoryControlScopeName = "user" | "project" | "all";

export interface MemoryListItem {
	readonly memoryId: string;
	readonly revisionId: string;
	readonly content: string;
	readonly scopeName: string;
	readonly status: string;
	readonly validFrom: string;
	readonly recordedAt: string;
	readonly pinned: boolean;
	readonly evidence: string;
}

export interface MemoryListRequest {
	readonly scope?: MemoryControlScopeName;
	readonly page?: number;
	readonly pageSize?: number;
}

export interface MemoryListResult {
	readonly items: readonly MemoryListItem[];
	readonly page: number;
	readonly pageSize: number;
	readonly hasMore: boolean;
}

export interface MemorySearchRequest {
	readonly query: string;
	readonly scope?: MemoryControlScopeName;
	readonly limit?: number;
}

export interface MemorySearchResult {
	readonly items: readonly MemoryListItem[];
	readonly degraded: boolean;
}

export interface MemoryRevisionItem {
	readonly revisionId: string;
	readonly revisionNo: number;
	readonly content: string;
	readonly status: string;
	readonly validFrom: string;
	readonly recordedAt: string;
}

export interface MemorySourceItem {
	readonly sourceId: string;
	readonly role: string;
}

export interface MemoryDetailRequest {
	readonly memoryId: string;
}

export interface MemoryDetailResult {
	readonly memoryId: string;
	readonly revisions: readonly MemoryRevisionItem[];
	readonly sources: readonly MemorySourceItem[];
}

export interface MemoryCorrectRequest {
	readonly memoryId: string;
	readonly expectedRevision: number;
	readonly content: string;
}

export interface MemoryCorrectResult {
	readonly memoryId: string;
	readonly revision: number;
}

export interface MemoryForgetRequest {
	readonly memoryId: string;
	/** 用户明确选择时才为 true：转发给宿主的来源处理流程，不在此伪装完成。 */
	readonly alsoProcessSources?: boolean;
}

export interface MemoryForgetResult {
	readonly memoryId: string;
	readonly erasureEpoch: number;
	readonly alsoProcessSourcesAccepted: boolean;
}

export type MemoryPolicyModeDto = "off" | "explicit" | "automatic";

export interface MemoryPolicyState {
	readonly mode: MemoryPolicyModeDto;
	/** automatic 模式下用户配置的预算（脱敏：不含任何凭据）。 */
	readonly extractionModel?: string;
	readonly dailyRequestLimit?: number;
}

export interface DesktopMemoryControlApi {
	listMemories: (request?: MemoryListRequest) => Promise<MemoryListResult>;
	searchMemories: (request: MemorySearchRequest) => Promise<MemorySearchResult>;
	getMemoryDetail: (request: MemoryDetailRequest) => Promise<MemoryDetailResult>;
	correctMemory: (request: MemoryCorrectRequest) => Promise<MemoryCorrectResult>;
	forgetMemory: (request: MemoryForgetRequest) => Promise<MemoryForgetResult>;
	getMemoryPolicy: () => Promise<MemoryPolicyState>;
	setMemoryPolicy: (state: MemoryPolicyState) => Promise<MemoryPolicyState>;
}
