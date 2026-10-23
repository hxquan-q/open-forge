// Copyright The Open Forge contributors.
import type { MemoryScope } from "@vetta/runtime-memory";
import { SqliteMemoryErasure } from "./erasure/memory-erasure.js";
import { MemoryCaptureQueue } from "./jobs/memory-capture-queue.js";
import { HybridMemoryRetriever, type SemanticChannel } from "./retrieval/hybrid-retriever.js";
import { LexicalMemoryIndex } from "./retrieval/lexical-index.js";
import { acquireMemoryStoreLease } from "./worker/memory-worker.js";

/**
 * 持久记忆会话存储适配器（BUG-0149/R5）：为 coding-agent 的可移植装配
 * 端口（PersistentMemoryStoragePort 的结构实现）提供 runtime-node 侧
 * 构造。宿主（Desktop composition/CLI/测试）用本适配器注入；语义层不
 * import 本模块，保持记忆语义的平台无关边界（架构门禁）。
 */

export interface RuntimeNodeMemoryStorageOptions {
	/** 模型就绪时由宿主注入的语义通道；缺省混合检索降级词法。 */
	readonly semantic?: SemanticChannel;
}

export function createRuntimeNodePersistentMemoryStorage(options: RuntimeNodeMemoryStorageOptions = {}) {
	return {
		async acquireLease(leaseOptions: {
			readonly databasePath: string;
			readonly allowedScopes: readonly MemoryScope[];
			readonly owner: string;
		}) {
			return acquireMemoryStoreLease(leaseOptions);
		},
		async openErasure(databasePath: string) {
			return SqliteMemoryErasure.open({ databasePath });
		},
		async openCaptureQueue(databasePath: string) {
			return MemoryCaptureQueue.open({ databasePath });
		},
		createHybridRetriever(retrieverOptions: {
			/** 宿主已打开的词法索引（与装配 options.lexical 同一实例；opaque 句柄）。 */
			readonly lexical: object;
			readonly semantic?: { readonly search: SemanticChannel };
		}) {
			const semanticChannel =
				retrieverOptions.semantic === undefined ? options.semantic : retrieverOptions.semantic.search;
			const retriever = new HybridMemoryRetriever({
				lexical: retrieverOptions.lexical as LexicalMemoryIndex,
				...(semanticChannel === undefined ? {} : { semantic: { search: semanticChannel } }),
			});
			return {
				search: (
					scope: Parameters<LexicalMemoryIndex["search"]>[0],
					query: string,
					selector: { readonly asOf: string },
				) => retriever.search(scope, query, selector),
			};
		},
	};
}

export async function openLexicalMemoryIndex(databasePath: string): Promise<LexicalMemoryIndex> {
	return LexicalMemoryIndex.open({ databasePath });
}
