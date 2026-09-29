// Copyright The Open Forge contributors.
/**
 * 启动时的「异常中断会话」扫描器：找出上次退出时回复未正常完成的会话。
 *
 * 判定口径与重开收敛共用同一个 `FailInterruptedTurnRecoveryPolicy`（经
 * `assessConversationInterruption` 注入），扫描全程只读：不写 jsonl、不产生
 * 锁文件、不触发 resume 收敛。所有 I/O 经端口注入，逐项 fail-soft。
 */

/** 扫描候选：来自会话目录列举（已过 team 会话过滤）。 */
export interface InterruptedStartupCandidate {
	readonly sessionId: string;
	readonly sessionPath: string;
	readonly cwd: string;
	readonly name?: string;
	readonly modifiedAt: number;
}

/** 一个被判定为「上次退出时未正常完成」的会话。 */
export interface InterruptedStartupSession {
	readonly sessionId: string;
	readonly sessionPath: string;
	readonly cwd: string;
	readonly name?: string;
	/** 存在未闭合 Turn（崩溃/强退在回复中途）。 */
	readonly turnInterrupted: boolean;
	/** 队列 sidecar 中仍未发出的条目数。 */
	readonly queuedCount: number;
}

export interface SessionInterruptStartupScanPorts {
	readonly listCandidates: () => Promise<readonly InterruptedStartupCandidate[]>;
	/** 只读评估未闭合 Turn；实现见 runtime-node `assessConversationInterruption`。 */
	readonly assessTurn: (sessionId: string, sessionPath: string) => Promise<"interrupted" | "ready" | "unreadable">;
	/** 读队列 sidecar 原始快照；文件缺失/损坏由本扫描按 0 条处理。 */
	readonly readQueueSnapshot: (sessionPath: string) => Promise<unknown>;
	readonly nowMs: () => number;
	/** 扫描候选数上限（按 modifiedAt 倒序取头部），默认 {@link STARTUP_SCAN_MAX_CANDIDATES}。 */
	readonly maxCandidates?: number;
	/** 只扫描最近窗口内修改过的会话，默认 {@link STARTUP_SCAN_RECENT_WINDOW_MS}。 */
	readonly recentWindowMs?: number;
}

export const STARTUP_SCAN_MAX_CANDIDATES = 20;
export const STARTUP_SCAN_RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** sidecar 快照是不可信边界：结构不符一律按 0 条，不让坏数据影响报告。 */
export function readQueuedEntryCount(snapshot: unknown): number {
	if (typeof snapshot !== "object" || snapshot === null) return 0;
	const entries = (snapshot as { entries?: unknown }).entries;
	return Array.isArray(entries) ? entries.length : 0;
}

export async function scanInterruptedSessionsOnStartup(
	ports: SessionInterruptStartupScanPorts,
): Promise<InterruptedStartupSession[]> {
	const now = ports.nowMs();
	const windowMs = ports.recentWindowMs ?? STARTUP_SCAN_RECENT_WINDOW_MS;
	const maxCandidates = ports.maxCandidates ?? STARTUP_SCAN_MAX_CANDIDATES;

	const candidates = (await ports.listCandidates())
		.filter((candidate) => now - candidate.modifiedAt <= windowMs)
		.sort((a, b) => b.modifiedAt - a.modifiedAt)
		.slice(0, Math.max(1, maxCandidates));

	const interrupted: InterruptedStartupSession[] = [];
	for (const candidate of candidates) {
		// 单个候选的任何失败都不影响其余候选：损坏文件、远端不可读、sidecar 损坏。
		let turnInterrupted = false;
		try {
			turnInterrupted = (await ports.assessTurn(candidate.sessionId, candidate.sessionPath)) === "interrupted";
		} catch {
			turnInterrupted = false;
		}
		let queuedCount = 0;
		try {
			queuedCount = readQueuedEntryCount(await ports.readQueueSnapshot(candidate.sessionPath));
		} catch {
			queuedCount = 0;
		}
		if (!turnInterrupted && queuedCount === 0) continue;
		interrupted.push({
			sessionId: candidate.sessionId,
			sessionPath: candidate.sessionPath,
			cwd: candidate.cwd,
			...(candidate.name !== undefined ? { name: candidate.name } : {}),
			turnInterrupted,
			queuedCount,
		});
	}
	return interrupted;
}
