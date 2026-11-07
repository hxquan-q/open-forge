// Copyright The Open Forge contributors.
import {
	HostDispatcher,
	HostOwnerRegistry,
	MCP_HOST_METHODS,
	MODELS_HOST_METHODS,
	SESSION_DEFAULTS_HOST_METHODS,
	SESSION_HISTORY_HOST_METHODS,
	SESSION_QUEUE_HOST_METHODS,
} from "@vetta/host-protocol";
import { mcpHostDomain } from "./mcp-domain.js";
import { modelsHostDomain } from "./models-domain.js";
import { sessionDefaultsHostDomain } from "./session-defaults-domain.js";
import { sessionHistoryHostDomain } from "./session-history-domain.js";
import { sessionQueueHostDomain } from "./session-queue-domain.js";

/**
 * 进程内 Desktop Host（PLAN-0029 Phase 2/3）：models、mcp、会话默认项、输入队列与历史分支领域注册于此；
 * settings 域由 host 子进程承载（TASK-0464），经 ipc/host.ts 的代理挂到同一 dispatcher。
 */
export function createDesktopHost(): HostDispatcher {
	const host = new HostDispatcher(new HostOwnerRegistry());
	host.register(MODELS_HOST_METHODS, modelsHostDomain);
	host.register(MCP_HOST_METHODS, mcpHostDomain);
	host.register(SESSION_DEFAULTS_HOST_METHODS, sessionDefaultsHostDomain);
	host.register(SESSION_HISTORY_HOST_METHODS, sessionHistoryHostDomain);
	host.register(SESSION_QUEUE_HOST_METHODS, sessionQueueHostDomain);
	return host;
}
