// Copyright The Open Forge contributors.
import { HostDispatcher, HostOwnerRegistry, MCP_HOST_METHODS, MODELS_HOST_METHODS } from "@vetta/host-protocol";
import { mcpHostDomain } from "./mcp-domain.js";
import { modelsHostDomain } from "./models-domain.js";

/**
 * 进程内 Desktop Host（PLAN-0029 Phase 2/3）：models 与 mcp 领域注册于此；
 * settings 域由 host 子进程承载（TASK-0464），经 ipc/host.ts 的代理挂到同一 dispatcher。
 * Phase 3 后续把 models/mcp 也迁入子进程时（owner 插槽拆主进程专属能力），此处与调用方均不改。
 */
export function createDesktopHost(): HostDispatcher {
	const host = new HostDispatcher(new HostOwnerRegistry());
	host.register(MODELS_HOST_METHODS, modelsHostDomain);
	host.register(MCP_HOST_METHODS, mcpHostDomain);
	return host;
}
