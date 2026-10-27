// Modified by The Open Forge contributors.
import type { RuntimeSessionAccess, SessionHistoryInfo } from "@vetta/runtime-core";

export interface DesktopSessionHistoryInfo extends SessionHistoryInfo {
	readonly access: RuntimeSessionAccess;
	/**
	 * 会话创建时固化的工作模式（ADR-0151 决策 6，来源 agent-modes.json）。
	 * 无记录的历史会话不带该字段，消费方按 work 口径处理。
	 */
	readonly agentMode?: string;
}

export type DesktopSessionOpenTarget = "interactive" | "viewer" | "unavailable";

export const UNAVAILABLE_RUNTIME_SESSION_ACCESS: RuntimeSessionAccess = {
	readHistory: false,
	resume: false,
	rename: false,
	delete: false,
};

export function resolveDesktopSessionOpenTarget(access: RuntimeSessionAccess): DesktopSessionOpenTarget {
	if (access.resume) return "interactive";
	if (access.readHistory) return "viewer";
	return "unavailable";
}
