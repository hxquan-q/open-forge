// Modified by The Open Forge contributors.

import { resolveDesktopReviewSnapshotStore } from "@vetta/runtime-desktop";
import type { ReviewRollbackOutcome } from "@vetta/runtime-storage/conversation";
import { ipcMain } from "electron";

const CHANNEL = "vetta:review-changes:rollback";

function asNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/**
 * 回滚入口只接受 (sessionId, snapshotId)：写回目标由快照 meta 决定，
 * 渲染进程无法借此覆盖任意路径；hash 守卫在快照库内部完成。
 */
export function registerReviewChangesIpc(): () => void {
	ipcMain.handle(CHANNEL, async (_event, input: unknown): Promise<ReviewRollbackOutcome> => {
		const raw = (input ?? {}) as Record<string, unknown>;
		const sessionId = asNonEmptyString(raw.sessionId);
		const snapshotId = asNonEmptyString(raw.snapshotId);
		if (sessionId === undefined || snapshotId === undefined) return { kind: "unavailable" };
		try {
			return await resolveDesktopReviewSnapshotStore(sessionId).rollback(sessionId, snapshotId);
		} catch {
			return { kind: "unavailable" };
		}
	});
	return () => ipcMain.removeHandler(CHANNEL);
}
