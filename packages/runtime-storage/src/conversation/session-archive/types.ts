/** Open Forge portable session archive (clean-room format; not wire-compatible with third-party tools). */

export const SESSION_ARCHIVE_MAGIC = new Uint8Array([0x4f, 0x46, 0x41, 0x52, 0x0d, 0x0a, 0x1a, 0x0a]); // OFAR\r\n\x1a\n
export const SESSION_ARCHIVE_FORMAT = "openforge-session-archive" as const;
export const SESSION_ARCHIVE_FORMAT_VERSION = 1 as const;
export const SESSION_ARCHIVE_CIPHER = "aes-256-gcm" as const;
export const SESSION_ARCHIVE_KDF = "scrypt" as const;

/** Fixed-frame record kinds inside the gzip payload. */
export const SESSION_ARCHIVE_FRAME = {
	/** UTF-8 JSON object describing one session (identity + metadata). */
	SESSION: 0x01,
	/** UTF-8 JSON conversation record / message entry. */
	RECORD: 0x02,
	/** Binary attachment: meta length + meta JSON + raw bytes (never stringified). */
	ATTACHMENT: 0x03,
} as const;

export type SessionArchiveFrameKind = (typeof SESSION_ARCHIVE_FRAME)[keyof typeof SESSION_ARCHIVE_FRAME];

export interface SessionArchiveFileMetadata {
	readonly format: typeof SESSION_ARCHIVE_FORMAT;
	readonly formatVersion: typeof SESSION_ARCHIVE_FORMAT_VERSION;
	readonly cipher: typeof SESSION_ARCHIVE_CIPHER;
	readonly kdf: typeof SESSION_ARCHIVE_KDF;
	readonly appVersion: string;
	readonly sessionCount: number;
	readonly createdAt: string;
	readonly scrypt: {
		readonly N: number;
		readonly r: number;
		readonly p: number;
		readonly dkLen: number;
		readonly saltLength: number;
	};
}

export interface SessionArchiveSessionPayload {
	readonly sessionId: string;
	readonly conversationId?: string;
	readonly name?: string;
	readonly cwd?: string;
	readonly createdAt?: string;
	readonly fingerprintSource: unknown;
	readonly records: readonly unknown[];
	readonly attachments?: readonly SessionArchiveAttachmentInput[];
}

export interface SessionArchiveAttachmentInput {
	readonly id: string;
	readonly relativePath: string;
	readonly mimeType?: string;
	readonly bytes: Uint8Array;
}

export interface SessionArchiveAttachmentDecoded {
	readonly id: string;
	readonly relativePath: string;
	readonly mimeType?: string;
	readonly bytes: Uint8Array;
}

export interface SessionArchiveDecodedSession {
	readonly sessionId: string;
	readonly conversationId?: string;
	readonly name?: string;
	readonly cwd?: string;
	readonly createdAt?: string;
	readonly fingerprint: string;
	readonly records: readonly unknown[];
	readonly attachments: readonly SessionArchiveAttachmentDecoded[];
}

export interface SessionArchiveEncodeInput {
	readonly appVersion: string;
	readonly passphrase: string;
	readonly sessions: readonly SessionArchiveSessionPayload[];
	readonly createdAt?: string;
	readonly randomBytes?: (size: number) => Uint8Array;
}

export interface SessionArchiveDecodeResult {
	readonly metadata: SessionArchiveFileMetadata;
	readonly sessions: readonly SessionArchiveDecodedSession[];
}

export type SessionArchiveImportAction = "skip-idempotent" | "create-copy" | "overwrite";

export interface SessionArchiveImportConflictInput {
	readonly existingFingerprint: string;
	readonly incomingFingerprint: string;
	/** File mtime milliseconds — hint only, never decides the winner. */
	readonly existingMtimeMs?: number;
	readonly incomingMtimeMs?: number;
	readonly preferOverwrite?: boolean;
}

export interface SessionArchiveImportConflictResult {
	readonly action: SessionArchiveImportAction;
	readonly reason: "fingerprint-match" | "default-create-copy" | "explicit-overwrite";
	readonly mtimeHint?: "incoming-newer" | "existing-newer" | "equal" | "unavailable";
}
