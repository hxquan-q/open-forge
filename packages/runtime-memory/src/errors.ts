// Modified by The Open Forge contributors.

/**
 * 稳定错误码（ADR-0150）。错误码是跨宿主合同：一旦发布不得改语义或复用编号，
 * 新增只能追加。文本 message 面向人，code 面向程序分支。
 */
export const MEMORY_CONTRACT_ERROR_CODES = {
	/** 输入结构/类型/常量不合法（首次进入领域边界的校验失败）。 */
	INVALID_MEMORY_INPUT: "INVALID_MEMORY_INPUT",
	/** 请求或写入的作用域不在授权列表内。 */
	SCOPE_NOT_ALLOWED: "SCOPE_NOT_ALLOWED",
	/** 有效时间（valid time）无法解析或不存在。 */
	UNKNOWN_VALID_TIME: "UNKNOWN_VALID_TIME",
	/** correct/提交时 expectedRevision 与当前修订不符。 */
	REVISION_CONFLICT: "REVISION_CONFLICT",
	/** 目标记忆家族已被遗忘（erasure epoch 撤销）。 */
	MEMORY_SUPPRESSED: "MEMORY_SUPPRESSED",
	/** 策略组合非法（如 off 下携带采集预算）。 */
	INVALID_MEMORY_POLICY: "INVALID_MEMORY_POLICY",
} as const;

export type MemoryContractErrorCode = (typeof MEMORY_CONTRACT_ERROR_CODES)[keyof typeof MEMORY_CONTRACT_ERROR_CODES];

export class MemoryContractError extends Error {
	readonly code: MemoryContractErrorCode;

	constructor(code: MemoryContractErrorCode, message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "MemoryContractError";
		this.code = code;
	}
}
