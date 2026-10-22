// Modified by The Open Forge contributors.
import type { LexicalSearchEntry } from "../retrieval/lexical-index.js";

/**
 * 混合检索融合（TASK-0382）：词法 + 向量各取候选，按名单 rank 的 RRF
 * 融合；融合后重检 scope/status/时间（由调用方过滤后的行进入）。
 * 相似度不当可信度：RRF 只用排名，不混合原始分数。
 */

export interface HybridCandidate {
	readonly memoryId: string;
	readonly revisionId: string;
	readonly content: string;
}

export interface HybridRetrievalBudget {
	/** 每路候选数（词法/向量各取 N）。 */
	readonly candidatesPerChannel: number;
	/** 最终注入条数上限。 */
	readonly maxEntries: number;
	/** 总字符预算（近似 token 预算的上界）。 */
	readonly maxChars: number;
}

export const DEFAULT_HYBRID_BUDGET: HybridRetrievalBudget = {
	candidatesPerChannel: 20,
	maxEntries: 8,
	maxChars: 1536,
};

/** Reciprocal Rank Fusion：score = Σ 1/(k + rank)，k=60（标准初值）。 */
export function fuseByRank(
	channels: readonly (readonly HybridCandidate[])[],
	budget: HybridRetrievalBudget = DEFAULT_HYBRID_BUDGET,
): readonly HybridCandidate[] {
	const scores = new Map<string, { candidate: HybridCandidate; score: number }>();
	const k = 60;
	for (const channel of channels) {
		channel.slice(0, budget.candidatesPerChannel).forEach((candidate, index) => {
			const key = `${candidate.memoryId}#${candidate.revisionId}`;
			const existing = scores.get(key);
			const contribution = 1 / (k + index + 1);
			if (existing) {
				existing.score += contribution;
			} else {
				scores.set(key, { candidate, score: contribution });
			}
		});
	}
	return [...scores.values()]
		.sort((left, right) => right.score - left.score)
		.slice(0, budget.maxEntries)
		.map((entry) => entry.candidate);
}

/** 去同源重复：同 memoryId 只保留融合分最高的一条。 */
export function dedupeByMemory(entries: readonly HybridCandidate[]): readonly HybridCandidate[] {
	const seen = new Set<string>();
	return entries.filter((entry) => {
		if (seen.has(entry.memoryId)) return false;
		seen.add(entry.memoryId);
		return true;
	});
}

export interface LexicalChannelResult {
	readonly entries: readonly LexicalSearchEntry[];
	readonly degraded: boolean;
}

/** 通道降级状态：无模型/超时/索引 epoch 旧时显式退词法并标注。 */
export type HybridDegradation = "none" | "semantic-unavailable" | "semantic-timeout" | "semantic-stale-index";

export function resolveHybridPlan(options: {
	readonly semanticAvailable: boolean;
	readonly semanticTimedOut?: boolean;
	readonly semanticIndexEpochStale?: boolean;
}): { readonly useSemantic: boolean; readonly degradation: HybridDegradation } {
	if (!options.semanticAvailable) {
		return { useSemantic: false, degradation: "semantic-unavailable" };
	}
	if (options.semanticTimedOut) {
		return { useSemantic: false, degradation: "semantic-timeout" };
	}
	if (options.semanticIndexEpochStale) {
		return { useSemantic: false, degradation: "semantic-stale-index" };
	}
	return { useSemantic: true, degradation: "none" };
}

/** 按字符预算截断最终注入列表（pin 由调用方排前，占同一预算）。 */
export function applyCharacterBudget(
	entries: readonly HybridCandidate[],
	budget: HybridRetrievalBudget = DEFAULT_HYBRID_BUDGET,
): readonly HybridCandidate[] {
	const result: HybridCandidate[] = [];
	let used = 0;
	for (const entry of entries) {
		if (result.length >= budget.maxEntries) break;
		if (used + entry.content.length > budget.maxChars) continue;
		result.push(entry);
		used += entry.content.length;
	}
	return result;
}
