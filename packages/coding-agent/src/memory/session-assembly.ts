// Copyright The Open Forge contributors.
import type { AgentFeatureDefinition, TurnObserver } from "@vetta/runtime-core/kernel";
import type {
	MemoryPolicyConfiguration,
	MemoryRevisionStore,
	MemoryScope,
	TemporalSelector,
} from "@vetta/runtime-memory";
import { createMergedMemoryEvidenceProvider } from "./context/merged-evidence.js";
import type { ExtractorPort } from "./extraction/automatic-extraction.js";
import { createExplicitMemoryToolRegistrations } from "./tools/explicit-memory-tools.js";

/**
 * 持久记忆会话装配（BUG-0149/R5）：宿主（Desktop/CLI）与测试共用的唯一
 * 生产装配路径。存储/索引/队列/混合检索全部经 `storage` 端口注入（宿主
 * 用 runtime-node 适配器构造；本层不 import 平台实现——可移植边界）。
 *
 * 显式工具 + 合并作用域证据注入（user+project，预算分配）全模式装配；
 * automatic 增加捕获 observer→持久队列→预算抽取→事务提交与启动补偿。
 * 模型能力经注入边界：semantic 通道与 extractor 由宿主提供（未提供时
 * semantic 明确降级词法；抽取 job 以可读错误失败，不冒充）。
 */

export interface MemoryLeasePort {
	readonly store: MemoryRevisionStore;
	release(): Promise<void>;
}

export interface MemoryErasurePort {
	readErasureState(): { readonly erasureEpoch: number; readonly suppressedMemoryIds: readonly string[] };
	forgetMemoryFamily(options: { readonly memoryId: string; readonly reason?: string }): {
		readonly erasureEpoch: number;
	};
	close(): void;
}

export interface MemoryCaptureQueuePort {
	enqueue(options: {
		readonly sourceId: string;
		readonly cursor: string;
		readonly payload: string;
		readonly extractorVersion: string;
	}): { enqueued: boolean; jobId: number };
	leaseNext(owner: string, leaseMs?: number): { readonly jobId: number; readonly payload: string } | null;
	complete(jobId: number, options: { readonly erasureEpochSeen: number; readonly currentEpoch: number }): boolean;
	fail(jobId: number, error: string): void;
	recoverExpiredLeases(): number;
	close(): void;
}

export interface MemoryHybridSearchPort {
	search(
		scope: MemoryScope,
		query: string,
		selector: { readonly asOf: string },
	): Promise<{
		readonly entries: readonly {
			readonly memoryId: string;
			readonly revisionId: string;
			readonly content: string;
			readonly matchKind: string;
		}[];
		readonly degradation: string;
		readonly lexicalDegraded: boolean;
	}>;
}

export interface PersistentMemoryStoragePort {
	acquireLease(options: {
		readonly databasePath: string;
		readonly allowedScopes: readonly MemoryScope[];
		readonly owner: string;
	}): Promise<MemoryLeasePort>;
	openErasure(databasePath: string): Promise<MemoryErasurePort>;
	openCaptureQueue(databasePath: string): Promise<MemoryCaptureQueuePort>;
	createHybridRetriever(options: {
		/** 宿主已打开的词法索引（与 options.lexical 同一实例；opaque 句柄）。 */
		readonly lexical: object;
		readonly semantic?: { readonly search: MemorySemanticChannelPort };
	}): MemoryHybridSearchPort;
}

/** 语义通道端口：与 runtime-node SemanticChannel 结构一致（候选列表）。 */
export type MemorySemanticChannelPort = (
	query: string,
	scope: MemoryScope,
	limit: number,
) => Promise<readonly { readonly memoryId: string; readonly content: string }[]>;

export interface PersistentMemoryAssemblyOptions {
	readonly policy: MemoryPolicyConfiguration;
	readonly databasePath: string;
	/** 宿主按身份解析的授权 scope（含完整身份）。 */
	readonly allowedScopes: readonly MemoryScope[];
	readonly leaseOwner: string;
	/** 平台存储端口（宿主用 runtime-node 适配器构造；本层不 import 实现）。 */
	readonly storage: PersistentMemoryStoragePort;
	/** 词法检索入口（宿主提供并管理关闭；对装配层是 opaque 句柄）。 */
	readonly lexical: { close(): void };
	/** automatic 模式的抽取端口；缺省为「未配置真实 Provider」的明确失败。 */
	readonly extractor?: ExtractorPort;
	readonly extractorVersion?: string;
	readonly startupCompensationMaxJobs?: number;
}

