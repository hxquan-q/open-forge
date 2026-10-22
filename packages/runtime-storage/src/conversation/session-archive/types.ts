/** Open Forge portable session archive (clean-room format; not wire-compatible with third-party tools). */

export const SESSION_ARCHIVE_MAGIC = new Uint8Array([0x4f, 0x46, 0x41, 0x52, 0x0d, 0x0a, 0x1a, 0x0a]); // OFAR\r\n\x1a\n
export const SESSION_ARCHIVE_FORMAT = "openforge-session-archive" as const;
/** 当前写入的归档版本；无 workspace 输入时仍写 v1（字节与历史 v1 完全一致）。 */
export const SESSION_ARCHIVE_FORMAT_VERSION = 2 as const;
/** 解码器接受的版本集合；v1 是纯会话归档，v2 附带项目 workspace 帧。 */
export type SessionArchiveFormatVersion = 1 | 2;
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
	/** Archive-level workspace file (v2 migration): same layout as ATTACHMENT, meta has no id/mimeType. */
	WORKSPACE_FILE: 0x04,
} as const;

export type SessionArchiveFrameKind = (typeof SESSION_ARCHIVE_FRAME)[keyof typeof SESSION_ARCHIVE_FRAME];

export interface SessionArchiveFileMetadata {
	readonly format: typeof SESSION_ARCHIVE_FORMAT;
	readonly formatVersion: SessionArchiveFormatVersion;
	readonly cipher: typeof SESSION_ARCHIVE_CIPHER;
	readonly kdf: typeof SESSION_ARCHIVE_KDF;
	readonly appVersion: string;
	readonly sessionCount: number;
	readonly createdAt: string;
	/** v2 迁移包：导出时的项目根（cwd），导入侧据此重写会话头记录。 */
	readonly sourceCwd?: string;
	/** v2 迁移包：workspace 帧数；声明存在时解码侧校验与帧数一致。 */
	readonly workspaceFileCount?: number;
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

/** v2 迁移包的单个 workspace 文件（编码侧输入）。 */
export interface SessionArchiveWorkspaceFileInput {
	readonly relativePath: string;
	readonly bytes: Uint8Array;
}

/** v2 迁移包的单个 workspace 文件（解码侧输出）。 */
export interface SessionArchiveWorkspaceFileDecoded {
	readonly relativePath: string;
	readonly bytes: Uint8Array;
}

/** v2 迁移包的项目文件树（编码侧输入）；`files` 可为空（仍写 v2，语义是「迁移包」）。 */
export interface SessionArchiveWorkspaceInput {
	readonly sourceCwd: string;
	readonly files: readonly SessionArchiveWorkspaceFileInput[];
}

/** v2 迁移包的项目文件树（解码侧输出）；`sourceCwd` 缺失时导入侧不重写 cwd。 */
export interface SessionArchiveWorkspaceDecoded {
	readonly sourceCwd?: string;
	readonly files: readonly SessionArchiveWorkspaceFileDecoded[];
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
	/** 提供即写 v2 迁移包；省略时写 v1（与历史字节完全一致）。 */
	readonly workspace?: SessionArchiveWorkspaceInput;
	readonly createdAt?: string;
	readonly randomBytes?: (size: number) => Uint8Array;
}

export interface SessionArchiveDecodeResult {
	readonly metadata: SessionArchiveFileMetadata;
	readonly sessions: readonly SessionArchiveDecodedSession[];
	/** 仅 v2 迁移包存在；v1 归档恒为 undefined。 */
	readonly workspace?: SessionArchiveWorkspaceDecoded;
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
