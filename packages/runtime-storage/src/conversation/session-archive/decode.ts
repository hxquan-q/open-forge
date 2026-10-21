import { decryptGzipPayload, type ScryptParams } from "./crypto.js";
import { SESSION_ARCHIVE_ERROR_CODES, SessionArchiveError } from "./errors.js";
import { decodeAttachmentFrame, decodeFrames, decodeJsonPayload, decodeWorkspaceFileFrame } from "./frames.js";
import { safePath } from "./safe-path.js";
import {
	SESSION_ARCHIVE_CIPHER,
	SESSION_ARCHIVE_FORMAT,
	SESSION_ARCHIVE_FRAME,
	SESSION_ARCHIVE_KDF,
	SESSION_ARCHIVE_MAGIC,
	type SessionArchiveDecodedSession,
	type SessionArchiveDecodeResult,
	type SessionArchiveFileMetadata,
	type SessionArchiveFormatVersion,
	type SessionArchiveWorkspaceFileDecoded,
} from "./types.js";

export async function decodeSessionArchive(bytes: Uint8Array, passphrase: string): Promise<SessionArchiveDecodeResult> {
	if (bytes.byteLength < SESSION_ARCHIVE_MAGIC.byteLength + 2 + 4) {
		throw new SessionArchiveError(SESSION_ARCHIVE_ERROR_CODES.CORRUPT_HEADER, "Archive too short");
	}
	if (!magicEquals(bytes.subarray(0, SESSION_ARCHIVE_MAGIC.byteLength), SESSION_ARCHIVE_MAGIC)) {
		throw new SessionArchiveError(SESSION_ARCHIVE_ERROR_CODES.INVALID_MAGIC, "Not an Open Forge session archive");
	}

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let offset = SESSION_ARCHIVE_MAGIC.byteLength;
	const version = view.getUint16(offset, false);
	offset += 2;
	// v1 是纯会话归档，v2 额外携带 workspace 帧；其余版本一律拒绝（含 v2 包在旧版本上的
	// UNSUPPORTED_VERSION，不谈兼容）。
	if (version !== 1 && version !== 2) {
		throw new SessionArchiveError(
			SESSION_ARCHIVE_ERROR_CODES.UNSUPPORTED_VERSION,
			`Unsupported session archive version: ${version}`,
		);
	}
	const formatVersion = version as SessionArchiveFormatVersion;

	const metaLen = view.getUint32(offset, false);
	offset += 4;
	if (offset + metaLen > bytes.byteLength) {
		throw new SessionArchiveError(SESSION_ARCHIVE_ERROR_CODES.CORRUPT_HEADER, "Metadata truncated");
	}

	const metadata = parseMetadata(decodeJsonPayload(bytes.subarray(offset, offset + metaLen)), formatVersion);
	offset += metaLen;

	const saltLength = metadata.scrypt.saltLength;
	if (offset + saltLength + 12 > bytes.byteLength) {
		throw new SessionArchiveError(SESSION_ARCHIVE_ERROR_CODES.CORRUPT_HEADER, "Salt/IV truncated");
	}
	const salt = bytes.subarray(offset, offset + saltLength);
	offset += saltLength;
	const iv = bytes.subarray(offset, offset + 12);
	offset += 12;
	const ciphertext = bytes.subarray(offset);

	const scryptParams: ScryptParams = {
		N: metadata.scrypt.N,
		r: metadata.scrypt.r,
		p: metadata.scrypt.p,
		dkLen: metadata.scrypt.dkLen,
	};
	const plain = await decryptGzipPayload(ciphertext, passphrase, salt, iv, scryptParams);
	const frames = decodeFrames(plain);
	const { sessions, workspaceFiles } = materializeFrames(frames);

	if (sessions.length !== metadata.sessionCount) {
		throw new SessionArchiveError(
			SESSION_ARCHIVE_ERROR_CODES.INVALID_FRAME,
			`Session count mismatch: header ${metadata.sessionCount}, frames ${sessions.length}`,
		);
	}

	// v1 归档不允许携带 workspace 帧：版本与帧形态必须一致，拒绝非法混合。
	if (formatVersion === 1 && workspaceFiles.length > 0) {
		throw new SessionArchiveError(
			SESSION_ARCHIVE_ERROR_CODES.INVALID_FRAME,
			"Workspace frame in a v1 session archive",
		);
	}
	if (metadata.workspaceFileCount !== undefined && metadata.workspaceFileCount !== workspaceFiles.length) {
		throw new SessionArchiveError(
			SESSION_ARCHIVE_ERROR_CODES.INVALID_FRAME,
			`Workspace file count mismatch: header ${metadata.workspaceFileCount}, frames ${workspaceFiles.length}`,
		);
	}

	const workspace = formatVersion === 2 ? { sourceCwd: metadata.sourceCwd, files: workspaceFiles } : undefined;

	return { metadata, sessions, workspace };
}

