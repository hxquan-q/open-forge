// Modified by The Open Forge contributors.
import type { MemoryRevision } from "@vetta/runtime-memory";

/**
 * 注入预算分配（TASK-0382）：pin 稳定占预算 + 动态召回共享余量；
 * 总量不超过可调初值（默认 8 条 / 1536 字符，还受上下文余量限制）。
 * 相似度不当可信度：排序输入的证据等级优先，召回相关度只影响动态区顺序。
 */

export interface InjectionBudget {
	readonly maxEntries: number;
	readonly maxChars: number;
}

export const DEFAULT_INJECTION_BUDGET: InjectionBudget = { maxEntries: 8, maxChars: 1536 };

/** 上下文余量约束：预算取「注入初值」与「当前上下文剩余字符」的较小值。 */
export function resolveEffectiveBudget(
	base: InjectionBudget,
	contextRemainingChars: number | undefined,
): InjectionBudget {
	if (contextRemainingChars === undefined || contextRemainingChars >= base.maxChars) return base;
	return { maxEntries: base.maxEntries, maxChars: Math.max(0, contextRemainingChars) };
}

/**
 * 分配注入列表：pinned 条目稳定在前并占预算；动态召回（相关度排序）
 * 填充余量；全局偏好不得挤掉全部项目证据（user 与 project 各保底 2 条，
 * 若该 scope 有候选）。
 */
export function allocateInjection(options: {
	readonly pinned: readonly MemoryRevision[];
	readonly dynamic: readonly MemoryRevision[];
	readonly budget?: InjectionBudget;
	readonly minPerScope?: number;
}): readonly MemoryRevision[] {
	const budget = options.budget ?? DEFAULT_INJECTION_BUDGET;
	const minPerScope = options.minPerScope ?? 2;
	const result: MemoryRevision[] = [];
	let used = 0;
	const push = (revision: MemoryRevision): boolean => {
		if (result.length >= budget.maxEntries) return false;
		if (used + revision.content.length > budget.maxChars) return false;
		result.push(revision);
		used += revision.content.length;
		return true;
	};

	for (const revision of options.pinned) {
		push(revision);
	}

	// 动态区按 scope 保底：user/project 各自前 minPerScope 条优先入列。
	const byScope = new Map<string, MemoryRevision[]>();
	for (const revision of options.dynamic) {
		const list = byScope.get(revision.scopeName) ?? [];
		list.push(revision);
		byScope.set(revision.scopeName, list);
	}
	for (const [, revisions] of byScope) {
		for (const revision of revisions.slice(0, minPerScope)) {
			if (!result.includes(revision)) push(revision);
		}
	}
	for (const revision of options.dynamic) {
		if (!result.includes(revision)) push(revision);
	}
	return result;
}
