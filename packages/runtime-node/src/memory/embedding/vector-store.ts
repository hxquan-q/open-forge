// Copyright The Open Forge contributors.

import { createRequire } from "node:module";
import {
	EMBEDDING_ADAPTER_ERROR_CODES,
	EmbeddingAdapterError,
	type EmbeddingVectorSpaceKey,
} from "./embedding-adapter.js";

/**
 * 版本化向量存储（TASK-0381）。
 *
 * 独立连接同一记忆 SQLite 库（WAL 与存储 worker/词法索引并存；写入仅限
 * 本层自有的向量派生表，不改事实表）。派生索引合同：向量 BLOB 按
 * model/revision/dimension/normalization 组成的向量空间隔离，主键与全部
 * 查询都携带完整空间键——不同模型版本的结构上不可能混算；空间可整体
 * 丢弃重建（模型升级/卸载 = 新空间 + dropSpace 旧空间），事实层不受影响。
 *
 * 遗忘合同：写入时拒绝已抑制（suppressed）记忆；检索时过滤 suppressed 与
 * 非有效时间行（与词法索引同款语义）；提交前的 erasure epoch 复检由
 * embedding-jobs 层承担。
 */

interface BetterSqlite3Statement {
	run: (...args: unknown[]) => { changes: number | bigint };
	all: (...args: unknown[]) => Record<string, unknown>[];
	get: (...args: unknown[]) => Record<string, unknown> | undefined;
}

interface BetterSqlite3Database {
	pragma: (statement: string) => unknown;
	prepare: (sql: string) => BetterSqlite3Statement;
	exec: (sql: string) => void;
	close: () => void;
}

export interface VectorPutEntry {
	readonly memoryId: string;
	readonly revisionNo: number;
	readonly scopeName: string;
	readonly vector: Float32Array;
	/** 入队/生成时观察到的 erasure epoch；提交复检用。 */
	readonly erasureEpochSeen: number;
}

export interface VectorSearchHit {
	readonly memoryId: string;
	readonly revisionNo: number;
	readonly content: string;
	readonly cosine: number;
}

export interface VectorSearchOptions {
	readonly scopeName: string;
	/** 有效时间过滤（asOf），与词法检索同款语义；"unknown" 时间行不参与。 */
	readonly asOf: string;
	readonly limit: number;
}

const L2_TOLERANCE = 1e-3;

function spaceColumns(key: EmbeddingVectorSpaceKey) {
	return [key.modelId, key.modelRevision, key.dimension, key.normalization] as const;
}

export class VectorMemoryStore {
	private readonly db: BetterSqlite3Database;
	private closed = false;

	private constructor(db: BetterSqlite3Database) {
		this.db = db;
	}

	static async open(options: { readonly databasePath: string }): Promise<VectorMemoryStore> {
		const require = createRequire(import.meta.url);
		const Database = require(require.resolve("better-sqlite3")) as new (path: string) => BetterSqlite3Database;
		const db = new Database(options.databasePath);
		db.pragma("journal_mode = WAL");
		db.pragma("busy_timeout = 5000");
		db.exec(
			`CREATE TABLE IF NOT EXISTS memory_vectors (
				model_id TEXT NOT NULL,
				model_revision TEXT NOT NULL,
				dimension INTEGER NOT NULL,
				normalization TEXT NOT NULL,
				memory_id TEXT NOT NULL,
				revision_no INTEGER NOT NULL,
				scope_name TEXT NOT NULL,
				vector BLOB NOT NULL,
				erasure_epoch_seen INTEGER NOT NULL,
				created_at_ms INTEGER NOT NULL,
				PRIMARY KEY (model_id, model_revision, dimension, normalization, memory_id, revision_no)
			)`,
		);
		db.exec(
			"CREATE INDEX IF NOT EXISTS memory_vectors_space_scope ON memory_vectors (model_id, model_revision, dimension, normalization, scope_name)",
		);
		return new VectorMemoryStore(db);
	}

	/** 写入/覆盖同空间同修订的向量；被遗忘记忆拒绝写回，维度/归一化合同在写入点校验。 */
	put(space: EmbeddingVectorSpaceKey, entry: VectorPutEntry): void {
		this.assertOpen();
		if (entry.memoryId.length === 0 || entry.scopeName.length === 0) {
			throw new EmbeddingAdapterError(
				EMBEDDING_ADAPTER_ERROR_CODES.INVALID_INPUT,
				"向量条目缺少 memoryId/scopeName",
			);
		}
		if (entry.vector.length !== space.dimension) {
			throw new EmbeddingAdapterError(
				EMBEDDING_ADAPTER_ERROR_CODES.INVALID_INPUT,
				`向量维度 ${entry.vector.length} 与空间声明 ${space.dimension} 不一致`,
			);
		}
		if (space.normalization === "l2") {
			let sum = 0;
			for (let index = 0; index < entry.vector.length; index += 1) {
				sum += entry.vector[index] * entry.vector[index];
			}
			if (Math.abs(Math.sqrt(sum) - 1) > L2_TOLERANCE) {
				throw new EmbeddingAdapterError(
					EMBEDDING_ADAPTER_ERROR_CODES.INVALID_INPUT,
					"空间声明 l2 归一化但向量范数偏离 1",
				);
			}
		}
		const suppressed = this.db
			.prepare("SELECT 1 AS hit FROM memory_suppressed WHERE memory_id = ?")
			.get(entry.memoryId);
		if (suppressed !== undefined) {
			throw new EmbeddingAdapterError(
				EMBEDDING_ADAPTER_ERROR_CODES.INVALID_INPUT,
				`记忆 ${entry.memoryId} 已被遗忘（suppressed），拒绝写回向量`,
			);
		}
		this.db
			.prepare(
				`INSERT INTO memory_vectors
				 (model_id, model_revision, dimension, normalization, memory_id, revision_no, scope_name, vector, erasure_epoch_seen, created_at_ms)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT (model_id, model_revision, dimension, normalization, memory_id, revision_no)
				 DO UPDATE SET scope_name = excluded.scope_name, vector = excluded.vector,
				               erasure_epoch_seen = excluded.erasure_epoch_seen, created_at_ms = excluded.created_at_ms`,
			)
			.run(
				...spaceColumns(space),
				entry.memoryId,
				entry.revisionNo,
				entry.scopeName,
				Buffer.from(entry.vector.buffer, entry.vector.byteOffset, entry.vector.byteLength),
				entry.erasureEpochSeen,
				Date.now(),
			);
	}

