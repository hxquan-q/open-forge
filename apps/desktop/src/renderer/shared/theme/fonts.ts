// Copyright The Open Forge contributors.
/** Local presentation preference only: never send font names to the agent or telemetry. */
export interface FontPreferences {
	ui: string;
	code: string;
}
export const FONT_STORAGE_KEY = "openforge-font-preferences";

export function normalizeFontFamily(value: unknown): string {
	if (typeof value !== "string") return "";
	const name = value.trim();
	if (name.length > 128 || /[\u0000-\u001f\u007f;:{}()]/u.test(name)) return "";
	return name;
}

export function fontFamily(name: string, fallback: string): string {
	const family = normalizeFontFamily(name);
	if (!family) return fallback;
	return `"${family.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}", ${fallback}`;
}

export function getStoredFontPreferences(): FontPreferences {
	try {
		const value: unknown = JSON.parse(localStorage.getItem(FONT_STORAGE_KEY) ?? "null");
		if (typeof value === "object" && value !== null) {
			return {
				ui: normalizeFontFamily("ui" in value ? value.ui : undefined),
				code: normalizeFontFamily("code" in value ? value.code : undefined),
			};
		}
	} catch {
		/* Corrupt or unavailable storage must not prevent startup. */
	}
	return { ui: "", code: "" };
}

/** Save before applying so a failed write never masquerades as a persisted choice. */
export function saveFontPreferences(preferences: FontPreferences): void {
	const value = { ui: normalizeFontFamily(preferences.ui), code: normalizeFontFamily(preferences.code) };
	localStorage.setItem(FONT_STORAGE_KEY, JSON.stringify(value));
}
