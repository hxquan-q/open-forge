// Copyright The Open Forge contributors.
import { getAppLogger } from "../logger.js";
import { tryGetDesktopSchedulerService } from "./scheduler-service.js";

const log = getAppLogger("scheduler");

/** 会话被删除后通知自动化：解绑并暂停相关任务、清理执行记录（ADR-0155）。失败不影响删除本身。 */
export function notifyAutomationSessionsDeleted(isDeleted: (sessionPath: string) => boolean): void {
	void tryGetDesktopSchedulerService()
		?.handleSessionsDeleted(isDeleted)
		.catch((error) => log.error("failed to update automations after session deletion", error));
}
