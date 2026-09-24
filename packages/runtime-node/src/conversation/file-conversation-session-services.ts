// Modified by The Open Forge contributors.
import { closeSync, createReadStream, type Dirent, openSync, readFileSync, readSync } from "node:fs";
import { type FileHandle, open, readdir, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import type {
	HistoryEntry,
	ProjectInfo,
	RuntimeSessionCatalog,
	RuntimeSessionFileHistoryReader,
	SessionHistoryInfo,
} from "@vetta/runtime-core";
import { projectConversationDocumentHistory } from "@vetta/runtime-core/conversation";
import {
	type ConversationOwnershipManager,
	isConversationFileHeader,
	type ReadConversationFileHeader,
} from "@vetta/runtime-storage/conversation";
import { documentFromFile, encodeConversationSessionId, parseConversationFile } from "./conversation-file-codec.js";
import { acquireConversationFileLock } from "./conversation-file-lock.js";
import { FileConversationOwnershipManager } from "./conversation-ownership-lease.js";
import { FileConversationRepository } from "./file-conversation-repository.js";
import { nodeErrorCode } from "./node-error-code.js";

const CONVERSATION_FILE_SUFFIX = ".conversation.jsonl";
const CONVERSATION_HEADER_READ_BYTES = 64 * 1024;
const LAST_MESSAGE_PREVIEW_LENGTH = 120;

export interface RuntimeConversationSessionRoot {
	readonly cwd: string;
	readonly sessionDir: string;
}

export interface FileConversationRuntimeSessionCatalogOptions {
	readonly roots?: readonly RuntimeConversationSessionRoot[];
	readonly ownershipManager?: ConversationOwnershipManager;
	readonly artifactCleaner?: ConversationSessionArtifactCleaner;
}

export interface ConversationSessionArtifactCleaner {
	deleteSessionArtifacts(sessionId: string): Promise<void>;
}

/** Native conversation 文件的离线目录与生命周期适配器。 */
export class FileConversationRuntimeSessionCatalog implements RuntimeSessionCatalog {
	private readonly roots: readonly RuntimeConversationSessionRoot[];
	private readonly ownershipManager: ConversationOwnershipManager;
	private readonly artifactCleaner: ConversationSessionArtifactCleaner | undefined;

	constructor(options: FileConversationRuntimeSessionCatalogOptions = {}) {
		this.roots = options.roots ?? [];
		this.ownershipManager = options.ownershipManager ?? new FileConversationOwnershipManager();
		this.artifactCleaner = options.artifactCleaner;
	}

	async ownsSession(sessionPath: string): Promise<boolean> {
		try {
			const header = await readConversationHeader(sessionPath);
			return header !== undefined && isCanonicalConversationPath(sessionPath, header.sessionId);
		} catch {
			return false;
		}
	}

	async listProjects(): Promise<ProjectInfo[]> {
		const sessionsByCwd = new Map<string, Set<string>>();
		for (const root of this.roots) {
			const sessions = await this.listRoot(root.cwd, root.sessionDir);
			let paths = sessionsByCwd.get(root.cwd);
			if (!paths) {
				paths = new Set<string>();
				sessionsByCwd.set(root.cwd, paths);
			}
			for (const session of sessions) paths.add(resolve(session.path));
		}
		return Array.from(sessionsByCwd, ([cwd, paths]) => ({ cwd, sessionCount: paths.size }))
			.filter(({ sessionCount }) => sessionCount > 0)
			.sort((left, right) => left.cwd.localeCompare(right.cwd));
	}

	async listSessions(cwd: string, sessionDir?: string): Promise<SessionHistoryInfo[]> {
		const roots = sessionDir
			? [{ cwd, sessionDir }]
			: this.roots.filter((root) => resolve(root.cwd) === resolve(cwd));
		const lists = await Promise.all(roots.map((root) => this.listRoot(root.cwd, root.sessionDir)));
		const sessions = new Map<string, SessionHistoryInfo>();
		for (const list of lists) {
			for (const session of list) sessions.set(resolve(session.path), session);
		}
		return Array.from(sessions.values()).sort((left, right) => right.modifiedAt - left.modifiedAt);
	}

	async renameSession(sessionPath: string, name: string): Promise<void> {
		const path = resolve(sessionPath);
		await requireConversationHeader(path);
		const lease = await this.ownershipManager.acquire(path);
		const repository = new FileConversationRepository({ rootDir: dirname(path) });
		try {
			const header = await requireConversationHeader(path);
			if (repository.resolveConversationPath(header.sessionId) !== path) {
				throw new Error(`Conversation path does not match its session id: ${path}`);
			}
			await repository.execute(header.sessionId, null, { type: "session.name.set", name });
		} finally {
			await repository.close();
			await lease.release();
		}
	}

	async deleteSessionArtifacts(sessionPath: string): Promise<void> {
		const path = resolve(sessionPath);
		await requireConversationHeader(path);
		const lease = await this.ownershipManager.acquire(path);
		let releaseFileLock: (() => Promise<void>) | undefined;
		try {
			const header = await requireConversationHeader(path);
			releaseFileLock = await acquireConversationFileLock(`${path}.lock`, header.sessionId);
			await this.artifactCleaner?.deleteSessionArtifacts(header.sessionId);
			await rm(join(dirname(path), `${encodeConversationSessionId(header.sessionId)}.snapshot.json`), {
				force: true,
			});
			await rm(path, { force: true });
		} finally {
			await releaseFileLock?.();
			await lease.release();
		}
	}

	private async listRoot(cwd: string, sessionDir: string): Promise<SessionHistoryInfo[]> {
		let entries: Dirent<string>[];
		try {
			entries = await readdir(sessionDir, { withFileTypes: true });
		} catch (error) {
			if (nodeErrorCode(error) === "ENOENT") return [];
			throw error;
		}
		const sessions = await Promise.all(
			entries
				.filter((entry) => entry.isFile() && entry.name.endsWith(CONVERSATION_FILE_SUFFIX))
				.map(async (entry) => {
					try {
						return await readSessionHistoryInfo(join(sessionDir, entry.name), cwd);
					} catch {
						return undefined;
					}
				}),
		);
		return sessions.filter((session): session is SessionHistoryInfo => session !== undefined);
	}
}

/** Native conversation 文件到 Runtime 历史合同的同步只读投影。 */
export class FileConversationRuntimeSessionFileHistoryReader implements RuntimeSessionFileHistoryReader {
	canRead(sessionPath: string): boolean {
		try {
			const header = readConversationHeaderSync(sessionPath);
			return header !== undefined && isCanonicalConversationPath(sessionPath, header.sessionId);
		} catch {
			return false;
		}
	}

	read(sessionPath: string): { history: HistoryEntry[] } {
		const text = readFileSync(sessionPath, "utf8");
		const header = parseConversationHeader(text);
		if (!header || !isCanonicalConversationPath(sessionPath, header.sessionId)) {
			throw new Error(`Unsupported native conversation file: ${sessionPath}`);
		}
		const file = parseConversationFile(text, header.sessionId);
		return { history: projectConversationDocumentHistory(documentFromFile(header.sessionId, file)) };
	}
}

interface SessionListIndexAccumulator {
	sessionId?: string;
	agentId?: string;
	cwd?: string;
	name?: string;
	parentSessionPath?: string;
	parentEntryId?: string;
	firstUserMessage?: string;
	lastMessage?: { readonly role: "user" | "assistant"; readonly text: string; readonly timestamp?: number };
}

async function readSessionHistoryInfo(sessionPath: string, fallbackCwd: string): Promise<SessionHistoryInfo> {
	const path = resolve(sessionPath);
	const fileStat = await stat(path);
	const summary = await summarizeConversationFileForList(path);
	if (!summary.sessionId || !isCanonicalConversationPath(path, summary.sessionId)) {
		throw new Error(`Unsupported native conversation file: ${path}`);
	}
	const modifiedAt = summary.lastMessage?.timestamp ?? fileStat.mtimeMs;
	return {
		id: summary.sessionId,
		path,
		agentId: summary.agentId,
		cwd: summary.cwd ?? fallbackCwd,
		name: summary.name,
		firstMessage: summary.firstUserMessage ?? "(no messages)",
		modifiedAt,
		lastMessagePreview: summary.lastMessage?.text.slice(0, LAST_MESSAGE_PREVIEW_LENGTH),
		parentSessionPath: summary.parentSessionPath,
		parentEntryId: summary.parentEntryId,
		fileSizeBytes: fileStat.size,
	};
}

async function summarizeConversationFileForList(sessionPath: string): Promise<SessionListIndexAccumulator> {
	const accumulator: SessionListIndexAccumulator = {};
	const stream = createReadStream(sessionPath, { encoding: "utf8" });
	const lines = createInterface({ input: stream, crlfDelay: Infinity });
	try {
		for await (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			summarizeConversationListRecord(parseJsonLine(trimmed), accumulator);
		}
	} finally {
		stream.destroy();
	}
	return accumulator;
}

function parseJsonLine(line: string): unknown {
	try {
		return JSON.parse(line) as unknown;
	} catch {
		return undefined;
	}
}

function summarizeConversationListRecord(record: unknown, accumulator: SessionListIndexAccumulator): void {
	if (!record || typeof record !== "object") return;
	if (isConversationFileHeader(record)) {
		accumulator.sessionId = record.sessionId;
		if ("agentId" in record && typeof record.agentId === "string") accumulator.agentId = record.agentId;
		if ("cwd" in record && typeof record.cwd === "string") accumulator.cwd = record.cwd;
		if ("parentSessionPath" in record && typeof record.parentSessionPath === "string") {
			accumulator.parentSessionPath = record.parentSessionPath;
		}
		if ("parentEntryId" in record && typeof record.parentEntryId === "string") {
			accumulator.parentEntryId = record.parentEntryId;
		}
		return;
	}
	const value = record as Record<string, unknown>;
	if (value.recordType === "conversation.header" && typeof value.sessionId === "string") {
		accumulator.sessionId = value.sessionId;
		if (typeof value.agentId === "string") accumulator.agentId = value.agentId;
		if (typeof value.cwd === "string") accumulator.cwd = value.cwd;
		return;
	}
	if (value.recordType === "conversation.seed" && typeof value.name === "string") {
		accumulator.name = value.name;
	}
	if (value.recordType === "conversation.document.operation") {
		const command = value.command;
		if (command && typeof command === "object") {
			const op = command as Record<string, unknown>;
			if (op.type === "session.name.set" && typeof op.name === "string") accumulator.name = op.name;
		}
	}
	if (value.recordType === "conversation.event") {
		summarizeKernelListEvent(value.event, accumulator);
	}
}

function summarizeKernelListEvent(event: unknown, accumulator: SessionListIndexAccumulator): void {
	if (!event || typeof event !== "object") return;
	const value = event as Record<string, unknown>;
	if (value.type !== "message.appended") return;
	const payload = value.message;
	if (!payload || typeof payload !== "object") return;
	const message = payload as Record<string, unknown>;
	if (message.role !== "user" && message.role !== "assistant") return;
	const text = extractMessageText(message.content);
	if (!text) return;
	const timestamp = typeof message.timestamp === "number" ? message.timestamp : undefined;
	if (message.role === "user" && !accumulator.firstUserMessage) accumulator.firstUserMessage = text;
	const current = accumulator.lastMessage;
	if (!current || (timestamp ?? 0) >= (current.timestamp ?? 0)) {
		accumulator.lastMessage = { role: message.role, text, timestamp };
	}
}

function extractMessageText(content: unknown): string | undefined {
	if (typeof content === "string") return normalizeMessageText(content);
	if (!Array.isArray(content)) return undefined;
	const text = content
		.flatMap((part) =>
			typeof part === "object" && part !== null && "text" in part && typeof part.text === "string"
				? [part.text]
				: [],
		)
		.join("\n");
	return normalizeMessageText(text);
}

function normalizeMessageText(text: string): string | undefined {
	const normalized = text.replace(/\s+/g, " ").trim();
	return normalized || undefined;
}

async function requireConversationHeader(sessionPath: string): Promise<ReadConversationFileHeader> {
	const header = await readConversationHeader(sessionPath);
	if (!header || !isCanonicalConversationPath(sessionPath, header.sessionId)) {
		throw new Error(`Unsupported native conversation file: ${sessionPath}`);
	}
	return header;
}

async function readConversationHeader(sessionPath: string): Promise<ReadConversationFileHeader | undefined> {
	let handle: FileHandle | undefined;
	try {
		handle = await open(sessionPath, "r");
		const buffer = Buffer.alloc(CONVERSATION_HEADER_READ_BYTES);
		const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
		return parseConversationHeader(firstCompleteLine(buffer, bytesRead));
	} finally {
		await handle?.close();
	}
}

function readConversationHeaderSync(sessionPath: string): ReadConversationFileHeader | undefined {
	const descriptor = openSync(sessionPath, "r");
	try {
		const buffer = Buffer.alloc(CONVERSATION_HEADER_READ_BYTES);
		return parseConversationHeader(firstCompleteLine(buffer, readSync(descriptor, buffer, 0, buffer.length, 0)));
	} finally {
		closeSync(descriptor);
	}
}

function parseConversationHeader(text: string | undefined): ReadConversationFileHeader | undefined {
	const firstLine = text?.split(/\r?\n/, 1)[0];
	if (!firstLine) return undefined;
	try {
		const value: unknown = JSON.parse(firstLine);
		return isConversationFileHeader(value) ? value : undefined;
	} catch {
		return undefined;
	}
}

function firstCompleteLine(buffer: Buffer, bytesRead: number): string | undefined {
	const text = buffer.toString("utf8", 0, bytesRead);
	const newline = text.indexOf("\n");
	if (newline === -1 && bytesRead === buffer.length) return undefined;
	return (newline === -1 ? text : text.slice(0, newline)).replace(/\r$/, "") || undefined;
}

function isCanonicalConversationPath(sessionPath: string, sessionId: string): boolean {
	return (
		resolve(sessionPath) ===
		resolve(dirname(sessionPath), `${encodeConversationSessionId(sessionId)}${CONVERSATION_FILE_SUFFIX}`)
	);
}
