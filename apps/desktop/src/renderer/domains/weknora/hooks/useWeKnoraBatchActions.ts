// Copyright The Open Forge contributors.

import { useCallback, useState } from "react";
import type { WeKnoraErrorCode } from "../atoms";
import type { WeKnoraSessionRemoval } from "./useWeKnoraHistory";

/** 批量删除里单个会话的失败明细（D5：名 + 错误由调用方按 id 补全）。 */
export interface WeKnoraBatchDeleteFailure {
	readonly sessionId: string;
	readonly errorCode: WeKnoraErrorCode;
}

/** 批量删除的聚合结果（D5：部分失败如实报，绝不假装成功）。 */
export interface WeKnoraBatchDeleteResult {
	readonly succeeded: readonly string[];
	readonly failed: readonly WeKnoraBatchDeleteFailure[];
}

export interface WeKnoraBatchActions {
	/** 批量删除进行中（驱动确认按钮防重复）。 */
	readonly running: boolean;
	/** 逐个调用删除原语，聚合成功 / 失败明细（D5）。 */
	readonly deleteSessions: (sessionIds: readonly string[]) => Promise<WeKnoraBatchDeleteResult>;
}

/**
 * 历史会话的批量动作编排（T04：仅批量删除；批量导出 T05 接入）。
 *
 * 复用 `removeSession` 逐会话原语**串行**循环——不并发（避免同一时刻多条删除把
 * `deletingSessionId` / `deleteError` 反复覆写），不乐观改列表；每个会话的结果
 * 聚合成「成功 N / 失败 M（会话 id + 错误码）」，失败绝不静默（D5）。
 * 「当前会话回空态」与「列表重拉」属跨 actor 编排，留在组装层（`useWeKnoraModel`）。
 */
export function useWeKnoraBatchActions(input: {
	removeSession: (sessionId: string) => Promise<WeKnoraSessionRemoval>;
}): WeKnoraBatchActions {
	const { removeSession } = input;
	const [running, setRunning] = useState(false);

	const deleteSessions = useCallback(
		async (sessionIds: readonly string[]): Promise<WeKnoraBatchDeleteResult> => {
			setRunning(true);
			const succeeded: string[] = [];
			const failed: WeKnoraBatchDeleteFailure[] = [];
			try {
				for (const sessionId of sessionIds) {
					const outcome = await removeSession(sessionId);
					if (outcome.ok) succeeded.push(sessionId);
					else failed.push({ sessionId, errorCode: outcome.errorCode ?? "unknown" });
				}
			} finally {
				setRunning(false);
			}
			return { succeeded, failed };
		},
		[removeSession],
	);

	return { running, deleteSessions };
}
