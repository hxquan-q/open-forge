// Copyright The Open Forge contributors.
import { HostDispatcher, HostOwnerRegistry, MODELS_HOST_METHODS, SETTINGS_HOST_METHODS } from "@vetta/host-protocol";
import { modelsHostDomain } from "./models-domain.js";
import { settingsHostDomain } from "./settings-domain.js";

/**
 * 进程内 Desktop Host（PLAN-0029 Phase 2）：按领域注册合同实现，transport 由调用方选择。
 * Phase 3 把同一个 dispatcher 搬进 utilityProcess 时，领域实现与 renderer 均不改。
 */
export function createDesktopHost(): HostDispatcher {
	const host = new HostDispatcher(new HostOwnerRegistry());
	host.register(SETTINGS_HOST_METHODS, settingsHostDomain);
	host.register(MODELS_HOST_METHODS, modelsHostDomain);
	return host;
}