	/**
	 * 空间内精确余弦检索：仅命中同空间、同 scope、未遗忘且有效时间的行。
	 * 查询向量必须属于同一空间（维度一致；l2 空间要求归一化）。
	 */
	search(
		space: EmbeddingVectorSpaceKey,
		query: Float32Array,
		options: VectorSearchOptions,
	): readonly VectorSearchHit[] {
		this.assertOpen();
		if (query.length !== space.dimension) {
			throw new EmbeddingAdapterError(
				EMBEDDING_ADAPTER_ERROR_CODES.INVALID_INPUT,
				`查询向量维度 ${query.length} 与空间声明 ${space.dimension} 不一致`,
			);
		}
		const rows = this.db
			.prepare(
				`SELECT v.memory_id, v.revision_no, v.vector, r.content, r.valid_from, r.valid_to
				 FROM memory_vectors v
				 JOIN memory_revisions r ON r.memory_id = v.memory_id AND r.revision_no = v.revision_no
				 WHERE v.model_id = ? AND v.model_revision = ? AND v.dimension = ? AND v.normalization = ?
				   AND v.scope_name = ?
				   AND v.memory_id NOT IN (SELECT memory_id FROM memory_suppressed)`,
			)
			.all(...spaceColumns(space), options.scopeName) as unknown as {
			memory_id: string;
			revision_no: number;
			vector: Uint8Array;
			content: string;
			valid_from: string;
			valid_to: string;
		}[];
		const hits: VectorSearchHit[] = [];
		for (const row of rows) {
			if (!this.isEffectiveAt(row, options.asOf)) continue;
			const vector = new Float32Array(row.vector.buffer, row.vector.byteOffset, row.vector.byteLength / 4);
			const cosine = cosineSimilarity(query, vector);
			hits.push({ memoryId: row.memory_id, revisionNo: Number(row.revision_no), content: row.content, cosine });
		}
		hits.sort((a, b) => b.cosine - a.cosine);
		return hits.slice(0, Math.max(1, options.limit));
	}

	/** 删除单条记忆的全版本向量（遗忘联动）。 */
	purgeMemory(memoryId: string): number {
		this.assertOpen();
		const result = this.db.prepare("DELETE FROM memory_vectors WHERE memory_id = ?").run(memoryId);
		return Number(result.changes);
	}

	/** 清空某 scope 在指定空间的向量。 */
	purgeScope(space: EmbeddingVectorSpaceKey, scopeName: string): number {
		this.assertOpen();
		const result = this.db
			.prepare(
				"DELETE FROM memory_vectors WHERE model_id = ? AND model_revision = ? AND dimension = ? AND normalization = ? AND scope_name = ?",
			)
			.run(...spaceColumns(space), scopeName);
		return Number(result.changes);
	}

	/** 丢弃整个向量空间（模型升级/卸载的索引 epoch）：可重建派生物，不动事实层。 */
	dropSpace(space: EmbeddingVectorSpaceKey): number {
		this.assertOpen();
		const result = this.db
			.prepare(
				"DELETE FROM memory_vectors WHERE model_id = ? AND model_revision = ? AND dimension = ? AND normalization = ?",
			)
			.run(...spaceColumns(space));
		return Number(result.changes);
	}

	/** 各空间行数统计（监控/重建决策）。 */
	spaceStats(): readonly { readonly space: EmbeddingVectorSpaceKey; readonly rows: number }[] {
		this.assertOpen();
		const rows = this.db
			.prepare(
				"SELECT model_id, model_revision, dimension, normalization, COUNT(*) AS n FROM memory_vectors GROUP BY model_id, model_revision, dimension, normalization",
			)
			.all() as unknown as {
			model_id: string;
			model_revision: string;
			dimension: number;
			normalization: string;
			n: number;
		}[];
		return rows.map((row) => ({
			space: {
				modelId: row.model_id,
				modelRevision: row.model_revision,
				dimension: Number(row.dimension),
				normalization: row.normalization as EmbeddingVectorSpaceKey["normalization"],
			},
			rows: Number(row.n),
		}));
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.db.close();
	}

	private assertOpen(): void {
		if (this.closed) {
			throw new EmbeddingAdapterError(EMBEDDING_ADAPTER_ERROR_CODES.SESSION_CLOSED, "向量存储已关闭");
		}
	}

	private isEffectiveAt(row: { readonly valid_from: string; readonly valid_to: string }, asOf: string): boolean {
		if (row.valid_from === "unknown" || row.valid_to === "unknown") {
			return false;
		}
		if (row.valid_from > asOf) {
			return false;
		}
		return row.valid_to === "" || row.valid_to > asOf;
	}
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let index = 0; index < a.length; index += 1) {
		dot += a[index] * b[index];
		normA += a[index] * a[index];
		normB += b[index] * b[index];
	}
	if (normA === 0 || normB === 0) {
		return 0;
	}
	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
