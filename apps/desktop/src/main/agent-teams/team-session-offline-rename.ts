// Copyright The Open Forge contributors.
import { randomUUID } from "node:crypto";
import { lstat } from "node:fs/promises";
import { dirname } from "node:path";
import { parseTeamSessionDocument, type TeamSessionDocument, type TeamSessionStateRecord } from "@vetta/agent-team";
import type { ConversationDocument } from "@vetta/runtime-core";
import { CONVERSATION_STORAGE_ERROR_CODES, FileConversationRepository } from "@vetta/runtime-node/conversation";
import type { ConversationOwnershipCatalogPort } from "../conversations/conversation-ownership-catalog.js";
import { registerAgentTeamSessionOwnership } from "./team-ownership-backfill.js";
import { resolveTeamConversationSessionId } from "./team-session-file-reader.js";

/**
 * BUG-0195：协调会话数据文件缺失的稳定文案锚点。IPC 只保 Error 的 message
 * （renderer/domains/conversation/services/resume-failure.ts 同款范式），渲染端按
 * 该前缀归类成「只能删除该条目」的用户文案。
 */
export const TEAM_SESSION_DATA_FILE_MISSING_ANCHOR = "Team session data file is missing";

const TEAM_SESSION_STATE_CUSTOM_TYPE = "agent-team.session-state.v1";
/** CAS 重试上限：离线写与 runtime 写并发时按 revision 冲突重读重写的轮数。 */
const MAX_RENAME_ATTEMPTS = 3;

/** 数据文件缺失的用户可读错误；不建任何 runtime、不伪造成功。 */
export function teamSessionDataFileMissingError(sessionPath: string): Error {
	return new Error(`${TEAM_SESSION_DATA_FILE_MISSING_ANCHOR}: ${sessionPath}`);
}

/**
 * 协调会话数据文件是否已丢失。只认 ENOENT（照 resolveSessionDeletion 的既有纪律）；
 * EACCES/EBUSY 等一律视为可用——瞬时不可 stat 不能把侧栏条目误标成不可用。
 */
export async function isTeamSessionDataFileMissing(sessionPath: string): Promise<boolean> {
	try {
		await lstat(sessionPath);
		return false;
	} catch (error) {
		return hasErrorCode(error, "ENOENT");
	}
}

export interface OfflineTeamSessionRenameInput {
	readonly id: string;
	readonly coordinationSessionPath: string;
	readonly title: string;
	/** 提供时同步所有权索引的 title/updatedAt（列表按 updatedAt 排序，必须一起更新）。 */
	readonly ownershipCatalog?: ConversationOwnershipCatalogPort;
}

export interface OfflineTeamSessionRenameResult {
	readonly session: TeamSessionDocument;
	/** 改名落盘后的协调文档；调用方可用它构建快照而无需 runtime。 */
	readonly coordinationDocument: ConversationDocument;
}

/**
 * 零 runtime 的团队会话改名（BUG-0195 决策 1）：只依赖「协调文件可读 + 能写盘 +
 * 所有权索引可写」，团队文档、成员 runtime、roster 对账、恢复工作流一律不进本路径。
 *
 * 并发纪律：读写全部经 FileConversationRepository 的跨实例文件锁（与 runtime 写走
 * 同一把 `.lock`）；追加用读到的 revision 做 CAS（custom.append 允许 null，传具体值
 * 更严——并发追加推进 revision 时抛 DOCUMENT_VERSION_CONFLICT 而不是静默覆盖），
 * 冲突在锁内重读重写；写后复核最新状态条目正是本次写入的那条。
 */
