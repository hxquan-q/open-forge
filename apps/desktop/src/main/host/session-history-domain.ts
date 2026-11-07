// Copyright The Open Forge contributors.
import type { HostDomainImplementation, SESSION_HISTORY_HOST_METHODS } from "@vetta/host-protocol";
import { getSharedRuntime } from "../runtime.js";

/**
 * 会话历史分支子域的 Host 实现（TASK-0468）：薄桥接 RuntimeSessionHistoryController，
 * 安全写语义（Turn 互斥、分支持久化、Agent 上下文同步）全部留在 RuntimeHost。
 */
export const sessionHistoryHostDomain: HostDomainImplementation<typeof SESSION_HISTORY_HOST_METHODS> = {
	navigateForEdit: ({ sessionId, entryId }) => getSharedRuntime().navigateForEdit(sessionId, entryId),
	switchBranch: ({ sessionId, entryId }) => getSharedRuntime().switchBranch(sessionId, entryId),
	deleteMessage: ({ sessionId, entryId }) => getSharedRuntime().deleteMessage(sessionId, entryId),
	replaceLastUserMessage: ({ sessionId, entryId }) => getSharedRuntime().replaceLastUserMessage(sessionId, entryId),
	forkSession: ({ sessionId, entryId }) => getSharedRuntime().forkSession(sessionId, entryId),
};