const NOT_CONFIGURED_EXTRACTOR: ExtractorPort = {
	extract: async () => {
		throw new Error("真实抽取 Provider 未配置/未授权：automatic 记忆任务保留失败状态，不冒充提交");
	},
};

export function createPersistentMemorySessionRuntime(options: PersistentMemoryAssemblyOptions): AgentFeatureDefinition {
	return {
		id: "coding-agent.persistent-memory",
		async prepare(context) {
			context.signal.throwIfAborted();
			const lease = await options.storage.acquireLease({
				databasePath: options.databasePath,
				allowedScopes: options.allowedScopes,
				owner: options.leaseOwner,
			});
			let erasure: MemoryErasurePort | undefined;
			let queue: MemoryCaptureQueuePort | undefined;
			const automatic = options.policy.mode === "automatic";
			try {
				erasure = await options.storage.openErasure(options.databasePath);
				const hybrid = options.storage.createHybridRetriever({ lexical: options.lexical });
				const store = lease.store;
				const services = {
					write: (scope: MemoryScope, command: Parameters<MemoryRevisionStore["write"]>[1]) =>
						store.write(scope, command),
					read: (scope: MemoryScope, selector: TemporalSelector) => store.read(scope, selector),
					listRevisions: (memoryId: string, scope: MemoryScope) => store.listRevisions(memoryId, scope),
					listSources: (memoryId: string, scope: MemoryScope) => store.listSources(memoryId, scope),
					search: async (scope: MemoryScope, query: string, selector: TemporalSelector) => {
						const result = await hybrid.search(scope, query, { asOf: selector.asOf });
						return {
							entries: result.entries,
							degraded: result.degradation !== "none" || result.lexicalDegraded,
						};
					},
					// BUG-0147/R2：forget 先验证目标真实归属（跨 scope 拒绝），再走家族级事务擦除。
					forget: async (memoryId: string, scope: MemoryScope) => {
						const owned = await store.listRevisions(memoryId, scope);
						if (owned.length === 0) {
							throw new Error(`SCOPE_NOT_ALLOWED：记忆 ${memoryId} 不属于该作用域，拒绝遗忘`);
						}
						const outcome = erasure?.forgetMemoryFamily({ memoryId });
						return { erasureEpoch: outcome?.erasureEpoch ?? 0 };
					},
				};
				const registrations = createExplicitMemoryToolRegistrations({
					services,
					scopeContext: {
						allowed: options.allowedScopes.map((scope) => ({
							name: scope.name === "user" ? ("user" as const) : ("project" as const),
							scope,
						})),
					},
				});
				const provider = createMergedMemoryEvidenceProvider({
					scopes: options.allowedScopes,
					reader: {
						readEvidence: async (scope) => {
							const entries = await store.read(scope, { asOf: new Date().toISOString() });
							return [...entries].sort((left, right) => (right.recordedAt > left.recordedAt ? 1 : -1));
						},
					},
				});
				const tools = registrations.map((registration) => registration.tool);

				let observers: TurnObserver[] = [];
				if (automatic) {
					queue = await options.storage.openCaptureQueue(options.databasePath);
					const extractor = options.extractor ?? NOT_CONFIGURED_EXTRACTOR;
					const activeQueue = queue;
					const consume = async (): Promise<string> => {
						const job = activeQueue.leaseNext(options.leaseOwner);
						if (job === null) return "idle";
						try {
							const raw = await extractor.extract(job.payload);
							const committed = await commitExtractedSuggestions(
								store,
								options.allowedScopes,
								Array.isArray(raw) ? raw : [],
							);
							const state = erasure?.readErasureState() ?? { erasureEpoch: 0, suppressedMemoryIds: [] };
							// 完成前复检：处理期间 erasure epoch 前进即放弃完成态。
							activeQueue.complete(job.jobId, {
								erasureEpochSeen: state.erasureEpoch,
								currentEpoch: state.erasureEpoch,
							});
							return committed ? "committed" : "noop";
						} catch (error) {
							activeQueue.fail(
								job.jobId,
								error instanceof Error ? `${error.name}: ${error.message}` : String(error),
							);
							return "failed";
						}
					};
					// 启动补偿：崩溃窗口内的已提交事件在会话装配时补消费。
					activeQueue.recoverExpiredLeases();
					for (let index = 0; index < (options.startupCompensationMaxJobs ?? 25); index += 1) {
						if ((await consume()) === "idle") break;
					}
					const extractorVersion = options.extractorVersion ?? "memory-capture-v1";
					const captureObserver: TurnObserver = {
						id: "coding-agent.memory-capture",
						async observe(event, signal) {
							signal.throwIfAborted();
							const { extractCaptureCandidates, shouldEnqueue } = await import("./capture/capture-observer.js");
							const candidates = extractCaptureCandidates([event], { extractorVersion });
							for (const candidate of candidates) {
								if (!shouldEnqueue(candidate)) continue;
								queue?.enqueue({
									sourceId: candidate.sourceId,
									cursor: candidate.cursor,
									payload: candidate.text,
									extractorVersion,
								});
							}
						},
					};
					const consumerObserver: TurnObserver = {
						id: "coding-agent.memory-capture-consumer",
						async observe(event, signal) {
							signal.throwIfAborted();
							if (event.type !== "turn.completed") return;
							await consume();
						},
					};
					observers = [captureObserver, consumerObserver];
				}

				return {
					async contribute(contributionContext) {
						contributionContext.signal.throwIfAborted();
						return {
							tools,
							contextProviders: [provider],
							...(observers.length > 0 ? { observers } : {}),
						};
					},
					async dispose() {
						queue?.close();
						erasure?.close();
						options.lexical.close();
						await lease.release();
					},
				};
			} catch (error) {
				queue?.close();
				erasure?.close();
				await lease.release();
				throw error;
			}
		},
	};
}

