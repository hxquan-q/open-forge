// Copyright The Open Forge contributors.
import type { ConversationDocument } from "@vetta/runtime-core/conversation";
import type { ReadConversationFileHeader } from "@vetta/runtime-storage/conversation";

/** 锁内复用的追加写入状态：缓存与全量读取路径共用同一形状。 */
export interface ConversationAppendState {
	readonly byteSize: number;
	readonly schemaVersion: ReadConversationFileHeader["schemaVersion"];
	readonly document: ConversationDocument;
	readonly eventCount: number;
}

export interface ConversationWriteCacheOptions {
	/** 缓存的会话数上限（LRU）；必须是正整数。 */
	readonly limit: number;
}

/**
 * FileConversationRepository 的追加写入缓存。
 *
 * 每个会话保留一份已解析 document，让长会话的每次事件追加不必全量重读
 * JSONL。以文件字节数为失效键：会话文件经本仓库只增不减，任何外部追加
 * 都会改变字节数，命中失败即自动回退全量读取。缓存不持有事件记录，恢复
 * 事实始终以 JSONL 文件为准。
 */
export class ConversationWriteCache {
	private readonly entries = new Map<string, ConversationAppendState>();

	constructor(private readonly options: ConversationWriteCacheOptions) {
		if (!Number.isInteger(options.limit) || options.limit <= 0) {
			throw new Error(`documentCacheLimit must be a positive integer, received: ${options.limit}`);
		}
	}

	read(sessionId: string, byteSize: number): ConversationAppendState | undefined {
		const entry = this.entries.get(sessionId);
		if (!entry || entry.byteSize !== byteSize) return undefined;
		// 重新插入以维持 LRU 顺序（Map 迭代按插入序）。
		this.entries.delete(sessionId);
		this.entries.set(sessionId, entry);
		return entry;
	}

	write(sessionId: string, state: ConversationAppendState): void {
		this.entries.delete(sessionId);
		this.entries.set(sessionId, state);
		while (this.entries.size > this.options.limit) {
			const oldest = this.entries.keys().next().value;
			if (oldest === undefined) break;
			this.entries.delete(oldest);
		}
	}

	drop(sessionId: string): void {
		this.entries.delete(sessionId);
	}

	clear(): void {
		this.entries.clear();
	}
}
