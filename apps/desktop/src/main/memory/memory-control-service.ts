// Modified by The Open Forge contributors.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { MemoryScope } from "@vetta/runtime-memory";
import { LexicalMemoryIndex, SqliteMemoryErasure, SqliteMemoryWorkerStore } from "@vetta/runtime-node/memory";
import type {
	MemoryCorrectRequest,
	MemoryCorrectResult,
	MemoryDetailRequest,
	MemoryDetailResult,
	MemoryForgetRequest,
	MemoryForgetResult,
	MemoryListItem,
	MemoryListRequest,
	MemoryListResult,
	MemoryPolicyState,
	MemorySearchRequest,
	MemorySearchResult,
} from "../../shared/memory.js";
import { loadMemoryIdentityRegistry } from "../projects/memory-identity-storage.js";

/**
 * 记忆控制面服务（TASK-0376）：主进程内的用户记忆管理入口。
 *
 * - 与会话运行时共享同一数据库（WAL）；本服务按需开短连接（列表/详情/
 *   更正走 store，搜索走词法索引，忘记走 erasure 事务）。
 * - 授权边界：scope 只接受 user/project/all 的显示语义，内部映射到
 *   本机 profile 的允许 scope；不接收也不返回 principal/DB 路径。
 * - 模式/预算持久化在记忆目录 settings.json（原子写）；会话创建侧由
 *   后续控制面切片读取并注入 memoryPolicy。
 */

const POLICY_FILE = "settings.json";

export class MemoryControlService {
	private readonly databasePath: string;
	private readonly policyPath: string;
	private readonly allowedScopes: readonly MemoryScope[];

	constructor(options: { readonly memoryDirectory: string; readonly allowedScopes: readonly MemoryScope[] }) {
		this.databasePath = join(options.memoryDirectory, "memory.sqlite");
		this.policyPath = join(options.memoryDirectory, POLICY_FILE);
		this.allowedScopes = options.allowedScopes;
	}

	private async withStore<T>(action: (store: SqliteMemoryWorkerStore) => Promise<T>): Promise<T> {
		const store = await SqliteMemoryWorkerStore.open({
			databasePath: this.databasePath,
			allowedScopes: this.allowedScopes,
		});
		try {
			return await action(store);
		} finally {
			await store.close();
		}
	}

	async list(request: MemoryListRequest = {}): Promise<MemoryListResult> {
		const page = Math.max(1, Number.isInteger(request.page) ? (request.page ?? 1) : 1);
		const pageSize = Math.min(50, Math.max(1, Number.isInteger(request.pageSize) ? (request.pageSize ?? 20) : 20));
		const scopeFilter = request.scope ?? "all";
		return this.withStore(async (store) => {
			const items: MemoryListItem[] = [];
			for (const scope of this.allowedScopes) {
				if (scopeFilter !== "all" && scope.name !== scopeFilter) continue;
				const revisions = await store.read(scope, { asOf: new Date().toISOString() });
				for (const revision of revisions) {
					items.push({
						memoryId: revision.memoryId,
						revisionId: revision.revisionId,
						content: revision.content,
						scopeName: revision.scopeName,
						status: revision.status,
						validFrom: revision.validFrom,
						recordedAt: revision.recordedAt,
						pinned: revision.pinned === true,
						evidence: revision.evidence,
					});
				}
			}
			items.sort((left, right) => (right.recordedAt > left.recordedAt ? 1 : -1));
			const start = (page - 1) * pageSize;
			return {
				items: items.slice(start, start + pageSize),
				page,
				pageSize,
				hasMore: start + pageSize < items.length,
			};
		});
	}

	async search(request: MemorySearchRequest): Promise<MemorySearchResult> {
		const query = request.query.trim();
		if (query === "") {
			return { items: [], degraded: false };
		}
		const limit = Math.min(20, Math.max(1, request.limit ?? 10));
		const scopeFilter = request.scope ?? "all";
		const index = await LexicalMemoryIndex.open({ databasePath: this.databasePath });
		try {
			const items: MemoryListItem[] = [];
			let degraded = false;
			for (const scope of this.allowedScopes) {
				if (scopeFilter !== "all" && scope.name !== scopeFilter) continue;
				const result = index.search(scope, query, { asOf: new Date().toISOString() }, limit);
				degraded = degraded || result.degraded;
				for (const entry of result.entries) {
					items.push({
						memoryId: entry.memoryId,
						revisionId: entry.revisionId,
						content: entry.content,
						scopeName: scope.name,
						status: "active",
						validFrom: entry.validFrom,
						recordedAt: entry.recordedAt,
						pinned: false,
						evidence: "claimed",
					});
				}
			}
			return { items: items.slice(0, limit), degraded };
		} finally {
			index.close();
		}
	}

