// Modified by The Open Forge contributors.

import type { MemoryRevision } from "./records.js";
import type { MemoryScope } from "./scopes.js";
import type { MemorySourceReference } from "./sources.js";
import type { TemporalSelector } from "./temporal.js";

/**
 * 存储端口合同：runtime-node 的 SQLite 实现与产品测试替身共同实现。
 * 端口在包内只定义接口；事务、租约、worker 与资源生命周期是实现侧职责
 * （PLAN-0021「SQLite 驱动与进程」）。
 */

/** 事务性写入结果：返回稳定 ID 与修订号供调用方核对。 */
export interface MemoryWriteResult {
	readonly memoryId: string;
	readonly revision: number;
	/** 保存状态：失败必须如实报错，不返回 0 假装成功。 */
	readonly status: "saved";
}

export interface MemoryRevisionStore {
	/** 按授权 scope + 时间选择器读取；实现必须先过滤授权再看时间。 */
	readonly read: (scope: MemoryScope, selector: TemporalSelector) => Promise<readonly MemoryRevision[]>;
	readonly write: (
		scope: MemoryScope,
		command: import("./commands.js").MemoryWriteCommand,
	) => Promise<MemoryWriteResult>;
	/** 列出家族修订（分页），供详情/导出。 */
	readonly listRevisions: (memoryId: string, scope: MemoryScope) => Promise<readonly MemoryRevision[]>;
	/** 来源引用读取（授权范围内）。 */
	readonly listSources: (memoryId: string, scope: MemoryScope) => Promise<readonly MemorySourceReference[]>;
}
