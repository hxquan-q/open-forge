// Modified by The Open Forge contributors.

/**
 * 记忆修订与双时态字段合同（PLAN-0021「数据合同与存储」）。
 *
 * 记忆按家族（memoryId）组织，家族内是单调追加的修订链：
 * - valid time（validFrom/validTo，开区间）：命题在现实中成立的时间；
 * - known time（recordedAt）：系统获知该修订的时间；
 * - 迟到更正追加新修订，不覆写历史；validTo 为空表示「至今仍成立」，
 *   未知时间显式用 UNKNOWN，不猜测。
 */

/** 显式未知（区别于“至今”，也区别于缺省）。 */
export const UNKNOWN_VALID_TIME = "unknown" as const;

export type MemoryValidTime = string | typeof UNKNOWN_VALID_TIME;

/** 记忆种类：事实/偏好/约定/经验候选等；kind 不参与冲突判定。 */
export const MEMORY_KINDS = [
	"fact",
	"preference",
	"convention",
	"experience-candidate",
] as const satisfies readonly string[];

export type MemoryKind = (typeof MEMORY_KINDS)[number];

/** 修订状态：superseded 由新修订接管；retracted 是主动撤回（家族仍在）。 */
export const MEMORY_REVISION_STATUSES = ["active", "superseded", "retracted"] as const satisfies readonly string[];

export type MemoryRevisionStatus = (typeof MEMORY_REVISION_STATUSES)[number];

/** 证据等级：助手口说 < 工具结果 < 用户确认。相似度不是可信度。 */
export const MEMORY_EVIDENCE_LEVELS = [
	"claimed",
	"tool-verified",
	"user-confirmed",
] as const satisfies readonly string[];

export type MemoryEvidenceLevel = (typeof MEMORY_EVIDENCE_LEVELS)[number];

/** 一条不可变修订（隐私删除例外见 erasure.ts）。 */
export interface MemoryRevision {
	readonly memoryId: string;
	readonly revisionId: string;
	readonly kind: MemoryKind;
	readonly content: string;
	readonly scopeName: string;
	readonly visibility?: string;
	readonly status: MemoryRevisionStatus;
	/** 有效时间起点（含）；ISO 时间串或 "unknown"。 */
	readonly validFrom: MemoryValidTime;
	/** 有效时间终点（不含）；空串表示开放区间。 */
	readonly validTo: MemoryValidTime | "";
	/** 获知时间（含）；ISO 时间串或 "unknown"。 */
	readonly recordedAt: MemoryValidTime;
	/** 被本修订接管的上一修订；家族首修订为空。 */
	readonly supersedes: string | "";
	readonly evidence: MemoryEvidenceLevel;
	readonly pinned?: boolean;
}

export function isMemoryKind(value: unknown): value is MemoryKind {
	return typeof value === "string" && (MEMORY_KINDS as readonly string[]).includes(value);
}

export function isMemoryRevisionStatus(value: unknown): value is MemoryRevisionStatus {
	return typeof value === "string" && (MEMORY_REVISION_STATUSES as readonly string[]).includes(value);
}

export function isMemoryEvidenceLevel(value: unknown): value is MemoryEvidenceLevel {
	return typeof value === "string" && (MEMORY_EVIDENCE_LEVELS as readonly string[]).includes(value);
}

/** valid time 是否覆盖查询点 t：开区间 (validFrom, validTo) 语义，unknown 不匹配任何点。 */
export function isValidAt(revision: Pick<MemoryRevision, "validFrom" | "validTo">, at: string): boolean {
	if (revision.validFrom === UNKNOWN_VALID_TIME || revision.validTo === UNKNOWN_VALID_TIME) {
		return false;
	}
	if (revision.validFrom > at) {
		return false;
	}
	if (revision.validTo !== "" && revision.validTo <= at) {
		return false;
	}
	return true;
}
