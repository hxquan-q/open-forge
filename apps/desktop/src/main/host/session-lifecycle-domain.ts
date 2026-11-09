// Copyright The Open Forge contributors.

import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { codingAgentSessionShardPath } from "@vetta/coding-agent/bootstrap";
import type { HostDomainImplementation, SESSION_LIFECYCLE_HOST_METHODS } from "@vetta/host-protocol";
import { clearSessionManualStop, markSessionManualStop } from "../agent-runtime/session-interrupt-watch-registry.js";
import { stopSessionBackgroundWork } from "../agent-runtime/stop-session-work.js";
import { assertOrdinaryConversationPath } from "../conversations/conversation-ownership-guard.js";
import { purgeProjectSessions } from "../conversations/project-session-purge.js";
import { isConversationSubCwd, readSessionCwdFromHeader } from "../conversations/session-paths.js";
import { listSessionHistory } from "../conversations/session-query-service.js";
import { getAppLogger } from "../logger.js";
import { forgetMessageAnnotations } from "../message-annotations/host.js";
import { getSharedRuntime } from "../runtime.js";

const sessionLog = getAppLogger("session");

/**
 * 会话生命周期控制与删除子域的 Host 实现（TASK-0475）：与旧 IPC handler
 * 同职责——continue 清 manual-stop；abort 无条件停转并连带收割后台工作；
 * delete 保留所有权守卫与 ADR-0007 子目录回收；deleteAllForCwd 走
 * purgeProjectSessions（失败路径保留目录）。
 */
export const sessionLifecycleHostDomain: HostDomainImplementation<typeof SESSION_LIFECYCLE_HOST_METHODS> = {
	continueSession: async ({ sessionId }) => {
		clearSessionManualStop(sessionId);
		await getSharedRuntime().continue(sessionId);
		return null;
	},
	abort: async ({ sessionId }) => {
		markSessionManualStop(sessionId);
		// Stopping is unconditional: the turn comes down together with the work it
		// spawned. Subagents and background commands outlive the turn by design, so
		// cancelling the turn alone would leave workflows running behind the button.
		const runtime = getSharedRuntime();
		await Promise.allSettled([runtime.abort(sessionId), stopSessionBackgroundWork(runtime, sessionId)]);
		return null;
	},
	delete: async ({ sessionPath }) => {
		await assertOrdinaryConversationPath(sessionPath);
		// ADR-0007: 「对话」项目下的 session cwd 是独立子目录；删除 session 时
		// 连带回收子目录里的产物。读 header 先取 cwd，再 delete，最后 rm 子目录。
		const cwdFromHeader = await readSessionCwdFromHeader(sessionPath);
		const runtime = getSharedRuntime();
		await runtime.deleteSession(sessionPath);
		await forgetMessageAnnotations(sessionPath);
		if (cwdFromHeader && isConversationSubCwd(cwdFromHeader)) {
			await rm(resolve(cwdFromHeader), { recursive: true, force: true }).catch((err) => {
				sessionLog.error("failed to remove conversation sub cwd", cwdFromHeader, err);
			});
		}
		return null;
	},
	deleteAllForCwd: async ({ cwd }) => {
		const result = await purgeProjectSessions(cwd, {
			listSessions: (target) => listSessionHistory(target),
			deleteSession: (sessionPath) => getSharedRuntime().deleteSession(sessionPath),
			// 分片目录是新会话的落点；`<项目>/.vetta/sessions` 是存量兼容位置，随项目目录
			// 一起消失，这里不重复处理（见 composition.resolveDesktopRuntimeSessionRoots）。
			resolveSessionDirs: (target) => [codingAgentSessionShardPath(target)],
			removeDirectory: (dir) => rm(dir, { recursive: true, force: true }),
			logError: (message, ...args) => sessionLog.error(message, ...args),
		});
		return { deleted: result.deleted, failed: [...result.failed] };
	},
};
