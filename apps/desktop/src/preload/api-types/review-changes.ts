import type { ReviewRollbackOutcome } from "@vetta/runtime-storage/conversation";

export interface ReviewChangeRollbackInput {
	readonly sessionId: string;
	readonly snapshotId: string;
}

/**
 * Write/Edit 审查快照的回滚通道。只暴露「按会话 + 快照 id 还原」这一个动作：
 * 目标路径与 before 字节都留在快照库里，渲染进程拿不到也改不了。
 */
export interface DesktopReviewChangesApi {
	rollback(input: ReviewChangeRollbackInput): Promise<ReviewRollbackOutcome>;
}
