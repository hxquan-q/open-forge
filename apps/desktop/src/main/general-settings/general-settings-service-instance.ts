// Copyright The Open Forge contributors.
import { readDesktopConfig, updateDesktopConfig } from "../config/desktop-config-store.js";
import { allowProjectRoot } from "../filesystem/filesystem-service.js";
import { getSandboxCapability } from "../sandbox/capability.js";
import { GeneralSettingsService } from "./general-settings-service.js";

let desktopGeneralSettingsService: GeneralSettingsService | undefined;

export function getDesktopGeneralSettingsService(): GeneralSettingsService {
	desktopGeneralSettingsService ??= new GeneralSettingsService({
		readConfig: readDesktopConfig,
		updateConfig: updateDesktopConfig,
		allowWorkspaceRoot: allowProjectRoot,
		getSandbox: getSandboxCapability,
	});
	return desktopGeneralSettingsService;
}