function materializeFrames(frames: ReturnType<typeof decodeFrames>): {
	sessions: SessionArchiveDecodedSession[];
	workspaceFiles: SessionArchiveWorkspaceFileDecoded[];
} {
	const sessions: SessionArchiveDecodedSession[] = [];
	const workspaceFiles: SessionArchiveWorkspaceFileDecoded[] = [];
	let current: {
		sessionId: string;
		conversationId?: string;
		name?: string;
		cwd?: string;
		createdAt?: string;
		fingerprint: string;
		records: unknown[];
		attachments: SessionArchiveDecodedSession["attachments"][number][];
	} | null = null;

	const flush = () => {
		if (current) {
			sessions.push({
				sessionId: current.sessionId,
				conversationId: current.conversationId,
				name: current.name,
				cwd: current.cwd,
				createdAt: current.createdAt,
				fingerprint: current.fingerprint,
				records: current.records,
				attachments: current.attachments,
			});
			current = null;
		}
	};

	for (const frame of frames) {
		if (frame.kind === SESSION_ARCHIVE_FRAME.SESSION) {
			flush();
			const header = decodeJsonPayload(frame.payload);
			if (!isSessionHeader(header)) {
				throw new SessionArchiveError(SESSION_ARCHIVE_ERROR_CODES.INVALID_FRAME, "Invalid session frame");
			}
			current = {
				sessionId: header.sessionId,
				conversationId: header.conversationId,
				name: header.name,
				cwd: header.cwd,
				createdAt: header.createdAt,
				fingerprint: header.fingerprint,
				records: [],
				attachments: [],
			};
			continue;
		}
		// workspace 帧是归档级的，不依赖任何会话头，可以在任意位置出现。
		if (frame.kind === SESSION_ARCHIVE_FRAME.WORKSPACE_FILE) {
			const { meta, bytes } = decodeWorkspaceFileFrame(frame.payload);
			workspaceFiles.push({ relativePath: safePath(meta.relativePath), bytes });
			continue;
		}
		if (!current) {
			throw new SessionArchiveError(SESSION_ARCHIVE_ERROR_CODES.INVALID_FRAME, "Frame before session header");
		}
		if (frame.kind === SESSION_ARCHIVE_FRAME.RECORD) {
			current.records.push(decodeJsonPayload(frame.payload));
			continue;
		}
		if (frame.kind === SESSION_ARCHIVE_FRAME.ATTACHMENT) {
			const { meta, bytes } = decodeAttachmentFrame(frame.payload);
			const relativePath = safePath(meta.relativePath);
			current.attachments.push({
				id: meta.id,
				relativePath,
				mimeType: meta.mimeType,
				bytes,
			});
		}
	}
	flush();
	return { sessions, workspaceFiles };
}

function parseMetadata(value: unknown, formatVersion: SessionArchiveFormatVersion): SessionArchiveFileMetadata {
	if (value === null || typeof value !== "object") {
		throw new SessionArchiveError(SESSION_ARCHIVE_ERROR_CODES.CORRUPT_HEADER, "Metadata is not an object");
	}
	const record = value as Record<string, unknown>;
	const scrypt = record.scrypt;
	if (scrypt === null || typeof scrypt !== "object") {
		throw new SessionArchiveError(SESSION_ARCHIVE_ERROR_CODES.CORRUPT_HEADER, "Missing scrypt params");
	}
	const scryptRecord = scrypt as Record<string, unknown>;
	if (
		record.format !== SESSION_ARCHIVE_FORMAT ||
		record.formatVersion !== formatVersion ||
		record.cipher !== SESSION_ARCHIVE_CIPHER ||
		record.kdf !== SESSION_ARCHIVE_KDF ||
		typeof record.appVersion !== "string" ||
		typeof record.sessionCount !== "number" ||
		typeof record.createdAt !== "string" ||
		(record.sourceCwd !== undefined && typeof record.sourceCwd !== "string") ||
		(record.workspaceFileCount !== undefined &&
			(typeof record.workspaceFileCount !== "number" ||
				!Number.isInteger(record.workspaceFileCount) ||
				record.workspaceFileCount < 0)) ||
		typeof scryptRecord.N !== "number" ||
		typeof scryptRecord.r !== "number" ||
		typeof scryptRecord.p !== "number" ||
		typeof scryptRecord.dkLen !== "number" ||
		typeof scryptRecord.saltLength !== "number"
	) {
		throw new SessionArchiveError(SESSION_ARCHIVE_ERROR_CODES.CORRUPT_HEADER, "Metadata fields invalid");
	}
	return {
		format: SESSION_ARCHIVE_FORMAT,
		formatVersion,
		cipher: SESSION_ARCHIVE_CIPHER,
		kdf: SESSION_ARCHIVE_KDF,
		appVersion: record.appVersion,
		sessionCount: record.sessionCount,
		createdAt: record.createdAt,
		sourceCwd: record.sourceCwd,
		workspaceFileCount: record.workspaceFileCount,
		scrypt: {
			N: scryptRecord.N,
			r: scryptRecord.r,
			p: scryptRecord.p,
			dkLen: scryptRecord.dkLen,
			saltLength: scryptRecord.saltLength,
		},
	};
}

function isSessionHeader(value: unknown): value is {
	sessionId: string;
	conversationId?: string;
	name?: string;
	cwd?: string;
	createdAt?: string;
	fingerprint: string;
} {
	if (value === null || typeof value !== "object") return false;
	const record = value as Record<string, unknown>;
	return typeof record.sessionId === "string" && typeof record.fingerprint === "string";
}

function magicEquals(actual: Uint8Array, expected: Uint8Array): boolean {
	if (actual.byteLength !== expected.byteLength) return false;
	let diff = 0;
	for (let i = 0; i < actual.byteLength; i++) {
		diff |= actual[i]! ^ expected[i]!;
	}
	return diff === 0;
}
