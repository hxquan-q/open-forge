// Copyright The Open Forge contributors.
import type { HostDomainImplementation, MODELS_HOST_METHODS } from "@vetta/host-protocol";
import { listPresetProviders, refreshPresetCatalog } from "../models/presets/sync.js";

/** 模型预设目录领域的 Host 实现：参数已由合同校验，这里只调用既有业务服务。 */
export const modelsHostDomain: HostDomainImplementation<typeof MODELS_HOST_METHODS> = {
	listPresets: () => listPresetProviders(),
	refreshPresetCatalog: () => refreshPresetCatalog(),
};
