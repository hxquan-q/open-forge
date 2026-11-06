// Copyright The Open Forge contributors.
import type { HostDomainImplementation, MODELS_HOST_METHODS } from "@vetta/host-protocol";
import { resolveNodeConfigurationValue } from "@vetta/runtime-node/host";
import { clipboard } from "electron";
import { getDesktopModelSettingsService } from "../models/model-settings-host.js";
import { listPresetProviders, refreshPresetCatalog } from "../models/presets/sync.js";

/** 复制密钥后 30 秒内若剪贴板未被覆盖则清空，避免密钥长期残留（自 ipc/fs.ts 随通道整体迁入）。 */
const API_KEY_CLIPBOARD_CLEAR_MS = 30_000;
let apiKeyClipboardClearTimer: ReturnType<typeof setTimeout> | undefined;
let copiedApiKey: string | undefined;
const clearCopiedApiKey = (): void => {
	if (copiedApiKey && clipboard.readText() === copiedApiKey) clipboard.clear();
	copiedApiKey = undefined;
	apiKeyClipboardClearTimer = undefined;
};

/** 模型领域的 Host 实现：参数已由合同校验，这里只调用既有业务服务。 */
export const modelsHostDomain: HostDomainImplementation<typeof MODELS_HOST_METHODS> = {
	listPresets: () => listPresetProviders(),
	refreshPresetCatalog: () => refreshPresetCatalog(),
	getConfig: () => getDesktopModelSettingsService().getRendererConfig(),
	setConfig: async ({ config }) => {
		await getDesktopModelSettingsService().replaceConfig(config);
		return null;
	},
	copyApiKey: async ({ providerId }) => {
		const keyConfig = await getDesktopModelSettingsService().getProviderApiKey(providerId.trim());
		const apiKey = keyConfig ? resolveNodeConfigurationValue(keyConfig) : undefined;
		if (!apiKey) return false;

		clipboard.writeText(apiKey);
		if (apiKeyClipboardClearTimer) clearTimeout(apiKeyClipboardClearTimer);
		copiedApiKey = apiKey;
		apiKeyClipboardClearTimer = setTimeout(clearCopiedApiKey, API_KEY_CLIPBOARD_CLEAR_MS);
		return true;
	},
};