	async detail(request: MemoryDetailRequest): Promise<MemoryDetailResult> {
		return this.withStore(async (store) => {
			for (const scope of this.allowedScopes) {
				const revisions = await store.listRevisions(request.memoryId, scope);
				if (revisions.length === 0) continue;
				const sources = await store.listSources(request.memoryId, scope);
				return {
					memoryId: request.memoryId,
					revisions: revisions.map((revision, index) => ({
						revisionId: revision.revisionId,
						revisionNo: index + 1,
						content: revision.content,
						status: revision.status,
						validFrom: revision.validFrom,
						recordedAt: revision.recordedAt,
					})),
					sources: sources.map((source) => ({ sourceId: source.sourceId, role: source.role })),
				};
			}
			throw new Error(`NOT_FOUND：记忆 ${request.memoryId} 不存在或已遗忘`);
		});
	}

	async correct(request: MemoryCorrectRequest): Promise<MemoryCorrectResult> {
		return this.withStore(async (store) => {
			for (const scope of this.allowedScopes) {
				const revisions = await store.listRevisions(request.memoryId, scope);
				if (revisions.length === 0) continue;
				const result = await store.write(scope, {
					action: "correct",
					memoryId: request.memoryId,
					expectedRevision: request.expectedRevision,
					content: request.content,
				});
				return { memoryId: result.memoryId, revision: result.revision };
			}
			throw new Error(`NOT_FOUND：记忆 ${request.memoryId} 不存在或已遗忘`);
		});
	}

	async forget(request: MemoryForgetRequest): Promise<MemoryForgetResult> {
		const erasure = await SqliteMemoryErasure.open({ databasePath: this.databasePath });
		try {
			const outcome = erasure.forgetMemoryFamily({ memoryId: request.memoryId });
			return {
				memoryId: request.memoryId,
				erasureEpoch: outcome.erasureEpoch,
				alsoProcessSourcesAccepted: request.alsoProcessSources === true,
			};
		} finally {
			erasure.close();
		}
	}

	readPolicy(): MemoryPolicyState {
		try {
			const parsed = JSON.parse(readFileSync(this.policyPath, "utf8")) as MemoryPolicyState;
			if (parsed.mode === "off" || parsed.mode === "explicit" || parsed.mode === "automatic") {
				return {
					mode: parsed.mode,
					...(typeof parsed.extractionModel === "string" ? { extractionModel: parsed.extractionModel } : {}),
					...(typeof parsed.dailyRequestLimit === "number" ? { dailyRequestLimit: parsed.dailyRequestLimit } : {}),
				};
			}
			return { mode: "off" };
		} catch {
			return { mode: "off" };
		}
	}

	async setPolicy(state: MemoryPolicyState): Promise<MemoryPolicyState> {
		if (state.mode !== "off" && state.mode !== "explicit" && state.mode !== "automatic") {
			throw new Error("INVALID_MEMORY_POLICY：mode 必须是 off/explicit/automatic");
		}
		if (state.mode === "automatic" && typeof state.extractionModel !== "string") {
			throw new Error("INVALID_MEMORY_POLICY：automatic 模式必须配置抽取模型");
		}
		const payload: MemoryPolicyState = {
			mode: state.mode,
			...(state.extractionModel === undefined ? {} : { extractionModel: state.extractionModel }),
			...(state.dailyRequestLimit === undefined ? {} : { dailyRequestLimit: state.dailyRequestLimit }),
		};
		const temporaryPath = `${this.policyPath}.tmp`;
		mkdirSync(join(this.policyPath, ".."), { recursive: true });
		writeFileSync(temporaryPath, `${JSON.stringify(payload, null, "\t")}\n`, "utf8");
		renameSync(temporaryPath, this.policyPath);
		return payload;
	}

	scopeNames(): readonly string[] {
		return this.allowedScopes.map((scope) => scope.name);
	}
}

export function createDefaultMemoryControlService(agentDir: string): MemoryControlService {
	const memoryDirectory = join(agentDir, "memory", "profile-default");
	const registry = loadMemoryIdentityRegistry({
		filePath: join(memoryDirectory, "identity-registry.json"),
		principal: { principalId: "desktop-profile-default" },
	});
	const scopes: MemoryScope[] = [
		{ name: "user", identity: { principalId: registry.principal.principalId } },
		...registry.projects.map((project) => ({
			name: "project" as const,
			identity: {
				principalId: project.principalId,
				...(project.projectId ? { projectId: project.projectId } : {}),
			},
		})),
	];
	return new MemoryControlService({ memoryDirectory, allowedScopes: scopes });
}