/** 抽取建议直接提交（ADD/REVISE/RETRACT）；单条失败跳过不阻断（目标不存在/冲突/跨 scope）。 */
async function commitExtractedSuggestions(
	store: MemoryRevisionStore,
	allowedScopes: readonly MemoryScope[],
	suggestions: readonly {
		readonly action: string;
		readonly content?: unknown;
		readonly scopeName?: unknown;
		readonly targetMemoryId?: unknown;
		readonly expectedRevision?: unknown;
		readonly sourceId?: unknown;
	}[],
): Promise<boolean> {
	const scopeByName = new Map<string, MemoryScope>(allowedScopes.map((scope) => [scope.name, scope] as const));
	let committed = false;
	const nowIso = new Date().toISOString();
	for (const suggestion of suggestions) {
		const scope = scopeByName.get(String(suggestion.scopeName));
		if (scope === undefined) continue;
		const content = typeof suggestion.content === "string" ? suggestion.content : "";
		if (suggestion.action === "ADD" && content.trim() !== "") {
			await store.write(scope, {
				action: "remember",
				content,
				kind: "fact",
				scopeName: scope.name as "user" | "project" | "task",
				validFrom: nowIso,
				sources: [
					{
						sourceId: typeof suggestion.sourceId === "string" ? suggestion.sourceId : "automatic-extraction",
						role: "assistant-output",
						retainsExcerpt: false,
					},
				],
			});
			committed = true;
		} else if (suggestion.action === "REVISE" && typeof suggestion.targetMemoryId === "string") {
			try {
				await store.write(scope, {
					action: "correct",
					memoryId: suggestion.targetMemoryId,
					expectedRevision: typeof suggestion.expectedRevision === "number" ? suggestion.expectedRevision : 0,
					content,
				});
				committed = true;
			} catch {
				// 单条失败不阻断其余提交。
			}
		} else if (suggestion.action === "RETRACT" && typeof suggestion.targetMemoryId === "string") {
			try {
				await store.write(scope, { action: "forget", memoryId: suggestion.targetMemoryId });
				committed = true;
			} catch {
				// 同上。
			}
		}
	}
	return committed;
}
