// Copyright The Open Forge contributors.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, posix, relative, resolve, sep } from "node:path";
import AdmZip from "adm-zip";

const DEFAULT_MAX_ARCHIVE_ENTRIES = 10_000;
const DEFAULT_MAX_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;
/** Unix `S_IFLNK` mode bits stored in the ZIP external attributes high word. */
const UNIX_SYMLINK_MODE = 0o120000;

export interface SafeZipExtractOptions {
	/** Maximum number of ZIP entries allowed (directories and files). */
	maxEntries?: number;
	/** Maximum total declared uncompressed bytes across all entries. */
	maxUncompressedBytes?: number;
}

export class UnsafeZipArchiveError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UnsafeZipArchiveError";
	}
}

export function isPathContained(parent: string, target: string): boolean {
	const pathFromParent = relative(parent, target);
	return (
		pathFromParent === "" ||
		(!pathFromParent.startsWith(`..${sep}`) && pathFromParent !== ".." && !isAbsolute(pathFromParent))
	);
}

/**
 * Normalize a ZIP entry name into a destination-relative POSIX path.
 * Rejects absolute paths, Windows drive letters, null bytes, and `..` traversal.
 */
export function normalizeZipEntryPath(entryName: string, label = "archive entry"): string {
	const slashPath = entryName.replace(/\\/g, "/");
	if (!slashPath || slashPath.includes("\0") || slashPath.startsWith("/") || /^[a-zA-Z]:\//.test(slashPath)) {
		throw new UnsafeZipArchiveError(`Unsafe ${label}: ${entryName}`);
	}
	const normalized = posix.normalize(slashPath).replace(/\/$/, "");
	if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
		throw new UnsafeZipArchiveError(`Unsafe ${label}: ${entryName}`);
	}
	return normalized;
}

export function assertSafeZipEntryAttributes(entry: {
	entryName: string;
	attr: number;
	header: { flags: number };
}): void {
	if ((entry.header.flags & 1) !== 0) {
		throw new UnsafeZipArchiveError("Encrypted archive entries are not supported");
	}
	const unixType = (entry.attr >>> 16) & 0o170000;
	if (unixType === UNIX_SYMLINK_MODE) {
		throw new UnsafeZipArchiveError(`Symlink archive entries are not allowed: ${entry.entryName}`);
	}
}

/**
 * Extract a ZIP archive into `targetDir` with Zip Slip and symlink defenses.
 * Writes files with exclusive create (`wx`) so an entry cannot overwrite a
 * previously-extracted path that was turned into a symlink by a concurrent attacker.
 */
export async function extractZipArchiveSafely(
	buffer: Buffer,
	targetDir: string,
	options: SafeZipExtractOptions = {},
): Promise<void> {
	const maxEntries = options.maxEntries ?? DEFAULT_MAX_ARCHIVE_ENTRIES;
	const maxUncompressedBytes = options.maxUncompressedBytes ?? DEFAULT_MAX_UNCOMPRESSED_BYTES;
	const archive = new AdmZip(buffer);
	const entries = archive.getEntries();
	if (entries.length > maxEntries) {
		throw new UnsafeZipArchiveError("Archive has too many entries");
	}

	let uncompressedBytes = 0;
	const seenPaths = new Set<string>();
	const targetRoot = resolve(targetDir);

	for (const entry of entries) {
		uncompressedBytes += entry.header.size;
		if (uncompressedBytes > maxUncompressedBytes) {
			throw new UnsafeZipArchiveError("Archive expands beyond the size limit");
		}
		assertSafeZipEntryAttributes(entry);
		const entryPath = normalizeZipEntryPath(entry.entryName);
		if (seenPaths.has(entryPath)) {
			throw new UnsafeZipArchiveError(`Duplicate archive entry: ${entry.entryName}`);
		}
		seenPaths.add(entryPath);
		const destination = resolve(targetRoot, entryPath);
		if (!isPathContained(targetRoot, destination)) {
			throw new UnsafeZipArchiveError(`Unsafe archive path: ${entry.entryName}`);
		}
		if (entry.isDirectory) {
			await mkdir(destination, { recursive: true });
			continue;
		}
		await mkdir(dirname(destination), { recursive: true });
		await writeFile(destination, entry.getData(), { flag: "wx" });
	}
}
