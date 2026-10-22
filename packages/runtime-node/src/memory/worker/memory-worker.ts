// Modified by The Open Forge contributors.

import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";
import {
	MEMORY_CONTRACT_ERROR_CODES,
	MemoryContractError,
	type MemoryContractErrorCode,
	type MemoryRevision,
	type MemoryRevisionStore,
	type MemoryScope,
	type MemorySourceReference,
	type MemoryWriteCommand,
	type MemoryWriteResult,
	type TemporalSelector,
} from "@vetta/runtime-memory";
import type { MemoryWorkerRequest, MemoryWorkerResponse } from "./protocol.js";
import { MEMORY_STORE_ERROR_CODES } from "./protocol.js";
import { memoryWorkerSource } from "./worker-source.js";

/**
 * Memory worker 客户端（TASK-0371）：每个实例独占一个 worker_threads Worker，
 * RPC 按 id 配对；worker 侧错误码还原为 MemoryContractError（存储层专用码
 * 原样透传）。同进程共享走 acquireMemoryStoreLease 的引用计数。
 */
export interface SqliteMemoryStoreOptions {
	readonly databasePath: string;
	/** 授权作用域清单；read/write 前在事务内校验。 */
	readonly allowedScopes: readonly MemoryScope[];
	/** 显式 .node 绑定路径（打包/隔离 staging）。 */
	readonly nativeBinding?: string;
	/** 允许打开的最高 schema 版本（升级窗口控制）。 */
	readonly schemaVersionCeiling?: number;
}

const PRESERVED_ERROR_CODES = new Set<string>([
	...Object.values(MEMORY_STORE_ERROR_CODES),
	...Object.values(MEMORY_CONTRACT_ERROR_CODES),
]);

interface SerializedScope {
	readonly name: string;
	readonly principalId: string;
	readonly projectId?: string;
	readonly workspaceViewId?: string;
	readonly visibility?: string;
}

function serializeScope(scope: MemoryScope): SerializedScope {
	return {
		name: scope.name,
		principalId: scope.identity.principalId,
		...(scope.identity.projectId === undefined ? {} : { projectId: scope.identity.projectId }),
		...(scope.identity.workspaceViewId === undefined ? {} : { workspaceViewId: scope.identity.workspaceViewId }),
		...(scope.visibility === undefined ? {} : { visibility: scope.visibility }),
	};
}

export class SqliteMemoryWorkerStore implements MemoryRevisionStore {
	private readonly worker: Worker;
	private nextRequestId = 1;
	private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
	private closed = false;
	private opened!: { schemaVersion: number; sqliteVersion: string };

	private constructor() {
		this.worker = new Worker(memoryWorkerSource(), {
			eval: true,
			workerData: { readySignal: true },
		});
		this.worker.unref();
		this.worker.on("message", (response: MemoryWorkerResponse) => {
			const entry = this.pending.get(response.id);
			if (!entry) return;
			this.pending.delete(response.id);
			if (response.ok) {
				entry.resolve(response.result);
			} else {
				// 存储层专用错误码（SCHEMA_INCOMPATIBLE/STORE_CLOSED）随 worker 往返保留；
				// 未知码回退 INVALID_MEMORY_INPUT。运行时字符串原样传递，类型层以合同码为界。
				const code = PRESERVED_ERROR_CODES.has(response.error.code)
					? response.error.code
					: MEMORY_CONTRACT_ERROR_CODES.INVALID_MEMORY_INPUT;
				entry.reject(new MemoryContractError(code as MemoryContractErrorCode, response.error.message));
			}
		});
		this.worker.on("error", (error) => {
			this.failAllPending(error);
		});
	}

	static async open(options: SqliteMemoryStoreOptions): Promise<SqliteMemoryWorkerStore> {
		const store = new SqliteMemoryWorkerStore();
		try {
			store.opened = (await store.request({
				type: "open",
				databasePath: options.databasePath,
				driverModulePath: createRequire(import.meta.url).resolve("better-sqlite3"),
				...(options.nativeBinding ? { nativeBinding: options.nativeBinding } : {}),
				allowedScopes: options.allowedScopes.map(serializeScope),
				...(options.schemaVersionCeiling === undefined
					? {}
					: { schemaVersionCeiling: options.schemaVersionCeiling }),
			})) as { schemaVersion: number; sqliteVersion: string };
			return store;
		} catch (error) {
			// 初始化失败必须回收 worker，不让半开资源滞留。
			void store.worker.terminate();
			throw error;
		}
	}

