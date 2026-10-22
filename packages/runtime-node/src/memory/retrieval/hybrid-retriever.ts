// Modified by The Open Forge contributors.
import type { MemoryScope } from "@vetta/runtime-memory";
import {
	applyCharacterBudget,
	DEFAULT_HYBRID_BUDGET,
	dedupeByMemory,
	fuseByRank,
	type HybridCandidate,
	type HybridDegradation,
	type HybridRetrievalBudget,
	resolveHybridPlan,
} from "./hybrid-fusion.js";
import type { LexicalMemoryIndex } from "./lexical-index.js";

/**
 * 混合检索执行器（TASK-0382）：词法（FTS）+ 语义双通道 RRF 融合。
 * 语义通道由注入的回调承担（向量全量分块 cosine，不先截词法 top-k）；
 * 无模型/超时/索引旧 epoch 显式降级为词法单路并标注。
 */

export interface HybridSearchEntry extends HybridCandidate {
	readonly matchKind: "lexical" | "fused";
}

export interface HybridSearchResult {
	readonly entries: readonly HybridSearchEntry[];
	readonly degradation: HybridDegradation;
	readonly lexicalDegraded: boolean;
}

export type SemanticChannel = (query: string, scope: MemoryScope, limit: number) => Promise<readonly HybridCandidate[]>;

export class HybridMemoryRetriever {
	constructor(
		private readonly options: {
			readonly lexical: LexicalMemoryIndex;
			readonly semantic?: { readonly search: SemanticChannel };
			readonly budget?: HybridRetrievalBudget;
			readonly semanticTimeoutMs?: number;
		},
	) {}

	async search(scope: MemoryScope, query: string, selector: { readonly asOf: string }): Promise<HybridSearchResult> {
		const budget = this.options.budget ?? DEFAULT_HYBRID_BUDGET;
		const plan = resolveHybridPlan({ semanticAvailable: this.options.semantic !== undefined });
		const lexicalResult = this.options.lexical.search(scope, query, selector, budget.candidatesPerChannel);
		const lexicalChannel: HybridCandidate[] = lexicalResult.entries.map((entry) => ({
			memoryId: entry.memoryId,
			revisionId: entry.revisionId,
			content: entry.content,
		}));

		if (!plan.useSemantic) {
			return {
				entries: lexicalChannel.slice(0, budget.maxEntries).map((entry) => ({
					...entry,
					matchKind: "lexical" as const,
				})),
				degradation: plan.degradation,
				lexicalDegraded: lexicalResult.degraded,
			};
		}

		let semanticChannel: readonly HybridCandidate[] = [];
		let degradation: HybridDegradation = "none";
		try {
			semanticChannel = await withSoftTimeout(
				this.options.semantic!.search(query, scope, budget.candidatesPerChannel),
				this.options.semanticTimeoutMs ?? 2_000,
			);
		} catch {
			degradation = "semantic-timeout";
		}

		const fused = dedupeByMemory(fuseByRank([lexicalChannel, semanticChannel], budget));
		return {
			entries: applyCharacterBudget(fused, budget).map((entry) => ({ ...entry, matchKind: "fused" as const })),
			degradation,
			lexicalDegraded: lexicalResult.degraded,
		};
	}
}

function withSoftTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return Promise.race([
		promise,
		new Promise<T>((_, reject) =>
			setTimeout(() => reject(new Error(`semantic retrieval timed out after ${ms}ms`)), ms),
		),
	]);
}
