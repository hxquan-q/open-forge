// Modified by The Open Forge contributors.
import type { PinnedSessionPaths, SessionInfo } from "@shared/store/atoms";

export interface SidebarSessionOrdering<T extends SessionInfo = SessionInfo> {
	all: T[];
	hasMore: boolean;
	hiddenCount: number;
	visible: T[];
}

/**
 * 归档只收窄侧边栏可见性：归档中的会话整行消失，折叠计数随之减少，
 * 磁盘文件与命令面板搜索都不受影响（归档 ≠ 删除）。
 * 无归档时原样返回，保住上游 useMemo 的引用稳定。
 */
export function withoutArchivedSessions<T extends SessionInfo>(
	sessions: readonly T[],
	archivedPaths: ReadonlySet<string>,
): readonly T[] {
	if (archivedPaths.size === 0) return sessions;
	const kept = sessions.filter((session) => !archivedPaths.has(session.path));
	return kept.length === sessions.length ? sessions : kept;
}

export function orderSidebarSessions<T extends SessionInfo>(
	sessions: readonly T[],
	pinnedPaths: PinnedSessionPaths,
): T[] {
	return [...sessions].sort((left, right) => {
		const leftPinnedAt = pinnedPaths.get(left.path);
		const rightPinnedAt = pinnedPaths.get(right.path);
		if (leftPinnedAt !== undefined || rightPinnedAt !== undefined) {
			if (leftPinnedAt === undefined) return 1;
			if (rightPinnedAt === undefined) return -1;
			if (leftPinnedAt !== rightPinnedAt) return rightPinnedAt - leftPinnedAt;
		}
		return right.modifiedAt - left.modifiedAt;
	});
}

export function buildSidebarSessionOrdering<T extends SessionInfo>(
	sessions: readonly T[],
	pinnedPaths: PinnedSessionPaths,
	defaultVisibleCount: number,
	showAll: boolean,
): SidebarSessionOrdering<T> {
	const all = orderSidebarSessions(sessions, pinnedPaths);
	const pinnedCount = all.findIndex((session) => !pinnedPaths.has(session.path));
	const minimumVisible = pinnedCount === -1 ? all.length : pinnedCount;
	const collapsedCount = Math.max(defaultVisibleCount, minimumVisible);
	const visible = showAll ? all : all.slice(0, collapsedCount);
	return {
		all,
		hasMore: all.length > collapsedCount,
		hiddenCount: Math.max(0, all.length - visible.length),
		visible,
	};
}
