// Copyright The Open Forge contributors.

import { randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { chmod, copyFile, link, lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { SESSION_ARCHIVE_ERROR_CODES, SessionArchiveError, safePath } from "@vetta/runtime-storage/conversation";
import { mainT } from "../i18n/index.js";

export type ArchiveFileRestoreResult = "written" | "skipped" | "overwritten";

function hasCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

async function inspect(path: string): Promise<Stats | undefined> {
	try {
		return await lstat(path);
	} catch (error) {
		if (hasCode(error, "ENOENT")) return undefined;
		throw error;
	}
}

function unsafePath(): SessionArchiveError {
	return new SessionArchiveError(SESSION_ARCHIVE_ERROR_CODES.UNSAFE_PATH, mainT("sessionArchive.unsafeDestination"));
}

/** Check actual directories, not only the lexical path. Existing directory links are never followed. */
export async function ensureArchiveDirectory(path: string): Promise<void> {
	const existing = await inspect(path);
	if (existing) {
		if (existing.isSymbolicLink() || !existing.isDirectory()) throw unsafePath();
		return;
	}
	const parent = dirname(path);
	if (parent === path) throw unsafePath();
	await ensureArchiveDirectory(parent);
	try {
		await mkdir(path);
	} catch (error) {
		if (!hasCode(error, "EEXIST")) throw error;
	}
	const created = await lstat(path);
	if (created.isSymbolicLink() || !created.isDirectory()) throw unsafePath();
}

function restoreRelativePath(path: string): string {
	const relative = safePath(path);
	// Reject Windows aliases/alternate data streams even when an archive originated on POSIX.
	for (const part of relative.split("/")) {
		if (
			/[<>:"|?*\u0000-\u001f]/.test(part) ||
			/[. ]$/.test(part) ||
			/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)
		) {
			throw unsafePath();
		}
	}
	return relative;
}

async function ensureParents(root: string, relative: string): Promise<string> {
	await ensureArchiveDirectory(root);
	let parent = root;
	const parts = relative.split("/");
	for (const part of parts.slice(0, -1)) {
		parent = join(parent, part);
		await ensureArchiveDirectory(parent);
	}
	return join(parent, parts[parts.length - 1]!);
}

/**
 * Publish complete bytes using a sibling temporary file. Exclusive link is the no-clobber
 * commit; explicit overwrite uses rename, so hard-linked user files are not truncated.
 * Filesystems without hard links use exclusive copy (no crash-atomicity guarantee).
 * This protects ordinary filesystem conflicts, not hostile concurrent directory replacement.
 */
export async function restoreArchiveFile(
	root: string,
	relativePath: string,
	bytes: Uint8Array,
	overwrite = false,
): Promise<ArchiveFileRestoreResult> {
	const relative = restoreRelativePath(relativePath);
	const absoluteRoot = resolve(root);
	const target = await ensureParents(absoluteRoot, relative);
	const existing = await inspect(target);
	if (existing) {
		if (existing.isSymbolicLink() || !existing.isFile()) throw unsafePath();
		if (!overwrite) return "skipped";
	}
	const temporary = join(dirname(target), `.openforge-restore-${randomUUID()}.tmp`);
	try {
		await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
		await ensureParents(absoluteRoot, relative);
		const current = await inspect(target);
		if (current && (current.isSymbolicLink() || !current.isFile())) throw unsafePath();
		if (overwrite) {
			// Keep existing ordinary permissions (not setuid/setgid/sticky bits), including executable artifacts.
			if (current) await chmod(temporary, current.mode & 0o777);
			await rename(temporary, target);
			return current ? "overwritten" : "written";
		}
		try {
			try {
				await link(temporary, target);
			} catch (error) {
				if (!["ENOTSUP", "EOPNOTSUPP", "ENOSYS", "EPERM"].some((code) => hasCode(error, code))) throw error;
				await copyFile(temporary, target, constants.COPYFILE_EXCL);
			}
			return "written";
		} catch (error) {
			if (!hasCode(error, "EEXIST")) throw error;
			const conflict = await lstat(target);
			if (conflict.isSymbolicLink() || !conflict.isFile()) throw unsafePath();
			return "skipped";
		}
	} finally {
		await unlink(temporary).catch(() => undefined);
	}
}

/** Attachment bytes must agree with an existing file; a history import never authorizes overwriting it. */
export async function restoreArchiveAttachments(
	root: string,
	attachments: readonly { readonly relativePath: string; readonly bytes: Uint8Array }[],
): Promise<void> {
	for (const attachment of attachments) {
		const relative = restoreRelativePath(attachment.relativePath);
		const result = await restoreArchiveFile(root, relative, attachment.bytes);
		if (result === "skipped") {
			const existing = await readFile(join(root, relative));
			if (!existing.equals(attachment.bytes)) {
				throw new SessionArchiveError(
					SESSION_ARCHIVE_ERROR_CODES.INVALID_FRAME,
					mainT("sessionArchive.attachmentConflict"),
				);
			}
		}
	}
}
