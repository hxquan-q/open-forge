import type { RuntimeSessionTaskState } from "@vetta/runtime-core/task";
import { atom } from "jotai";

export const EMPTY_TASK_STATE: RuntimeSessionTaskState = { tasks: [], artifacts: [] };

/**
 * 当前会话的 Task/Artifact 投影。
 * 由 Session 事件流（task.lifecycle / artifact.descriptor）增量折叠，
 * 会话打开时用主进程 getState 快照补齐；真相源在 Runtime 事件日志。
 */
export const taskStateBySessionAtom = atom<Map<string, RuntimeSessionTaskState>>(new Map());

export function getTaskStateForSession(
	map: Map<string, RuntimeSessionTaskState>,
	sessionId: string | null | undefined,
): RuntimeSessionTaskState {
	if (!sessionId) return EMPTY_TASK_STATE;
	return map.get(sessionId) ?? EMPTY_TASK_STATE;
}
