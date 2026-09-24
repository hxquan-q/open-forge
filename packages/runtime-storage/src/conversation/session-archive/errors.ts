import { CONVERSATION_STORAGE_ERROR_CODES, ConversationStorageError } from "../errors.js";

export const SESSION_ARCHIVE_ERROR_CODES = {
	INVALID_MAGIC: "session_archive_invalid_magic",
	UNSUPPORTED_VERSION: "session_archive_unsupported_version",
	CORRUPT_HEADER: "session_archive_corrupt_header",
	AUTH_FAILED: "session_archive_auth_failed",
	DECOMPRESS_FAILED: "session_archive_decompress_failed",
	INVALID_FRAME: "session_archive_invalid_frame",
	UNSAFE_PATH: "session_archive_unsafe_path",
} as const;

export type SessionArchiveErrorCode = (typeof SESSION_ARCHIVE_ERROR_CODES)[keyof typeof SESSION_ARCHIVE_ERROR_CODES];

const CODE_TO_STORAGE: Record<
	SessionArchiveErrorCode,
	(typeof CONVERSATION_STORAGE_ERROR_CODES)[keyof typeof CONVERSATION_STORAGE_ERROR_CODES]
> = {
	[SESSION_ARCHIVE_ERROR_CODES.INVALID_MAGIC]: CONVERSATION_STORAGE_ERROR_CODES.CORRUPT,
	[SESSION_ARCHIVE_ERROR_CODES.UNSUPPORTED_VERSION]: CONVERSATION_STORAGE_ERROR_CODES.CORRUPT,
	[SESSION_ARCHIVE_ERROR_CODES.CORRUPT_HEADER]: CONVERSATION_STORAGE_ERROR_CODES.CORRUPT,
	[SESSION_ARCHIVE_ERROR_CODES.AUTH_FAILED]: CONVERSATION_STORAGE_ERROR_CODES.CORRUPT,
	[SESSION_ARCHIVE_ERROR_CODES.DECOMPRESS_FAILED]: CONVERSATION_STORAGE_ERROR_CODES.CORRUPT,
	[SESSION_ARCHIVE_ERROR_CODES.INVALID_FRAME]: CONVERSATION_STORAGE_ERROR_CODES.CORRUPT,
	[SESSION_ARCHIVE_ERROR_CODES.UNSAFE_PATH]: CONVERSATION_STORAGE_ERROR_CODES.INVALID_COMMAND,
};

export class SessionArchiveError extends ConversationStorageError {
	readonly archiveCode: SessionArchiveErrorCode;

	constructor(archiveCode: SessionArchiveErrorCode, message: string, options?: ErrorOptions) {
		super(CODE_TO_STORAGE[archiveCode], message, options);
		this.name = "SessionArchiveError";
		this.archiveCode = archiveCode;
	}
}
