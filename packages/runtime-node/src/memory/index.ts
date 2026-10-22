// Modified by The Open Forge contributors.

export * from "./embedding/index.js";
export type { ErasureAuditEntry, MemoryErasureOutcome } from "./erasure/index.js";
export { SqliteMemoryErasure } from "./erasure/index.js";
export type { ExportEntry, ImportOutcome } from "./import-export/index.js";
export { exportMemories, importLegacyEntries } from "./import-export/index.js";
export type { EnqueueOptions, MemoryCaptureJob } from "./jobs/index.js";
export { MemoryCaptureQueue } from "./jobs/index.js";
export type { MemorySchemaMigration } from "./migrations/migrations.js";
export { MEMORY_SCHEMA_MIGRATIONS, MEMORY_SCHEMA_VERSION } from "./migrations/migrations.js";
export type {
	HybridCandidate,
	HybridDegradation,
	HybridRetrievalBudget,
	HybridSearchEntry,
	HybridSearchResult,
	LexicalQueryPlan,
	LexicalSearchEntry,
	LexicalSearchResult,
	SemanticChannel,
} from "./retrieval/index.js";
export {
	applyCharacterBudget,
	DEFAULT_HYBRID_BUDGET,
	dedupeByMemory,
	escapeFts5StringLiteral,
	fuseByRank,
	HybridMemoryRetriever,
	LexicalMemoryIndex,
	planLexicalQuery,
	resolveHybridPlan,
	unicodeLength,
} from "./retrieval/index.js";
export type { MemoryStoreLease, SqliteMemoryStoreOptions } from "./worker/memory-worker.js";
export { acquireMemoryStoreLease, SqliteMemoryWorkerStore } from "./worker/memory-worker.js";
export type {
	MemoryWorkerCloseRequest,
	MemoryWorkerOpenRequest,
	MemoryWorkerReadRequest,
	MemoryWorkerRequest,
	MemoryWorkerResponse,
	MemoryWorkerWriteRequest,
} from "./worker/protocol.js";
export { MEMORY_STORE_ERROR_CODES } from "./worker/protocol.js";
export { memoryWorkerSource } from "./worker/worker-source.js";
