import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, renameSync, writeSync } from "node:fs";
import { mkdir, open, rename } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Atomically write a string to disk.
 *
 * Uses the standard write-temp → fsync → rename pattern. A crash, power loss,
 * or process kill at any point cannot leave a partial / corrupt target file:
 * either the rename has happened (new content) or it hasn't (old content).
 * The temporary file may be left behind on crash. The pid+sequence suffix
 * gives every write its own temp file: concurrent writers to the same target
 * (even within one process) must not share a temp path, or the first rename
 * moves the path out from under the second writer (rename ENOENT) and on
 * Windows the live second handle fails the first rename outright.
 *
 * The parent directory is created if it does not exist.
 */
let writeSequence = 0;

function nextTempPath(path: string): string {
	writeSequence += 1;
	return `${path}.${process.pid}.${writeSequence}.tmp`;
}

export function atomicWriteFile(path: string, data: string): void {
	const dir = dirname(path);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

	const tmpPath = nextTempPath(path);
	const fd = openSync(tmpPath, "w");
	try {
		writeSync(fd, data);
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
	renameSync(tmpPath, path);
}

/**
 * Atomically write a value as pretty-printed JSON.
 *
 * Convenience wrapper around atomicWriteFile for the common case of writing
 * a config / state file. Uses 2-space indentation to match existing config files.
 */
export function atomicWriteJSON(path: string, value: unknown): void {
	atomicWriteFile(path, JSON.stringify(value, null, 2));
}

/**
 * Same-process async writes to one target path queue behind each other: two
 * in-flight atomic writes to the same file cannot interleave their renames,
 * or one rename replaces the target while the other's temp path was already
 * moved (ENOENT) and on Windows the overlapping renames fail with EPERM —
 * the "file is busy/locked" rejections reported against Canvas writes.
 * Cross-process writers still rely on unique temp names plus the caller's
 * own coordination.
 */
const asyncWriteTails = new Map<string, Promise<void>>();

export function atomicWriteFileAsync(path: string, data: string): Promise<void> {
	const tail = asyncWriteTails.get(path) ?? Promise.resolve();
	const operation = tail.then(() => performAtomicWrite(path, data));
	const settled = operation.then(
		() => undefined,
		() => undefined,
	);
	asyncWriteTails.set(path, settled);
	void settled.then(() => {
		if (asyncWriteTails.get(path) === settled) asyncWriteTails.delete(path);
	});
	return operation;
}

async function performAtomicWrite(path: string, data: string): Promise<void> {
	const dir = dirname(path);
	await mkdir(dir, { recursive: true });

	const tmpPath = nextTempPath(path);
	const file = await open(tmpPath, "w");
	try {
		await file.writeFile(data);
		await file.sync();
	} finally {
		await file.close();
	}
	await rename(tmpPath, path);
}

export async function atomicWriteJSONAsync(path: string, value: unknown): Promise<void> {
	await atomicWriteFileAsync(path, JSON.stringify(value, null, 2));
}
