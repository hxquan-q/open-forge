/**
 * Desktop session archive export/import. Uses @vetta/runtime-storage portable format.
 * IPC and UI stay thin; this module owns file I/O and conflict policy.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
	decodeSessionArchive,
	encodeSessionArchive,
	fingerprintSessionPayload,
	resolveSessionArchiveImportConflict,
	SessionArchiveError,
	type SessionArchiveImportConflictResult,
	type SessionArchiveSessionPayload,
	safePath,
} from "@vetta/runtime-storage/conversation";
import { app, dialog } from "electron";
import { DEFAULT_CONVERSATION_CWD } from "../config/desktop-config-store.js";
import { mainT } from "../i18n/index.js";
import { getAppLogger } from "../logger.js";
import { emitConversationListChanged } from "./conversation-list-events.js";
import { resolveSessionListCwd } from "./session-paths.js";

const log = getAppLogger("session-archive");

export const SESSION_ARCHIVE_EXTENSION = "ofar";

export interface SessionArchiveExportResult {
	readonly saved: boolean;
	readonly path?: string;
}

export interface ProjectSessionArchiveExportResult {
	readonly saved: boolean;
	readonly path?: string;
	readonly sessionCount?: number;
	readonly reason?: "no-sessions";
}

export interface SessionArchiveImportResult {
	readonly canceled: boolean;
	readonly decisions: readonly SessionArchiveImportDecision[];
}

export interface SessionArchiveImportDecision {
	readonly fingerprint: string;
	readonly sessionId: string;
	readonly conflict: SessionArchiveImportConflictResult;
	readonly writtenPath?: string;
}

export interface KnownArchiveFingerprint {
	readonly sessionPath: string;
	readonly mtimeMs: number;
}

export interface SessionArchiveServiceOptions {
	readonly listKnownFingerprints: () => Promise<ReadonlyMap<string, KnownArchiveFingerprint>>;
	readonly resolveImportDirectory: (cwdHint?: string) => Promise<string>;
}

/**
 * Build a stable fingerprint source from the raw conversation file bytes.
 * Identity keys inside JSONL headers are aliased by the package fingerprint helper.
 */
export async function fingerprintConversationFile(content: string): Promise<string> {
	const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
	const records: unknown[] = [];
	for (const line of lines) {
		try {
			records.push(JSON.parse(line) as unknown);
		} catch {
			records.push({ raw: createHash("sha256").update(line).digest("hex") });
		}
	}
	return fingerprintSessionPayload({ records });
}

interface ParsedConversationFile {
	readonly sessionId: string;
	readonly name?: string;
	readonly cwd?: string;
	readonly records: readonly unknown[];
}

/**
 * Parse a raw conversation jsonl into archive payload fields. Bad lines degrade to a
 * content hash so the fingerprint still changes with the file instead of throwing.
 */
export function parseConversationFile(content: string, fallbackSessionId: string): ParsedConversationFile {
	const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
	const records: unknown[] = [];
	let sessionId = fallbackSessionId;
	let name: string | undefined;
	let cwd: string | undefined;
	for (const line of lines) {
		try {
			const parsed = JSON.parse(line) as Record<string, unknown>;
			records.push(parsed);
			if (parsed.type === "session" && typeof parsed.id === "string") {
				sessionId = parsed.id;
			}
			if (parsed.type === "session_info" && typeof parsed.name === "string") {
				name = parsed.name;
			}
			if (parsed.type === "session" && typeof parsed.cwd === "string") {
				cwd = parsed.cwd;
			}
		} catch {
			records.push({ rawLineSha256: createHash("sha256").update(line).digest("hex") });
		}
	}
	return { sessionId, name, cwd, records };
}

export async function exportSessionArchiveToBytes(input: {
	readonly sessionPath: string;
	readonly passphrase: string;
	readonly appVersion?: string;
}): Promise<Uint8Array> {
	const content = await readFile(input.sessionPath, "utf8");
	const parsed = parseConversationFile(content, basename(input.sessionPath, ".jsonl"));
	return encodeSessionArchive({
		appVersion: input.appVersion ?? app.getVersion(),
		passphrase: input.passphrase,
		sessions: [
			{
				sessionId: parsed.sessionId,
				name: parsed.name,
				cwd: parsed.cwd,
				fingerprintSource: { records: parsed.records },
				records: parsed.records,
			},
		],
	});
}