export async function renameTeamSessionWithoutRuntime(
	input: OfflineTeamSessionRenameInput,
): Promise<OfflineTeamSessionRenameResult> {
	if (await isTeamSessionDataFileMissing(input.coordinationSessionPath)) {
		throw teamSessionDataFileMissingError(input.coordinationSessionPath);
	}
	const conversationSessionId = resolveTeamConversationSessionId(input.coordinationSessionPath);
	const repository = new FileConversationRepository({ rootDir: dirname(input.coordinationSessionPath) });
	try {
		let document = await readCoordinationDocument(repository, conversationSessionId, input.coordinationSessionPath);
		for (let attempt = 1; ; attempt += 1) {
			const current = readLatestTeamSessionState(input.id, document);
			const session: TeamSessionDocument = {
				...current,
				title: input.title,
				revision: current.revision + 1,
				updatedAt: Date.now(),
			};
			const record: TeamSessionStateRecord = { customType: TEAM_SESSION_STATE_CUSTOM_TYPE, session };
			try {
				// 条目形状对齐 kernel-runtime-session-backend.ts appendEntry：
				// custom.append + `entry-` 前缀 id + data 即状态记录本体。
				await repository.execute(conversationSessionId, document.revision, {
					type: "custom.append",
					entryId: `entry-${randomUUID()}`,
					customType: TEAM_SESSION_STATE_CUSTOM_TYPE,
					data: record,
					timestamp: new Date().toISOString(),
				});
			} catch (error) {
				if (isDocumentVersionConflict(error) && attempt < MAX_RENAME_ATTEMPTS) {
					// 文件锁释放窗口内被并发追加：锁内重读最新状态再改，不覆盖他方写入。
					document = await readCoordinationDocument(
						repository,
						conversationSessionId,
						input.coordinationSessionPath,
					);
					continue;
				}
				throw error;
			}
			const after = await readCoordinationDocument(repository, conversationSessionId, input.coordinationSessionPath);
			// 写后复核：磁盘最新状态条目必须是本次写入的 session，否则视作改名未成立。
			if (JSON.stringify(readLatestTeamSessionState(input.id, after)) !== JSON.stringify(session)) {
				throw new Error(`Team session rename could not be confirmed on disk: ${input.id}`);
			}
			if (input.ownershipCatalog) await registerAgentTeamSessionOwnership(session, input.ownershipCatalog);
			return { session, coordinationDocument: after };
		}
	} finally {
		await repository.close();
	}
}

async function readCoordinationDocument(
	repository: FileConversationRepository,
	conversationSessionId: string,
	sessionPath: string,
): Promise<ConversationDocument> {
	try {
		return await repository.readDocument(conversationSessionId);
	} catch (error) {
		if (isConversationNotFound(error)) throw teamSessionDataFileMissingError(sessionPath);
		throw error;
	}
}

/** 从后往前找最新的会话状态条目并校验身份；协调文档上没有可用的状态记录时抛错。 */
function readLatestTeamSessionState(id: string, document: ConversationDocument): TeamSessionDocument {
	for (let index = document.entries.length - 1; index >= 0; index -= 1) {
		const entry = document.entries[index];
		if (entry?.type !== "custom" || entry.customType !== TEAM_SESSION_STATE_CUSTOM_TYPE) continue;
		if (!isTeamSessionStateRecord(entry.data)) continue;
		const session = parseTeamSessionDocument(entry.data.session);
		if (session.id !== id) throw new Error("Team coordination Conversation belongs to another session");
		return session;
	}
	throw new Error(`Team session state is missing from coordination Conversation: ${id}`);
}

function isTeamSessionStateRecord(value: unknown): value is TeamSessionStateRecord {
	return (
		typeof value === "object" &&
		value !== null &&
		"customType" in value &&
		value.customType === TEAM_SESSION_STATE_CUSTOM_TYPE &&
		"session" in value
	);
}

function isConversationNotFound(error: unknown): boolean {
	return hasStorageCode(error, CONVERSATION_STORAGE_ERROR_CODES.NOT_FOUND);
}

function isDocumentVersionConflict(error: unknown): boolean {
	return hasStorageCode(error, CONVERSATION_STORAGE_ERROR_CODES.DOCUMENT_VERSION_CONFLICT);
}

function hasStorageCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

/** runtime 对「会话不在内存目录」的统一判别：普通对象或挂了 code 的 Error 都算。 */
function hasErrorCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
