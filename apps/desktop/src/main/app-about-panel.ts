// Copyright The Open Forge contributors.
import { DESKTOP_BRAND } from "../shared/desktop-brand.js";

export function createAboutPanelOptions(appVersion: string, credits: string, isPackaged: boolean) {
	return {
		applicationName: DESKTOP_BRAND.displayName,
		credits,
		...(!isPackaged ? { applicationVersion: appVersion, version: "" } : {}),
	};
}
