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
 * Memory worker 客户端（TASK-0371；BUG-0147/R3 修订）。
 *
 * 一个 worker（= 一个 SQLite 连接）由「通道」持有并被多个 store 视图共享；
 * 每个 store 视图绑定自己的 allowedScopes 并随每个请求下发（authScopes），
 * worker 按请求集合校验 scope——共享数据库资源与每次调用授权分离，后开
 * 的项目不再继承首个会话的授权。直接 open 的 store 保持原行为（视图的
 * 授权集合即 open 集合）。
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

interface PendingEntry {
	readonly owner: SqliteMemoryWorkerStore;
	readonly resolve: (value: unknown) => void;
	readonly reject: (error: Error) => void;
}

/** 共享 worker 通道：唯一 id 空间与 pending 表；worker 终止时全部失败。 */
interface WorkerChannel {
	readonly worker: Worker;
	nextRequestId: number;
	readonly pending: Map<number, PendingEntry>;
	/** worker 已终止（root 关闭或进程退出）：后续请求立即明确失败，不悬挂。 */
	terminated: boolean;
}

export class SqliteMemoryWorkerStore implements MemoryRevisionStore {
	private readonly channel: WorkerChannel;
	private readonly authScopes: readonly MemoryScope[];
	private closed = false;
	private readonly ownsWorker: boolean;
	private opened!: { schemaVersion: number; sqliteVersion: string };

	private constructor(channel: WorkerChannel, authScopes: readonly MemoryScope[], ownsWorker: boolean) {
		this.channel = channel;
		this.authScopes = authScopes;
		this.ownsWorker = ownsWorker;
	}

	static async open(options: SqliteMemoryStoreOptions): Promise<SqliteMemoryWorkerStore> {
		const channel: WorkerChannel = {
			worker: new Worker(memoryWorkerSource(), {
				eval: true,
				workerData: { readySignal: true },
			}),
			nextRequestId: 1,
			pending: new Map(),
			terminated: false,
		};
		channel.worker.unref();
		channel.worker.on("message", (response: MemoryWorkerResponse) => {
			const entry = channel.pending.get(response.id);
			if (!entry) return;
			channel.pending.delete(response.id);
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
		channel.worker.on("error", (error) => {
			failAllPending(channel, error);
		});
		channel.worker.on("exit", () => {
			channel.terminated = true;
			failAllPending(
				channel,
				new MemoryContractError(
					MEMORY_STORE_ERROR_CODES.STORE_CLOSED as unknown as MemoryContractErrorCode,
					"memory worker 已退出",
				),
			);
		});
		const store = new SqliteMemoryWorkerStore(channel, options.allowedScopes, true);
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
			void channel.worker.terminate();
			throw error;
		}
	}

	/**
	 * BUG-0147/R3：共享同一 worker 连接的授权视图。视图携带自己的
	 * allowedScopes 随请求下发；关闭视图不影响底层 worker。
	 */
	forScope(allowedScopes: readonly MemoryScope[]): SqliteMemoryWorkerStore {
		const view = new SqliteMemoryWorkerStore(this.channel, allowedScopes, false);
		view.opened = this.opened;
		return view;
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

	/** 幂等关闭：视图只关自己（仅拒绝自己的在途请求）；worker 持有者关闭终止底层 worker 一次。 */
	async close(): Promise<void> {
		if (this.closed) return;
		try {
			if (this.ownsWorker) {
				await this.request({ type: "close" });
			}
		} finally {
			this.closed = true;
			const error = new MemoryContractError(
				MEMORY_STORE_ERROR_CODES.STORE_CLOSED as unknown as MemoryContractErrorCode,
				"store 已关闭",
			);
			for (const [id, entry] of [...this.channel.pending]) {
				if (this.ownsWorker || entry.owner === this) {
					this.channel.pending.delete(id);
					entry.reject(error);
				}
			}
			if (this.ownsWorker) {
				this.channel.terminated = true;
				void this.channel.worker.terminate();
			}
		}
	}

	private request(payload: MemoryWorkerRequest): Promise<unknown> {
		if (this.channel.terminated) {
			return Promise.reject(
				new MemoryContractError(
					MEMORY_STORE_ERROR_CODES.STORE_CLOSED as unknown as MemoryContractErrorCode,
					"store 已关闭",
				),
			);
		}
		if (this.closed) {
			return Promise.reject(
				new MemoryContractError(
					MEMORY_STORE_ERROR_CODES.STORE_CLOSED as unknown as MemoryContractErrorCode,
					"store 已关闭",
				),
			);
		}
		const id = this.channel.nextRequestId++;
		const withAuth = { ...payload, id, authScopes: this.authScopes.map(serializeScope) };
		return new Promise((resolve, reject) => {
			this.channel.pending.set(id, { owner: this, resolve, reject });
			this.channel.worker.postMessage(withAuth);
		});
	}
}

function failAllPending(channel: WorkerChannel, error: Error): void {
	for (const [, entry] of channel.pending) {
		entry.reject(error);
	}
	channel.pending.clear();
}

/**
 * 同进程引用计数池：同一数据库路径共享一个 worker 连接；每个 lease 得到
 * 绑定自身 allowedScopes 的视图（BUG-0147/R3：不继承、不合并他人授权），
 * 归零时关闭恰好一次。跨进程并发由 SQLite WAL + busy_timeout 承担。
 */
export interface MemoryStoreLease {
	readonly store: SqliteMemoryWorkerStore;
	readonly release: () => Promise<void>;
}

const sharedStores = new Map<
	string,
	{ root: SqliteMemoryWorkerStore; owners: Map<string, number>; closing: Promise<void> | null }
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
			store: existing.root.forScope(options.allowedScopes),
			release: async () => {
				if (released) return;
				released = true;
				await releaseOwner(key, options.owner);
			},
		};
	}
	const root = await SqliteMemoryWorkerStore.open(options);
	const entry = {
		root,
		owners: new Map<string, number>([[options.owner, 1]]),
		closing: null as Promise<void> | null,
	};
	sharedStores.set(key, entry);
	let released = false;
	return {
		store: root.forScope(options.allowedScopes),
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
			await entry.root.close();
		} finally {
			sharedStores.delete(key);
		}
	})();
	await entry.closing;
}

function resolveDatabaseKey(databasePath: string): string {
	return databasePath.replaceAll("\\", "/").toLowerCase();
}
