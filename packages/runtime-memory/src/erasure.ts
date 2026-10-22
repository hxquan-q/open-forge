// Modified by The Open Forge contributors.

import { MEMORY_CONTRACT_ERROR_CODES, MemoryContractError } from "./errors.js";

/**
 * 遗忘屏障合同（REQ-0027「用户可以忘记」/ PLAN-0021「用户控制与遗忘」）。
 *
 * 遗忘是家族级事务：提高 erasure epoch → 禁止检索 → 清除内容与派生物
 * （FTS/向量/摘要/缓存）→ 阻断旧来源重抽取。逻辑不可召回 ≠ 物理清除：
 * WAL/备份/用户自导副本的边界由宿主如实说明。
 */

export interface MemoryErasureState {
	/** 单调递增的全局撤销纪元；写入前必须重检。 */
	readonly erasureEpoch: number;
	/** 已遗忘的家族集合（不含正文）。 */
	readonly suppressedMemoryIds: readonly string[];
}

export function isSuppressed(memoryId: string, state: MemoryErasureState): boolean {
	return state.suppressedMemoryIds.includes(memoryId);
}

/** 提交前重检：已遗忘的家族拒绝一切写入/更新，绝不恢复 parent 为当前值。 */
export function assertNotSuppressed(memoryId: string, state: MemoryErasureState): void {
	if (isSuppressed(memoryId, state)) {
		throw new MemoryContractError(
			MEMORY_CONTRACT_ERROR_CODES.MEMORY_SUPPRESSED,
			`记忆 ${memoryId} 已被遗忘（erasure epoch ${state.erasureEpoch}），拒绝写入`,
		);
	}
}

/** 相邻任务即使模型已返回也须在提交前重检 epoch：所见纪元落后即拒绝。 */
export function assertErasureEpochFresh(seenEpoch: number, state: MemoryErasureState): void {
	if (!Number.isInteger(seenEpoch) || seenEpoch < 0) {
		throw new MemoryContractError(MEMORY_CONTRACT_ERROR_CODES.INVALID_MEMORY_INPUT, "erasure epoch 必须是非负整数");
	}
	if (seenEpoch < state.erasureEpoch) {
		throw new MemoryContractError(
			MEMORY_CONTRACT_ERROR_CODES.MEMORY_SUPPRESSED,
			`erasure epoch 已前进（所见 ${seenEpoch} < 当前 ${state.erasureEpoch}），提交前须重检`,
		);
	}
}