	get schemaVersion(): number {
		return this.opened.schemaVersion;
	}

	get sqliteVersion(): string {
		return this.opened.sqliteVersion;
	}

	async read(scope: MemoryScope, selector: TemporalSelector): Promise<readonly MemoryRevision[]> {
		return (await this.request({ type: "read", scope: serializeScope(scope), selector })) as MemoryRevision[];
	}

	async write(scope: MemoryScope, command: MemoryWriteCommand): Promise<MemoryWriteResult> {
		return (await this.request({ type: "write", scope: serializeScope(scope), command })) as MemoryWriteResult;
	}

	async listRevisions(memoryId: string, scope: MemoryScope): Promise<readonly MemoryRevision[]> {
		return (await this.request({
			type: "listRevisions",
			memoryId,
			scope: serializeScope(scope),
		})) as MemoryRevision[];
	}

	async listSources(memoryId: string, scope: MemoryScope): Promise<readonly MemorySourceReference[]> {
		return (await this.request({
			type: "listSources",
			memoryId,
			scope: serializeScope(scope),
		})) as MemorySourceReference[];
	}

	/** 备份到目标路径（SQLite backup API；备份文件可作恢复源）。 */
	async backup(destinationPath: string): Promise<void> {
		await this.request({ type: "backup", destinationPath });
	}

	/** 幂等关闭：底层 worker 终止只发生一次。 */
	async close(): Promise<void> {
		if (this.closed) return;
		try {
			await this.request({ type: "close" });
		} finally {
			this.closed = true;
			void this.worker.terminate();
			this.failAllPending(
				new MemoryContractError(
					MEMORY_STORE_ERROR_CODES.STORE_CLOSED as unknown as MemoryContractErrorCode,
					"store 已关闭",
				),
			);
		}
	}

	private request(payload: MemoryWorkerRequest): Promise<unknown> {
		if (this.closed) {
			return Promise.reject(
				new MemoryContractError(
					MEMORY_STORE_ERROR_CODES.STORE_CLOSED as unknown as MemoryContractErrorCode,
					"store 已关闭",
				),
			);
		}
		const id = this.nextRequestId++;
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.worker.postMessage({ ...payload, id });
		});
	}

	private failAllPending(error: Error): void {
		for (const [, entry] of this.pending) {
			entry.reject(error);
		}
		this.pending.clear();
	}
}

/**
 * 同进程引用计数池：同一数据库路径共享一个 store；lease 按显式 owner 计数，
 * 归零时关闭恰好一次。跨进程并发由 SQLite WAL + busy_timeout 承担。
 */
export interface MemoryStoreLease {
	readonly store: SqliteMemoryWorkerStore;
	readonly release: () => Promise<void>;
}

const sharedStores = new Map<
	string,
	{ store: SqliteMemoryWorkerStore; owners: Map<string, number>; closing: Promise<void> | null }
>();

export async function acquireMemoryStoreLease(
	options: SqliteMemoryStoreOptions & { readonly owner: string },
): Promise<MemoryStoreLease> {
	const key = resolveDatabaseKey(options.databasePath);
	const existing = sharedStores.get(key);
	if (existing && existing.closing === null) {
		existing.owners.set(options.owner, (existing.owners.get(options.owner) ?? 0) + 1);
		let released = false;
		return {
			store: existing.store,
			release: async () => {
				if (released) return;
				released = true;
				await releaseOwner(key, options.owner);
			},
		};
	}
	const store = await SqliteMemoryWorkerStore.open(options);
	const entry = {
		store,
		owners: new Map<string, number>([[options.owner, 1]]),
		closing: null as Promise<void> | null,
	};
	sharedStores.set(key, entry);
	let released = false;
	return {
		store,
		release: async () => {
			if (released) return;
			released = true;
			await releaseOwner(key, options.owner);
		},
	};
}

async function releaseOwner(key: string, owner: string): Promise<void> {
	const entry = sharedStores.get(key);
	if (!entry || entry.closing !== null) return;
	const count = entry.owners.get(owner) ?? 0;
	if (count <= 1) {
		entry.owners.delete(owner);
	} else {
		entry.owners.set(owner, count - 1);
	}
	if (entry.owners.size > 0) return;
	entry.closing = (async () => {
		try {
			await entry.store.close();
		} finally {
			sharedStores.delete(key);
		}
	})();
	await entry.closing;
}

function resolveDatabaseKey(databasePath: string): string {
	return databasePath.replaceAll("\\", "/").toLowerCase();
}
