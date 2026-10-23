// Modified by The Open Forge contributors.

import { MEMORY_CONTRACT_ERROR_CODES, MemoryContractError } from "./errors.js";
import { isValidAt, type MemoryRevision } from "./records.js";

/**
 * 双时态选择合同：当前值查询不得用「最新写入」替代有效时间规则。
 *
 * - 按 valid time 取当时成立的命题；
 * - 按 knownAt 限制系统当时已知的修订（recordedAt ≤ knownAt）；
 * - 同一时刻多个 active 修订并存时返回全部，由调用方按证据等级/scope 呈现
 *   不确定性，不静默裁决；
 * - 时间输入非法（不可解析/不存在）报 UNKNOWN_VALID_TIME 稳定错误。
 */

export interface TemporalSelector {
	/** 查询的现实时刻（valid time）。 */
	readonly asOf: string;
	/** 系统获知上限（known time）；缺省为不限制（当前知识视图）。 */
	readonly knownAt?: string;
}

function requireTimestamp(value: string, field: string): string {
	if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/.test(value)) {
		throw new MemoryContractError(
			MEMORY_CONTRACT_ERROR_CODES.UNKNOWN_VALID_TIME,
			`${field} 不是可解析的时间：${value}`,
		);
	}
	return value;
}

export function parseTemporalSelector(value: unknown): TemporalSelector {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new MemoryContractError(MEMORY_CONTRACT_ERROR_CODES.INVALID_MEMORY_INPUT, "temporal selector 必须是对象");
	}
	const record = value as Record<string, unknown>;
	if (typeof record.asOf !== "string") {
		throw new MemoryContractError(MEMORY_CONTRACT_ERROR_CODES.INVALID_MEMORY_INPUT, "asOf 必须是时间字符串");
	}
	requireTimestamp(record.asOf, "asOf");
	if (record.knownAt !== undefined) {
		if (typeof record.knownAt !== "string") {
			throw new MemoryContractError(MEMORY_CONTRACT_ERROR_CODES.INVALID_MEMORY_INPUT, "knownAt 必须是时间字符串");
		}
		requireTimestamp(record.knownAt, "knownAt");
	}
	return { asOf: record.asOf, ...(record.knownAt === undefined ? {} : { knownAt: record.knownAt }) };
}

/**
 * 选出在 `selector` 视角下成立（且当时已知）的修订。
 * 纯函数：不查库、不解歧，多候选原样返回。
 */
export function selectEffectiveRevisions(
	revisions: readonly MemoryRevision[],
	selector: TemporalSelector,
): MemoryRevision[] {
	const knownAt = selector.knownAt;
	return revisions.filter((revision) => {
		if (revision.recordedAt === "unknown") {
			return knownAt === undefined;
		}
		if (knownAt !== undefined && revision.recordedAt > knownAt) {
			return false;
		}
		return isValidAt(revision, selector.asOf);
	});
}
