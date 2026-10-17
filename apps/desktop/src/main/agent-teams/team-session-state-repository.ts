// Modified by The Open Forge contributors.
import type { TeamSessionDocument, TeamSessionStateRecord } from "@vetta/agent-team";
import type { ConversationDocument, RuntimeHost } from "@vetta/runtime-core";
import type { ConversationOwnershipCatalogPort } from "../conversations/conversation-ownership-catalog.js";
import { TeamOperationQueue } from "./team-operation-queue.js";
import { registerAgentTeamSessionOwnership } from "./team-ownership-backfill.js";

export interface TeamSessionStateRepositoryOptions {
	readonly runtime: () => RuntimeHost;
	readonly ownershipCatalog?: ConversationOwnershipCatalogPort;
}

/** 本仓库最后成功追加（或核对一致）的状态条目指纹。 */
interface PersistedSessionFingerprint {
	/**
	 * 追加/核对时的协调文档 revision。任何 custom.append（含状态条目本身）都会推进
	 * revision，因此 revision 未变即磁盘最新状态条目仍是记录的那条；一旦推进即回退
	 * 对最新条目的精确比较。
	 */
	readonly coordinationRevision: number;
	/** 追加（或核对一致）的 session 精确序列化，热路径只需再序列化当前 session 一次。 */
	readonly serializedSession: string;
}

/** Sole owner of loaded Team Session state, coordination paths, persistence, and per-session transactions. */
export class TeamSessionStateRepository {
	private readonly sessions = new Map<string, TeamSessionDocument>();
	private readonly coordinationPaths = new Map<string, string>();
	private readonly persistedFingerprints = new Map<string, PersistedSessionFingerprint>();
	private readonly transactions = new TeamOperationQueue();

	constructor(private readonly options: TeamSessionStateRepositoryOptions) {}

	get(sessionId: string): TeamSessionDocument | undefined {
		return this.sessions.get(sessionId);
	}

	set(session: TeamSessionDocument): void {
		this.sessions.set(session.id, session);
	}

	remove(sessionId: string): void {
		this.sessions.delete(sessionId);
		this.coordinationPaths.delete(sessionId);
		this.persistedFingerprints.delete(sessionId);
	}

	/**
	 * 只移除内存缓存条目、保留 coordination path（与 remove 的删除语义相对）。
	 * 空闲驻留逐出用它：会话文件与重开能力保持完整，之后 read(id) 无参仍可恢复。
	 * 指纹一并丢弃，重开后的首次 persist 重走冷路径对磁盘真值精确核对。
	 */
	removeCached(sessionId: string): void {
		this.sessions.delete(sessionId);
		this.persistedFingerprints.delete(sessionId);
	}

	values(): readonly TeamSessionDocument[] {
		return [...this.sessions.values()];
	}

	rememberCoordinationPath(sessionId: string, sessionPath: string): void {
		this.coordinationPaths.set(sessionId, sessionPath);
	}

	coordinationPath(sessionId: string): string | undefined {
		return this.coordinationPaths.get(sessionId);
	}

	/**
	 * 持久化团队会话状态。高频调用（自动标题、模型设置、成员调度、迁移等 20+ 处），
	 * 热路径靠指纹避免双重全量序列化与 O(entries) 扫描：协调文档 revision 未变即
	 * 磁盘最新状态条目仍是本仓库写入的那条，只需序列化当前 session 一次比较；
	 * 任何不确定性（指纹缺失、revision 被其他 custom.append 推进）都回退到与旧
	 * 实现逐语义等价的精确比较。
	 */
	async persist(session: TeamSessionDocument): Promise<void> {
		const coordination = session.coordinationRuntime;
		if (!coordination) throw new Error("Team coordination conversation is unavailable");
		const record: TeamSessionStateRecord = { customType: "agent-team.session-state.v1", session };
		const document = this.options.runtime().readSessionDocument(coordination.sessionId);
		const serializedSession = JSON.stringify(session);
		const fingerprint = this.persistedFingerprints.get(session.id);
		const trusted = fingerprint !== undefined && fingerprint.coordinationRevision === document.revision;
		const unchanged = trusted
			? fingerprint.serializedSession === serializedSession
			: latestSessionStateEntryMatches(document, record.customType, serializedSession);
		if (!unchanged) {
			await this.options.runtime().appendSessionMetadataEntry(coordination.sessionId, record.customType, record);
			// 追加成功后 revision 已推进；重读内存投影（O(1)）记录精确值，不预测。
			this.persistedFingerprints.set(session.id, {
				coordinationRevision: this.options.runtime().readSessionDocument(coordination.sessionId).revision,
				serializedSession,
			});
		} else {
			this.persistedFingerprints.set(session.id, {
				coordinationRevision: document.revision,
				serializedSession,
			});
		}
		await this.registerOwnership(session);
		this.set(session);
	}

	registerOwnership(session: TeamSessionDocument): Promise<void> {
		if (!this.options.ownershipCatalog) return Promise.resolve();
		return registerAgentTeamSessionOwnership(session, this.options.ownershipCatalog);
	}

	coordinate<T>(
		sessionId: string,
		load: () => Promise<TeamSessionDocument>,
		operation: (session: TeamSessionDocument) => Promise<T>,
	): Promise<T> {
		return this.transactions.run(sessionId, async () => operation(await load()));
	}

	coordinateLoaded<T>(sessionId: string, operation: (session: TeamSessionDocument) => Promise<T>): Promise<T> {
		return this.transactions.run(sessionId, async () => {
			const session = this.get(sessionId);
			if (!session) throw new Error(`Team session is not loaded: ${sessionId}`);
			return operation(session);
		});
	}
}

function isTeamSessionStateRecord(value: unknown): value is TeamSessionStateRecord {
	return (
		typeof value === "object" &&
		value !== null &&
		"customType" in value &&
		value.customType === "agent-team.session-state.v1" &&
		"session" in value
	);
}

/** 冷路径精确比较：协调文档上最新的状态条目是否与当前序列化 session 完全一致。 */
function latestSessionStateEntryMatches(
	document: ConversationDocument,
	customType: string,
	serializedSession: string,
): boolean {
	for (let index = document.entries.length - 1; index >= 0; index -= 1) {
		const entry = document.entries[index];
		if (entry?.type !== "custom" || entry.customType !== customType) continue;
		return isTeamSessionStateRecord(entry.data) && JSON.stringify(entry.data.session) === serializedSession;
	}
	return false;
}
