// Modified by The Open Forge contributors.
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, renameSync, rmSync, writeSync } from "node:fs";
import { type FileHandle, mkdir, open, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

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
	let failure: { error: unknown } | undefined;
	try {
		writeAllSync(fd, data);
		fsyncSync(fd);
	} catch (error) {
		failure = { error };
	} finally {
		try {
			closeSync(fd);
		} catch (error) {
			// 只有关闭先成功、写入/同步也没失败时它才是首个错误；否则保留原失败。
			failure ??= { error };
		}
	}
	if (failure) {
		// 受控失败不提交目标：尽力清理本次 tmp，清理错误不能盖过首个失败。
		try {
			rmSync(tmpPath, { force: true });
		} catch {
			/* Preserve the first failure. */
		}
		throw failure.error;
	}
	renameWithRetry(tmpPath, path);
}

/** 同步写满全部字节；零进度视为 I/O 故障而不是无限循环。 */
function writeAllSync(fd: number, data: string): void {
	const buffer = Buffer.from(data, "utf8");
	for (let offset = 0; offset < buffer.length; ) {
		const written = writeSync(fd, buffer, offset, buffer.length - offset);
		if (written <= 0) {
			throw Object.assign(new Error(`atomic write stalled at byte ${offset} of ${buffer.length}`), { code: "EIO" });
		}
		offset += written;
	}
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
	let failure: { error: unknown } | undefined;
	try {
		await writeAllAsync(file, data);
		await file.sync();
	} catch (error) {
		failure = { error };
	} finally {
		try {
			await file.close();
		} catch (error) {
			failure ??= { error };
		}
	}
	if (failure) {
		await rm(tmpPath, { force: true }).catch(() => undefined);
		throw failure.error;
	}
	await renameWithRetryAsync(tmpPath, path);
}

/** 异步写满全部字节；零进度视为 I/O 故障而不是无限循环。 */
async function writeAllAsync(file: FileHandle, data: string): Promise<void> {
	const buffer = Buffer.from(data, "utf8");
	for (let offset = 0; offset < buffer.length; ) {
		const { bytesWritten } = await file.write(buffer, offset, buffer.length - offset);
		if (bytesWritten <= 0) {
			throw Object.assign(new Error(`atomic write stalled at byte ${offset} of ${buffer.length}`), { code: "EIO" });
		}
		offset += bytesWritten;
	}
}

export async function atomicWriteJSONAsync(path: string, value: unknown): Promise<void> {
	await atomicWriteFileAsync(path, JSON.stringify(value, null, 2));
}

const RETRYABLE_RENAME_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);
const SYNC_RENAME_ATTEMPTS = 10;
const ASYNC_RENAME_ATTEMPTS = 30;

function isRetryableRename(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		typeof error.code === "string" &&
		RETRYABLE_RENAME_CODES.has(error.code)
	);
}

function renameBackoff(attempt: number): number {
	return Math.min(attempt * 10, 100);
}

/** Retry transient reader/indexer locks without deleting the existing destination. */
function renameWithRetry(from: string, to: string): void {
	for (let attempt = 1; ; attempt++) {
		try {
			renameSync(from, to);
			return;
		} catch (error) {
			if (!isRetryableRename(error) || attempt >= SYNC_RENAME_ATTEMPTS) {
				// Cleanup is best-effort: a second I/O failure must not hide the write failure.
				try {
					rmSync(from, { force: true });
				} catch {
					/* Preserve the original error. */
				}
				throw error;
			}
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, renameBackoff(attempt));
		}
	}
}

async function renameWithRetryAsync(from: string, to: string): Promise<void> {
	for (let attempt = 1; ; attempt++) {
		try {
			await rename(from, to);
			return;
		} catch (error) {
			if (!isRetryableRename(error) || attempt >= ASYNC_RENAME_ATTEMPTS) {
				await rm(from, { force: true }).catch(() => undefined);
				throw error;
			}
			await delay(renameBackoff(attempt));
		}
	}
}
