// Modified by The Open Forge contributors.

export type {
	HybridCandidate,
	HybridDegradation,
	HybridRetrievalBudget,
} from "./hybrid-fusion.js";
export {
	applyCharacterBudget,
	DEFAULT_HYBRID_BUDGET,
	dedupeByMemory,
	fuseByRank,
	resolveHybridPlan,
} from "./hybrid-fusion.js";
export type {
	HybridSearchEntry,
	HybridSearchResult,
	SemanticChannel,
} from "./hybrid-retriever.js";
export { HybridMemoryRetriever } from "./hybrid-retriever.js";
export type { LexicalSearchEntry, LexicalSearchResult } from "./lexical-index.js";
export { LexicalMemoryIndex } from "./lexical-index.js";
export type { LexicalQueryPlan } from "./lexical-query.js";
export { escapeFts5StringLiteral, planLexicalQuery, unicodeLength } from "./lexical-query.js";
