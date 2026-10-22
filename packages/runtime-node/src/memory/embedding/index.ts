// Copyright The Open Forge contributors.

export type {
	DeterministicEmbeddingOptions,
	EmbeddingAdapter,
	EmbeddingAdapterErrorCode,
	EmbeddingInputKind,
	EmbeddingModelDescriptor,
	EmbeddingVectorSpaceKey,
	LocalEmbeddingArtifactSpec,
	LocalEmbeddingResourceStatus,
	LocalEmbeddingRuntime,
	LocalEmbeddingSession,
	OnnxEmbeddingAdapterOptions,
} from "./embedding-adapter.js";
export {
	createDeterministicEmbeddingAdapter,
	createOnnxEmbeddingAdapter,
	EMBEDDING_ADAPTER_ERROR_CODES,
	EmbeddingAdapterError,
	l2Normalize,
	resolveLocalEmbeddingResource,
	sameVectorSpace,
	sha256File,
	vectorSpaceKeyOf,
} from "./embedding-adapter.js";
export type {
	EmbeddingJobRunContext,
	EmbeddingJobRunOutcome,
	EnqueueEmbeddingOptions,
	MemoryEmbeddingJob,
} from "./embedding-jobs.js";
export { drainEmbeddingJobs, MemoryEmbeddingJobQueue, runEmbeddingJob } from "./embedding-jobs.js";
export type { VectorPutEntry, VectorSearchHit, VectorSearchOptions } from "./vector-store.js";
export { VectorMemoryStore } from "./vector-store.js";
