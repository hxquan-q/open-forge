// Copyright The Open Forge contributors.
import { atom } from "jotai";
import {
	type ArchivedSessionsSnapshot,
	archivedSessionPaths,
	emptyArchivedSessions,
} from "../../../shared/archived-sessions";

/**
 * 归档快照由主进程持有，渲染进程只做缓存：首屏 IPC 拉一次，之后跟随广播刷新。
 * 未加载完时保持空快照——最坏情况是已归档的行先出现一瞬再消失，不会少显示任何会话。
 */
export const archivedSessionsAtom = atom<ArchivedSessionsSnapshot>(emptyArchivedSessions());

/** 侧边栏与列表过滤用的归档路径集合。 */
export const archivedSessionPathsAtom = atom<ReadonlySet<string>>((get) =>
	archivedSessionPaths(get(archivedSessionsAtom)),
);
