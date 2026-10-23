// Modified by The Open Forge contributors.
import type { MemoryPolicyConfiguration } from "@vetta/runtime-memory";

/**
 * 记忆运行时装配合同（ADR-0149 / TASK-0369）。
 *
 * 两条线路在此汇合但互不解释：
 * - legacy rollover（`memoryMode`/`memoryFile`/`memoryCharLimit`）：
 *   IM/CLI 的 MEMORY.md/JOURNAL.md 文件快照线路（VERIFY-0020 基线），
 *   由宿主工厂 `createMemoryRolloverRuntime` 构造，行为保持不变；
 * - 结构化记忆（`memoryPolicy`）：REQ-0027 新线路的策略输入，
 *   由宿主解析后随会话下发；具体存储/检索运行时属后续切片
 *   （PLAN-0021 S2+），本合同只定义会话侧的输入形状。
 */
export interface CodingAgentMemoryRuntimeFactoryOptions {
	readonly cwd: string;
	readonly memoryFile?: string;
	readonly memoryCharLimit?: number;
	/**
	 * 新结构化记忆策略（可选）：未提供表示本会话未启用新线路；
	 * 与 legacy 字段正交，任何一侧不改变另一侧语义。
	 */
	readonly memoryPolicy?: MemoryPolicyConfiguration;
}
