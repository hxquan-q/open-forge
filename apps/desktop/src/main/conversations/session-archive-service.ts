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
	safePath,
} from "@vetta/runtime-storage/conversation";
import { app, dialog } from "electron";
import { mainT } from "../i18n/index.js";
import { getAppLogger } from "../logger.js";

const log = getAppLogger("session-archive");

export const SESSION_ARCHIVE_EXTENSION = "ofar";

export interface SessionArchiveExportResult {
	readonly saved: boolean;
	readonly path?: string;
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

export async function exportSessionArchiveToBytes(input: {
	readonly sessionPath: string;
	readonly passphrase: string;
	readonly appVersion?: string;
}): Promise<Uint8Array> {
	const content = await readFile(input.sessionPath, "utf8");
	const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
	const records: unknown[] = [];
	let sessionId = basename(input.sessionPath, ".jsonl");
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

	return encodeSessionArchive({
		appVersion: input.appVersion ?? app.getVersion(),
		passphrase: input.passphrase,
		sessions: [
			{
				sessionId,
				name,
				cwd,
				fingerprintSource: { records },
				records,
			},
		],
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
	const result = await dialog.showSaveDialog({
		title: mainT("sessionArchive.exportDialogTitle"),
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
	if (result.canceled || !result.filePath) {
		return { saved: false };
	}
	await writeFile(result.filePath, Buffer.from(bytes));
	return { saved: true, path: result.filePath };
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

function sanitizeFileStem(value: string): string {
	const cleaned = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
	return cleaned.slice(0, 64) || "session";
}
