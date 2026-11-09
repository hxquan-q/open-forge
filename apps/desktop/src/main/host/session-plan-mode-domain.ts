// Copyright The Open Forge contributors.
import {
	CODING_AGENT_PERMISSION_MODE_SET,
	CODING_AGENT_PLAN_MODE_STATE_READ,
} from "@vetta/coding-agent/session-extensions";
import type { HostDomainImplementation, SESSION_PLAN_MODE_HOST_METHODS } from "@vetta/host-protocol";
import { getSharedRuntime } from "../runtime.js";

/**
 * 会话 plan-mode 子域的 Host 实现（TASK-0471）：与旧 IPC handler 同职责，
 * 薄桥接同步 session extension（invalid permissionMode 由合同校验拒绝）。
 */
export const sessionPlanModeHostDomain: HostDomainImplementation<typeof SESSION_PLAN_MODE_HOST_METHODS> = {
	getPlanModeState: ({ sessionId }) =>
		Promise.resolve(
			getSharedRuntime().invokeSessionExtensionSync(sessionId, CODING_AGENT_PLAN_MODE_STATE_READ, undefined),
		),
	setPlanModePermissionMode: ({ sessionId, permissionMode }) =>
		Promise.resolve(
			getSharedRuntime().invokeSessionExtensionSync(sessionId, CODING_AGENT_PERMISSION_MODE_SET, { permissionMode }),
		),
};
