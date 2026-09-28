// Copyright The Open Forge contributors.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getVettaHomePath } from "@vetta/action-rpc";
import { atomicWriteJSON } from "@vetta/toolkit/atomic-write";
import {
	type ArchivedSessionsSnapshot,
	archiveSession as archiveSessionModel,
	emptyArchivedSessions,
	parseArchivedSessionsFile,
	removeArchivedSessions as removeArchivedSessionsModel,
	serializeArchivedSessions,
	unarchiveSession as unarchiveSessionModel,
} from "../../shared/archived-sessions.js";

/**
 * 会话归档仓库：~/.vetta/desktop-app/archived-sessions.json 的单一写者。
 *
 * 启动读一次进内存，之后所有变更改内存再原子落盘，永不重新读盘——
 * 写入是同步的且中间没有 await，因此「读-改-写」不存在交错窗口。
 */

const DEFAULT_PATH = join(getVettaHomePath(), "desktop-app", "archived-sessions.json");

export function defaultArchivedSessionsPath(): string {
	return DEFAULT_PATH;
}

let cache: ArchivedSessionsSnapshot | null = null;
let cachePath = DEFAULT_PATH;
const listeners = new Set<(snapshot: ArchivedSessionsSnapshot) => void>();

function read(filePath: string): ArchivedSessionsSnapshot {
	if (!existsSync(filePath)) return emptyArchivedSessions();
	try {
		return parseArchivedSessionsFile(JSON.parse(readFileSync(filePath, "utf-8")) as unknown);
	} catch {
		return emptyArchivedSessions();
	}
}

function snapshot(filePath: string): ArchivedSessionsSnapshot {
	if (cache === null || cachePath !== filePath) {
		cachePath = filePath;
		cache = read(filePath);
	}
	return cache;
}

function commit(filePath: string, next: ArchivedSessionsSnapshot): ArchivedSessionsSnapshot {
	const current = snapshot(filePath);
	if (next === current) return current;
	cache = next;
	try {
		atomicWriteJSON(filePath, serializeArchivedSessions(next));
	} catch {
		// 落盘失败时保留内存态，避免界面回滚到旧值；下一次变更会重试写入。
	}
	for (const listener of listeners) listener(next);
	return next;
}

export function onArchivedSessionsChanged(listener: (snapshot: ArchivedSessionsSnapshot) => void): () => void {
	listeners.add(listener);
	return () => void listeners.delete(listener);
}

export function listArchivedSessions(filePath = DEFAULT_PATH): ArchivedSessionsSnapshot {
	return snapshot(filePath);
}

export interface ArchiveSessionRequest {
	path: string;
	label?: string;
	cwd?: string;
	/** 团队会话的身份（可选）；设置页据此走团队级删除。 */
	teamId?: string;
	teamSessionId?: string;
	/** 仅供测试注入固定时钟；缺省取当前时间。 */
	archivedAt?: number;
}

export function archiveSession(input: ArchiveSessionRequest, filePath = DEFAULT_PATH): ArchivedSessionsSnapshot {
	const current = snapshot(filePath);
	return commit(
		filePath,
		archiveSessionModel(current, {
			path: input.path,
			label: input.label,
			cwd: input.cwd,
			teamId: input.teamId,
			teamSessionId: input.teamSessionId,
			archivedAt: input.archivedAt ?? nextArchivedAt(current),
		}),
	);
}

/** 时钟不前进时仍保证新归档排在最前，和标签采用同样的单调处理。 */
function nextArchivedAt(current: ArchivedSessionsSnapshot): number {
	let latest = 0;
	for (const entry of current.sessions) latest = Math.max(latest, entry.archivedAt);
	return Math.max(Date.now(), latest + 1);
}

export function unarchiveSession(sessionPath: string, filePath = DEFAULT_PATH): ArchivedSessionsSnapshot {
	return commit(filePath, unarchiveSessionModel(snapshot(filePath), sessionPath));
}

export function forgetArchivedSessions(
	sessionPaths: readonly string[],
	filePath = DEFAULT_PATH,
): ArchivedSessionsSnapshot {
	return commit(filePath, removeArchivedSessionsModel(snapshot(filePath), sessionPaths));
}

/** 仅供测试：丢弃内存缓存，下次访问重新读盘。 */
export function resetArchivedSessionsCache(): void {
	cache = null;
	cachePath = DEFAULT_PATH;
}
