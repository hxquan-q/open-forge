// Copyright The Open Forge contributors.
import {
	CODING_AGENT_BACKGROUND_TASK_KILL,
	CODING_AGENT_BACKGROUND_TASKS_CLEAR_FINISHED,
	CODING_AGENT_SUBAGENT_INTERRUPT,
} from "@vetta/coding-agent/session-extensions";
import type { HostDomainImplementation, SESSION_RUNTIME_OPS_HOST_METHODS } from "@vetta/host-protocol";
import { setSessionInterruptDraftNonEmpty } from "../agent-runtime/session-interrupt-draft-registry.js";
import { clearSessionManualStop } from "../agent-runtime/session-interrupt-watch-registry.js";
import { getSharedRuntime } from "../runtime.js";

/**
 * 会话运行控制与后台任务子域的 Host 实现（TASK-0473）：与旧 IPC handler
 * 同职责——retry 先清 manual-stop 标记；后台任务与子代理中断薄桥接
 * session extension。
 */
export const sessionRuntimeOpsHostDomain: HostDomainImplementation<typeof SESSION_RUNTIME_OPS_HOST_METHODS> = {
	retry: async ({ sessionId }) => {
		clearSessionManualStop(sessionId);
		await getSharedRuntime().retry(sessionId);
		return null;
	},
	setInterruptDraftNonEmpty: ({ sessionId, nonEmpty }) => {
		setSessionInterruptDraftNonEmpty(sessionId, nonEmpty);
		return Promise.resolve(null);
	},
	getSessionPath: ({ sessionId }) => Promise.resolve(getSharedRuntime().getSessionPath(sessionId) ?? null),
	clearFinishedBackgroundTasks: ({ sessionId }) =>
		getSharedRuntime().invokeSessionExtension(sessionId, CODING_AGENT_BACKGROUND_TASKS_CLEAR_FINISHED, undefined),
	killBackgroundTask: ({ sessionId, taskId }) =>
		getSharedRuntime().invokeSessionExtension(sessionId, CODING_AGENT_BACKGROUND_TASK_KILL, { taskId }),
	interruptSubagent: async ({ sessionId, target }) => {
		const snap = await getSharedRuntime().invokeSessionExtension(sessionId, CODING_AGENT_SUBAGENT_INTERRUPT, {
			target,
		});
		return snap != null;
	},
};
