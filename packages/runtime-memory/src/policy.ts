// Modified by The Open Forge contributors.

import { MEMORY_CONTRACT_ERROR_CODES, MemoryContractError } from "./errors.js";

/**
 * 产品记忆策略（ADR-0149）：与 legacy `memoryMode` 正交的新配置。
 *
 * - `off`：不读写、不采集；不删除既有数据（关闭不是遗忘）。
 * - `explicit`：本地读取与明确记住可用；无自动采集。
 * - `automatic`：在 explicit 基础上允许受预算约束的自动采集/整理；
 *   需要显式配置抽取 Provider 与预算。
 *
 * 旧 `memoryMode`/`memoryFile` 继续表达 IM/CLI legacy rollover 路线
 * （VERIFY-0020 基线），二者互不解释：新策略不读旧字段，旧路径不认新字段。
 */

export const MEMORY_POLICY_MODES = ["off", "explicit", "automatic"] as const satisfies readonly string[];

export type MemoryPolicyMode = (typeof MEMORY_POLICY_MODES)[number];

/** 受预算约束的模型调用输入（自动采集/embedding 用）。 */
export interface MemoryModelBudget {
	/** 固定的模型标识（Provider + 模型名），不借用主会话模型。 */
	readonly model: string;
	readonly maxOutputTokens: number;
	/** 每日调用上限；缺省表示不设日限（仍有单次预算）。 */
	readonly dailyRequestLimit?: number;
}

/** 宿主已解析的策略配置。 */
export interface MemoryPolicyConfiguration {
	readonly mode: MemoryPolicyMode;
	/** 本次会话允许读写的作用域；由宿主按用户设置与项目绑定解析。 */
	readonly allowedScopes: readonly string[];
	/** automatic 必填：抽取预算。 */
	readonly extractionBudget?: MemoryModelBudget;
	/** 可选：语义检索 embedding 预算（未配置时明确降级为词法）。 */
	readonly embeddingBudget?: MemoryModelBudget;
}

export function isMemoryPolicyMode(value: unknown): value is MemoryPolicyMode {
	return typeof value === "string" && (MEMORY_POLICY_MODES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBudget(value: unknown, field: string): MemoryModelBudget {
	if (!isRecord(value)) {
		throw new MemoryContractError(MEMORY_CONTRACT_ERROR_CODES.INVALID_MEMORY_POLICY, `${field} 必须是对象`);
	}
	if (typeof value.model !== "string" || value.model.trim() === "") {
		throw new MemoryContractError(
			MEMORY_CONTRACT_ERROR_CODES.INVALID_MEMORY_POLICY,
			`${field}.model 必须是非空字符串`,
		);
	}
	if (
		typeof value.maxOutputTokens !== "number" ||
		!Number.isInteger(value.maxOutputTokens) ||
		value.maxOutputTokens <= 0
	) {
		throw new MemoryContractError(
			MEMORY_CONTRACT_ERROR_CODES.INVALID_MEMORY_POLICY,
			`${field}.maxOutputTokens 必须是正整数`,
		);
	}
	if (
		value.dailyRequestLimit !== undefined &&
		(typeof value.dailyRequestLimit !== "number" ||
			!Number.isInteger(value.dailyRequestLimit) ||
			value.dailyRequestLimit <= 0)
	) {
		throw new MemoryContractError(
			MEMORY_CONTRACT_ERROR_CODES.INVALID_MEMORY_POLICY,
			`${field}.dailyRequestLimit 必须是正整数`,
		);
	}
	return {
		model: value.model,
		maxOutputTokens: value.maxOutputTokens,
		...(value.dailyRequestLimit === undefined ? {} : { dailyRequestLimit: value.dailyRequestLimit }),
	};
}

/**
 * 首次进入领域边界的结构校验：拒绝非法 mode、空 allowedScopes、
 * automatic 缺预算、off/explicit 携带采集预算等组合。
 */
export function parseMemoryPolicyConfiguration(value: unknown): MemoryPolicyConfiguration {
	if (!isRecord(value)) {
		throw new MemoryContractError(MEMORY_CONTRACT_ERROR_CODES.INVALID_MEMORY_POLICY, "memoryPolicy 必须是对象");
	}
	if (!isMemoryPolicyMode(value.mode)) {
		throw new MemoryContractError(
			MEMORY_CONTRACT_ERROR_CODES.INVALID_MEMORY_POLICY,
			`memoryPolicy.mode 必须是 ${MEMORY_POLICY_MODES.join("/")}`,
		);
	}
	if (!Array.isArray(value.allowedScopes) || value.allowedScopes.length === 0) {
		throw new MemoryContractError(
			MEMORY_CONTRACT_ERROR_CODES.INVALID_MEMORY_POLICY,
			"memoryPolicy.allowedScopes 必须是非空字符串数组",
		);
	}
	for (const scope of value.allowedScopes) {
		if (typeof scope !== "string" || scope.trim() === "") {
			throw new MemoryContractError(
				MEMORY_CONTRACT_ERROR_CODES.INVALID_MEMORY_POLICY,
				"memoryPolicy.allowedScopes 只能包含非空字符串",
			);
		}
	}
	const extractionBudget =
		value.extractionBudget === undefined ? undefined : parseBudget(value.extractionBudget, "extractionBudget");
	const embeddingBudget =
		value.embeddingBudget === undefined ? undefined : parseBudget(value.embeddingBudget, "embeddingBudget");
	if (value.mode === "automatic" && extractionBudget === undefined) {
		throw new MemoryContractError(
			MEMORY_CONTRACT_ERROR_CODES.INVALID_MEMORY_POLICY,
			"automatic 模式必须显式配置 extractionBudget",
		);
	}
	if (value.mode !== "automatic" && extractionBudget !== undefined) {
		throw new MemoryContractError(
			MEMORY_CONTRACT_ERROR_CODES.INVALID_MEMORY_POLICY,
			`${value.mode} 模式不得携带 extractionBudget`,
		);
	}
	return {
		mode: value.mode,
		allowedScopes: [...value.allowedScopes],
		...(extractionBudget ? { extractionBudget } : {}),
		...(embeddingBudget ? { embeddingBudget } : {}),
	};
}
