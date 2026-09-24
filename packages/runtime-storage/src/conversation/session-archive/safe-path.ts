import { SESSION_ARCHIVE_ERROR_CODES, SessionArchiveError } from "./errors.js";

export interface SafePathOptions {
	/**
	 * Called with the path built so far (posix-joined). When true, the path is
	 * rejected as a symlink escape. Hosts with filesystem access should supply this.
	 */
	readonly isSymbolicLink?: (joinedPath: string) => boolean;
}

/**
 * Normalize a relative archive path: reject `..`, empty segments, absolute roots,
 * and optional symlink components. Returns a posix-joined relative path.
 */
export function safePath(input: string, options?: SafePathOptions): string {
	if (typeof input !== "string" || input.length === 0) {
		throw new SessionArchiveError(SESSION_ARCHIVE_ERROR_CODES.UNSAFE_PATH, "Archive path must be a non-empty string");
	}
	if (input.includes("\0")) {
		throw new SessionArchiveError(SESSION_ARCHIVE_ERROR_CODES.UNSAFE_PATH, "Archive path must not contain NUL");
	}

	const trimmed = input.replaceAll("\\", "/");
	if (trimmed.startsWith("/") || /^[a-zA-Z]:\//.test(trimmed) || trimmed.startsWith("//")) {
		throw new SessionArchiveError(
			SESSION_ARCHIVE_ERROR_CODES.UNSAFE_PATH,
			`Absolute archive path rejected: ${input}`,
		);
	}

	const parts = trimmed.split("/").filter((part) => part.length > 0);
	if (parts.length === 0) {
		throw new SessionArchiveError(SESSION_ARCHIVE_ERROR_CODES.UNSAFE_PATH, `Empty archive path rejected: ${input}`);
	}

	const safe: string[] = [];
	for (const part of parts) {
		if (part === "." || part === "..") {
			throw new SessionArchiveError(
				SESSION_ARCHIVE_ERROR_CODES.UNSAFE_PATH,
				`Archive path segment rejected: ${part}`,
			);
		}
		if (part.includes(":") && /^[a-zA-Z]:$/.test(part)) {
			throw new SessionArchiveError(SESSION_ARCHIVE_ERROR_CODES.UNSAFE_PATH, `Drive segment rejected: ${part}`);
		}
		safe.push(part);
		const joined = safe.join("/");
		if (options?.isSymbolicLink?.(joined)) {
			throw new SessionArchiveError(
				SESSION_ARCHIVE_ERROR_CODES.UNSAFE_PATH,
				`Symlink escape rejected at: ${joined}`,
			);
		}
	}

	return safe.join("/");
}
