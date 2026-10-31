// Modified by The Open Forge contributors.

/** 单条工作区变更：porcelain 的 XY 码收敛为用户可读的四类。 */
export interface GitRepoChange {
	readonly path: string;
	readonly status: "added" | "modified" | "deleted" | "untracked" | "renamed";
}

export interface GitRepoStatus {
	readonly branch: string;
	/** 分叉（detached HEAD）时的短 SHA，正常分支为空串。 */
	readonly head: string;
	readonly changes: readonly GitRepoChange[];
}

/** 非 git 仓库、git 不在 PATH 或命令失败时统一为 null，调用方按「无 git 信息」呈现。 */
export type GitRepoStatusResult = GitRepoStatus | null;

export interface DesktopGitApi {
	/** 只读仓库状态（分支 + 变更列表）；非 git 仓库 / git 缺失返回 null。 */
	getRepoStatus(cwd: string): Promise<GitRepoStatusResult>;
}
