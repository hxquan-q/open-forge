// Modified by The Open Forge contributors.

import { MEMORY_CONTRACT_ERROR_CODES, MemoryContractError } from "./errors.js";
import type { MemoryPolicyConfiguration } from "./policy.js";
import { parseMemoryPolicyConfiguration } from "./policy.js";

/**
 * 新旧记忆配置的正交性解析（ADR-0149 / VERIFY-0020 基线）。
 *
 * legacy `memoryMode`（IM/CLI rollover，MEMORY.md/JOURNAL.md 文件快照）与
 * 新 `memoryPolicy`（结构化记忆）是两条独立线路：
 *
 * - 未提供 memoryPolicy 时：新记忆保持关闭，legacy 字段原样生效
 *   （旧行为零变化）；
 * - memoryPolicy.mode = "off"：新记忆关闭。**不**解读、不覆盖、不删除
 *   legacy 字段——off 关闭的是新线路，不是旧线路；
 * - legacy memoryMode 与新 policy 可同时启用（IM 场景），互不注入语义。
 */

/** legacy 字段的类型化形状（仅声明，不赋默认值；语义见 VERIFY-0020）。 */
export interface LegacyMemoryFields {
	readonly memoryMode?: boolean;
	readonly memoryFile?: string;
	readonly memoryCharLimit?: number;
}

export interface ResolvedMemoryRuntimePolicy {
	/** legacy rollover 线路是否启用（仅由 legacy 字段决定）。 */
	readonly legacyRolloverEnabled: boolean;
	/** 新结构化记忆线路的策略；缺省表示本次会话未启用新线路。 */
	readonly memoryPolicy: MemoryPolicyConfiguration | undefined;
}

/**
 * 唯一解析入口：两侧输入只影响各自输出。任何一侧的开启都不得改变另一侧字段
 * 的含义；roundtrip 后再解析结果稳定。
 */
export function resolveMemoryRuntimePolicy(input: {
	legacy?: LegacyMemoryFields;
	memoryPolicy?: unknown;
}): ResolvedMemoryRuntimePolicy {
	const legacy = input.legacy ?? {};
	if (legacy.memoryMode !== undefined && typeof legacy.memoryMode !== "boolean") {
		throw new MemoryContractError(MEMORY_CONTRACT_ERROR_CODES.INVALID_MEMORY_INPUT, "memoryMode 必须是 boolean");
	}
	if (legacy.memoryFile !== undefined && (typeof legacy.memoryFile !== "string" || legacy.memoryFile.trim() === "")) {
		throw new MemoryContractError(MEMORY_CONTRACT_ERROR_CODES.INVALID_MEMORY_INPUT, "memoryFile 必须是非空字符串");
	}
	if (
		legacy.memoryCharLimit !== undefined &&
		(typeof legacy.memoryCharLimit !== "number" ||
			!Number.isInteger(legacy.memoryCharLimit) ||
			legacy.memoryCharLimit <= 0)
	) {
		throw new MemoryContractError(MEMORY_CONTRACT_ERROR_CODES.INVALID_MEMORY_INPUT, "memoryCharLimit 必须是正整数");
	}
	const memoryPolicy =
		input.memoryPolicy === undefined ? undefined : parseMemoryPolicyConfiguration(input.memoryPolicy);
	return {
		legacyRolloverEnabled: legacy.memoryMode === true || legacy.memoryFile !== undefined,
		memoryPolicy,
	};
}