/**
 * Bundle several conversation files (a whole project) into one portable archive.
 * Any unreadable session fails the whole export: a partial "backup" would look
 * complete to the user while silently missing conversations.
 */
export async function exportProjectSessionsArchiveToBytes(input: {
	readonly sessionPaths: readonly string[];
	readonly passphrase: string;
	readonly appVersion?: string;
}): Promise<Uint8Array> {
	if (input.sessionPaths.length === 0) {
		throw new Error("no sessions to export");
	}
	const sessions: SessionArchiveSessionPayload[] = [];
	for (const sessionPath of input.sessionPaths) {
		let content: string;
		try {
			content = await readFile(sessionPath, "utf8");
		} catch (error) {
			throw new Error(
				`failed to read session ${basename(sessionPath)}: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
		const parsed = parseConversationFile(content, basename(sessionPath, ".jsonl"));
		sessions.push({
			sessionId: parsed.sessionId,
			name: parsed.name,
			cwd: parsed.cwd,
			fingerprintSource: { records: parsed.records },
			records: parsed.records,
		});
	}
	return encodeSessionArchive({
		appVersion: input.appVersion ?? app.getVersion(),
		passphrase: input.passphrase,
		sessions,
	});
}

export async function exportSessionArchiveWithDialog(input: {
	readonly sessionPath: string;
	readonly passphrase: string;
	readonly defaultFileName?: string;
}): Promise<SessionArchiveExportResult> {
	const bytes = await exportSessionArchiveToBytes(input);
	const defaultName =
		input.defaultFileName?.trim() ||
		`${basename(input.sessionPath, ".jsonl") || "session"}.${SESSION_ARCHIVE_EXTENSION}`;
	const savedTo = await showArchiveSaveDialog(defaultName, "sessionArchive.exportDialogTitle");
	if (!savedTo) {
		return { saved: false };
	}
	await writeFile(savedTo, Buffer.from(bytes));
	return { saved: true, path: savedTo };
}

export async function exportProjectSessionsArchiveWithDialog(input: {
	readonly sessionPaths: readonly string[];
	readonly passphrase: string;
	readonly defaultFileName?: string;
}): Promise<ProjectSessionArchiveExportResult> {
	if (input.sessionPaths.length === 0) {
		// 零会话时不弹保存框：用户会觉得「保存了个空壳」而不知道自己导丢了什么。
		return { saved: false, reason: "no-sessions" };
	}
	const bytes = await exportProjectSessionsArchiveToBytes({
		sessionPaths: input.sessionPaths,
		passphrase: input.passphrase,
	});
	const defaultName = input.defaultFileName?.trim() || `project-sessions.${SESSION_ARCHIVE_EXTENSION}`;
	const savedTo = await showArchiveSaveDialog(defaultName, "sessionArchive.projectExportDialogTitle");
	if (!savedTo) {
		return { saved: false };
	}
	await writeFile(savedTo, Buffer.from(bytes));
	return { saved: true, path: savedTo, sessionCount: input.sessionPaths.length };
}

async function showArchiveSaveDialog(defaultName: string, titleKey: string): Promise<string | undefined> {
	const result = await dialog.showSaveDialog({
		title: mainT(titleKey),
		defaultPath: defaultName.endsWith(`.${SESSION_ARCHIVE_EXTENSION}`)
			? defaultName
			: `${defaultName}.${SESSION_ARCHIVE_EXTENSION}`,
		filters: [
			{
				name: mainT("sessionArchive.filterName"),
				extensions: [SESSION_ARCHIVE_EXTENSION],
			},
		],
	});
	if (result.canceled || !result.filePath) return undefined;
	return result.filePath;
}

export async function importSessionArchiveFromBytes(
	bytes: Uint8Array,
	passphrase: string,
	options: SessionArchiveServiceOptions & {
		readonly archiveMtimeMs?: number;
		readonly preferOverwrite?: boolean;
	},
): Promise<SessionArchiveImportDecision[]> {
	const decoded = await decodeSessionArchive(bytes, passphrase);
	const known = await options.listKnownFingerprints();
	const decisions: SessionArchiveImportDecision[] = [];

	for (const session of decoded.sessions) {
		const existing = known.get(session.fingerprint);
		const conflict = resolveSessionArchiveImportConflict({
			existingFingerprint: existing ? session.fingerprint : `__absent__:${session.fingerprint}`,
			incomingFingerprint: session.fingerprint,
			existingMtimeMs: existing?.mtimeMs,
			incomingMtimeMs: options.archiveMtimeMs,
			preferOverwrite: options.preferOverwrite === true && existing !== undefined,
		});

		if (conflict.action === "skip-idempotent") {
			decisions.push({
				fingerprint: session.fingerprint,
				sessionId: session.sessionId,
				conflict,
				writtenPath: existing?.sessionPath,
			});
			continue;
		}

		const targetDir = await options.resolveImportDirectory(session.cwd);
		await mkdir(targetDir, { recursive: true });
		const targetName = `${sanitizeFileStem(session.name || session.sessionId)}-${randomUUID().slice(0, 8)}.jsonl`;
		let targetPath = join(targetDir, targetName);

		if (conflict.action === "overwrite" && existing?.sessionPath) {
			targetPath = existing.sessionPath;
		}

		const jsonl = `${session.records.map((record) => JSON.stringify(record)).join("\n")}\n`;
		const tempPath = `${targetPath}.${randomUUID()}.tmp`;
		await writeFile(tempPath, jsonl, "utf8");

		for (const attachment of session.attachments) {
			const relative = safePath(attachment.relativePath);
			const attachmentPath = join(dirname(targetPath), relative);
			await mkdir(dirname(attachmentPath), { recursive: true });
			await writeFile(attachmentPath, Buffer.from(attachment.bytes));
		}

		await rename(tempPath, targetPath);
		decisions.push({
			fingerprint: session.fingerprint,
			sessionId: session.sessionId,
			conflict,
			writtenPath: targetPath,
		});
		// 导入落盘对渲染端不可见（会话目录没有 watcher，只有本进程写入才广播）。
		// 按写入会话的列表 cwd 广播，侧栏沿用既有 sessions-changed 防抖重拉即时刷新。
		emitConversationListChanged({
			cwd: session.cwd?.trim() ? resolveSessionListCwd(session.cwd) : DEFAULT_CONVERSATION_CWD,
			sessionPath: targetPath,
		});
	}

	return decisions;
}

export async function importSessionArchiveWithDialog(
	passphrase: string,
	options: SessionArchiveServiceOptions,
): Promise<SessionArchiveImportResult> {
	const open = await dialog.showOpenDialog({
		title: mainT("sessionArchive.importDialogTitle"),
		properties: ["openFile"],
		filters: [
			{
				name: mainT("sessionArchive.filterName"),
				extensions: [SESSION_ARCHIVE_EXTENSION],
			},
		],
	});
	if (open.canceled || open.filePaths.length === 0) {
		return { canceled: true, decisions: [] };
	}
	const archivePath = open.filePaths[0]!;
	const bytes = new Uint8Array(await readFile(archivePath));
	let archiveMtimeMs: number | undefined;
	try {
		archiveMtimeMs = (await stat(archivePath)).mtimeMs;
	} catch {
		archiveMtimeMs = undefined;
	}

	try {
		const decisions = await importSessionArchiveFromBytes(bytes, passphrase, {
			...options,
			archiveMtimeMs,
		});
		return { canceled: false, decisions };
	} catch (error) {
		if (error instanceof SessionArchiveError) {
			log.warn("import rejected", error.archiveCode, error.message);
		}
		throw error;
	}
}

export function sanitizeFileStem(value: string): string {
	const cleaned = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
	return cleaned.slice(0, 64) || "session";
}
