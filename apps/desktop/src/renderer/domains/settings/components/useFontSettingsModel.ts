// Copyright The Open Forge contributors.
import { fontPreferencesAtom } from "@shared/store/atoms";
import { applyStoredTheme } from "@shared/theme/apply";
import type { FontPreferences } from "@shared/theme/fonts";
import { FONT_STORAGE_KEY, getStoredFontPreferences, saveFontPreferences } from "@shared/theme/fonts";
import { useAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { InstalledFont } from "./installed-fonts";
import { readInstalledFonts, supportsLocalFonts } from "./installed-fonts";

export function useFontSettingsModel() {
	const { t } = useTranslation("settings");
	const [preferences, setPreferences] = useAtom(fontPreferencesAtom);
	const [fonts, setFonts] = useState<InstalledFont[]>([]);
	const [loaded, setLoaded] = useState(false);
	const [loading, setLoading] = useState(false);
	const [query, setQuery] = useState("");
	const [error, setError] = useState<"unavailable" | "loadFailed" | "saveFailed" | null>(null);
	const request = useRef<AbortController | null>(null);
	useEffect(() => {
		// Re-read on entry: other app windows may have changed local preferences.
		setPreferences(getStoredFontPreferences());
		const changed = (event: StorageEvent) => {
			if (event.key !== FONT_STORAGE_KEY && event.key !== null) return;
			setPreferences(getStoredFontPreferences());
			applyStoredTheme();
		};
		window.addEventListener("storage", changed);
		return () => {
			request.current?.abort();
			request.current = null;
			window.removeEventListener("storage", changed);
		};
	}, [setPreferences]);
	const load = async () => {
		if (request.current) return;
		if (!supportsLocalFonts()) {
			setError("unavailable");
			return;
		}
		const controller = new AbortController();
		request.current = controller;
		setLoading(true);
		setError(null);
		try {
			const result = await readInstalledFonts(controller.signal);
			if (controller.signal.aborted) return;
			setFonts(result);
			setLoaded(true);
		} catch {
			if (!controller.signal.aborted) setError("loadFailed");
		} finally {
			if (request.current === controller) {
				request.current = null;
				setLoading(false);
			}
		}
	};
	const choose = (kind: keyof FontPreferences, family: string) => {
		// Choices come from the validated list; the code selector must not accept proportional fonts.
		if (family && !fonts.some((font) => font.family === family && (kind === "ui" || font.monospace))) return;
		try {
			const next = { ...getStoredFontPreferences(), [kind]: family };
			saveFontPreferences(next);
			applyStoredTheme();
			setPreferences(next);
			setError(null);
		} catch {
			setError("saveFailed");
		}
	};
	return {
		preferences,
		fonts,
		loaded,
		loading,
		query,
		error: error ? t(`fonts.${error}`) : null,
		actions: { load, choose, setQuery },
		labels: {
			title: t("fonts.title"),
			hint: t("fonts.hint"),
			load: t("fonts.load"),
			loading: t("fonts.loading"),
			search: t("fonts.search"),
			ui: t("fonts.ui"),
			code: t("fonts.code"),
			default: t("fonts.default"),
			resetUi: t("fonts.resetUi"),
			resetCode: t("fonts.resetCode"),
			preview: t("fonts.preview"),
			codePreview: t("fonts.codePreview"),
			missing: t("fonts.missing"),
			empty: t("fonts.empty"),
		},
	};
}
export type FontSettingsModel = ReturnType<typeof useFontSettingsModel>;
