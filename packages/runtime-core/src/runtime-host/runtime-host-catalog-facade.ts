// Modified by The Open Forge contributors.
import type { HistoryEntry, ProjectInfo, SessionHistoryInfo } from "../contracts.js";
import { runtimeError } from "../errors.js";
import type { RuntimeHostSessionLifecycle } from "./runtime-host-session-lifecycle.js";
import type { RuntimeHostSessionOperations } from "./runtime-host-session-operations.js";
import type {
	RuntimeSessionAccess,
	RuntimeSessionAccessResolver,
	RuntimeSessionCatalog,
	RuntimeSessionFileHistoryReader,
} from "./session-services.js";

export interface RuntimeHostCatalogFacadeOptions {
	readonly catalog?: RuntimeSessionCatalog;
	readonly fileHistoryReader?: RuntimeSessionFileHistoryReader;
	readonly accessResolver?: RuntimeSessionAccessResolver;
	readonly normalizePath?: (path: string) => string;
	readonly sessionLifecycle: RuntimeHostSessionLifecycle;
	readonly sessionOperations: RuntimeHostSessionOperations;
}

/** Offline Session catalog commands coordinated with the Host's live Session ownership. */
export class RuntimeHostCatalogFacade {
	private readonly normalizePath: (path: string) => string;

	constructor(private readonly options: RuntimeHostCatalogFacadeOptions) {
		this.normalizePath = options.normalizePath ?? ((path) => path);
	}

	readSessionHistoryFromFile(path: string): { history: HistoryEntry[] } {
		return this.requireFileHistoryReader().read(path);
	}

	resolveSessionAccess(sessionPath: string): Promise<RuntimeSessionAccess | undefined> {
		return this.options.accessResolver?.resolve(this.normalizePath(sessionPath)) ?? Promise.resolve(undefined);
	}

	async listProjects(): Promise<ProjectInfo[]> {
		return [...(await this.requireCatalog().listProjects())];
	}

	async listSessions(cwd: string, sessionDir?: string): Promise<SessionHistoryInfo[]> {
		return [...(await this.requireCatalog().listSessions(cwd, sessionDir))];
	}

	async deleteSession(sessionPath: string): Promise<void> {
		await this.assertCapability(sessionPath, "delete");
		const existing = this.options.sessionLifecycle.findBySessionPath(sessionPath);
		if (existing) {
			try {
				await this.options.sessionLifecycle.disposeSession(existing.sessionId, {
					releaseOnDisposeFailure: true,
				});
			} catch {
				// 删除以「会话文件消失」为准。释放失败已由 sessionLifecycle 记为
				// session.dispose 生命周期观测；再让它把用户卡在删不掉的会话上只会更糟。
			}
		}
		await this.requireCatalog().deleteSessionArtifacts(sessionPath);
	}

	async renameSession(sessionPath: string, name: string): Promise<void> {
		await this.assertCapability(sessionPath, "rename");
		const existing = this.options.sessionLifecycle.findBySessionPath(sessionPath);
		if (existing) {
			await this.options.sessionOperations.renameSessionById(existing.sessionId, name);
			return;
		}
		await this.requireCatalog().renameSession(sessionPath, name);
	}

	private requireCatalog(): RuntimeSessionCatalog {
		if (!this.options.catalog) {
			throw runtimeError(
				"INTERNAL_ERROR",
				"RuntimeHost requires an explicit sessionCatalog composition.",
				false,
				"runtime",
			);
		}
		return this.options.catalog;
	}

	private requireFileHistoryReader(): RuntimeSessionFileHistoryReader {
		if (!this.options.fileHistoryReader) {
			throw runtimeError(
				"INTERNAL_ERROR",
				"RuntimeHost requires an explicit sessionFileHistoryReader composition.",
				false,
				"runtime",
			);
		}
		return this.options.fileHistoryReader;
	}

	private async assertCapability(sessionPath: string, capability: "rename" | "delete"): Promise<void> {
		if (!this.options.accessResolver) return;
		const access = await this.options.accessResolver.resolve(this.normalizePath(sessionPath));
		if (access?.[capability]) return;
		// 「无路由认领」与「路由声明拒绝」是两类不同语义：前者是路径不属于本
		// 运行时（外来格式/他实例专属/残留路径），后者才是能力被拒。
		if (access === undefined) {
			throw runtimeError(
				"INVALID_REQUEST",
				`Session is not recognized by this runtime: ${sessionPath}`,
				false,
				"runtime",
			);
		}
		throw runtimeError("INVALID_REQUEST", `Session does not support ${capability}: ${sessionPath}`, false, "runtime");
	}
}
