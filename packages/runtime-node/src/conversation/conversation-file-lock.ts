import { randomUUID } from "node:crypto";
import type { FileHandle } from "node:fs/promises";
import { open, readFile, rm, stat, utimes } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { CONVERSATION_STORAGE_ERROR_CODES, ConversationStorageError } from "@vetta/runtime-storage/conversation";
import { nodeErrorCode } from "./node-error-code.js";

const FILE_LOCK_RETRY_COUNT = 60;
const FILE_LOCK_RETRY_DELAY_MS = 10;
const FILE_LOCK_MAX_RETRY_DELAY_MS = 100;
const FILE_LOCK_STALE_MS = 5 * 60 * 1000;
/**
 * 持锁期间周期性刷新 lockfile mtime——stale 判定只看 mtime，不刷新会让任何
 * 持锁超 FILE_LOCK_STALE_MS 的合法操作被竞争者误判残留、抢删锁文件，锁形同虚设。
 * 取值远低于 stale 阈值，崩溃持有者的心跳随进程一起停，不影响 stale 兜底。
 */
const FILE_LOCK_HEARTBEAT_MS = 60 * 1000;

/**
 * 锁策略可注入项——生产调用方全部走缺省；测试以小值确定性覆盖
 * 心跳/退避/超时路径，不依赖假时钟或整秒等待。
 */
export interface ConversationFileLockOptions {
	readonly retryCount?: number;
	readonly retryDelayMs?: number;
	readonly maxRetryDelayMs?: number;
	readonly staleMs?: number;
	readonly heartbeatMs?: number;
}

/**
 * 第 attempt 次重试前的等待——指数退避到 maxRetryDelayMs 封顶。
 * 恒定 10ms 的旧策略总预算 ≈1s，跨实例（双安装/CLI 并行）短持锁竞争下必然超时；
 * 退避后 60 次尝试预算 ≈5.7s，同时让开短持锁间隙。
 */
export function conversationFileLockRetryDelayMs(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
	return Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
}

/** 锁文件内容：`token\npid\nisoTime`。release 只校验首行 token，旧版纯 token 文件兼容。 */
function lockFileContent(token: string): string {
	return `${token}\n${process.pid}\n${new Date().toISOString()}`;
}

function lockTokenOf(content: string): string {
	return content.split("\n", 1)[0];
}

/** 把锁文件内容翻译成人读的持有者描述；读不出按「他进程持有」降级。 */
async function describeLockHolder(path: string): Promise<string> {
	try {
		const content = await readFile(path, "utf8");
		const [, pid, acquiredAt] = content.split("\n");
		if (pid && /^\d+$/.test(pid) && acquiredAt) {
			return ` (lock held by pid ${pid} since ${acquiredAt})`;
		}
		return " (lock held by another process)";
	} catch (error) {
		if (nodeErrorCode(error) === "ENOENT") return " (lock released before timeout)";
		return " (lock holder unreadable)";
	}
}

export async function acquireConversationFileLock(
	path: string,
	sessionId: string,
	options: ConversationFileLockOptions = {},
): Promise<() => Promise<void>> {
	const retryCount = options.retryCount ?? FILE_LOCK_RETRY_COUNT;
	const retryDelayMs = options.retryDelayMs ?? FILE_LOCK_RETRY_DELAY_MS;
	const maxRetryDelayMs = options.maxRetryDelayMs ?? FILE_LOCK_MAX_RETRY_DELAY_MS;
	const staleMs = options.staleMs ?? FILE_LOCK_STALE_MS;
	const heartbeatMs = options.heartbeatMs ?? FILE_LOCK_HEARTBEAT_MS;

	const token = randomUUID();
	for (let attempt = 0; attempt < retryCount; attempt += 1) {
		let handle: FileHandle | undefined;
		try {
			handle = await open(path, "wx");
			await handle.writeFile(lockFileContent(token), "utf8");
			await handle.close();
			handle = undefined;
			const heartbeat = setInterval(() => {
				void (async () => {
					try {
						if (lockTokenOf(await readFile(path, "utf8")) === token) {
							const now = new Date();
							await utimes(path, now, now);
						}
					} catch {
						// 心跳是尽力而为：锁文件被删/被抢时静默，不影响正常释放路径。
					}
				})();
			}, heartbeatMs);
			heartbeat.unref();
			return async () => {
				clearInterval(heartbeat);
				try {
					if (lockTokenOf(await readFile(path, "utf8")) === token) await rm(path, { force: true });
				} catch (error) {
					if (nodeErrorCode(error) !== "ENOENT") throw error;
				}
			};
		} catch (error) {
			await handle?.close();
			if (nodeErrorCode(error) !== "EEXIST") throw error;
			if (await isStaleLock(path, staleMs)) {
				await rm(path, { force: true });
				continue;
			}
			await delay(conversationFileLockRetryDelayMs(attempt, retryDelayMs, maxRetryDelayMs));
		}
	}
	const holder = await describeLockHolder(path);
	throw new ConversationStorageError(
		CONVERSATION_STORAGE_ERROR_CODES.WRITE_LOCK_TIMEOUT,
		`Timed out acquiring conversation file lock: ${sessionId}${holder}`,
	);
}

async function isStaleLock(path: string, staleMs: number): Promise<boolean> {
	try {
		return Date.now() - (await stat(path)).mtimeMs >= staleMs;
	} catch (error) {
		if (nodeErrorCode(error) === "ENOENT") return false;
		throw error;
	}
}
