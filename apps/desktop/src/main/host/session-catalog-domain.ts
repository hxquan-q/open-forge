// Copyright The Open Forge contributors.
import type { HostDomainImplementation, SESSION_CATALOG_HOST_METHODS } from "@vetta/host-protocol";
import { agentTeamSessionService } from "../agent-teams/team-session-service.js";
import { readSessionCwdFromHeader } from "../conversations/session-paths.js";
import { listRuntimeSessionProjects, listSessionHistory } from "../conversations/session-query-service.js";
import { getSharedRuntime } from "../runtime.js";

/**
 * 会话目录子域的 Host 实现（TASK-0474）：与旧 IPC handler 同职责——
 * 项目/历史目录走 session-query-service；运行中路径聚合 runtime 与
 * agent-team 协调会话；运行中 cwd 以会话头为唯一可靠来源（路径编码不可逆）。
 */
export const sessionCatalogHostDomain: HostDomainImplementation<typeof SESSION_CATALOG_HOST_METHODS> = {
	listProjects: () => listRuntimeSessionProjects(),
	listSessions: ({ cwd }) => listSessionHistory(cwd),
	listRunning: () =>
		Promise.resolve([
			...new Set([
				...getSharedRuntime().getRunningSessionPaths(),
				...agentTeamSessionService.getRunningCoordinationSessionPaths(),
			]),
		]),
	listRunningCwds: async () => {
		const paths = getSharedRuntime().getRunningSessionPaths();
		const cwds = await Promise.all(paths.map((path) => readSessionCwdFromHeader(path).catch(() => undefined)));
		return [...new Set(cwds.filter((cwd): cwd is string => typeof cwd === "string" && cwd.length > 0))];
	},
};
