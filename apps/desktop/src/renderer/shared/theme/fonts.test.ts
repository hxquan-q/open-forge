// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyInitialTheme, applyTheme } from "./apply";
import { FONT_STORAGE_KEY, fontFamily, getStoredFontPreferences, saveFontPreferences } from "./fonts";
import { getTheme } from "./themes";

describe("local font preferences", () => {
	beforeEach(() => {
		localStorage.clear();
		document.documentElement.removeAttribute("style");
		vi.restoreAllMocks();
	});
	it("keeps the existing default and safely recovers malformed preferences", () => {
		for (const raw of ["{", "null", '{"ui":42,"code":"bad; color:red"}']) {
			localStorage.setItem(FONT_STORAGE_KEY, raw);
			expect(getStoredFontPreferences()).toEqual({ ui: "", code: "" });
			applyInitialTheme();
			expect(document.documentElement.style.getPropertyValue("--font-mono")).toBe(getTheme("mono").dark.fontMono);
		}
	});
	it("persists independent fonts across theme changes and startup, then resets to theme defaults", () => {
		saveFontPreferences({ ui: "Test Sans", code: "Test Mono" });
		applyTheme("light", "sand");
		expect(document.documentElement.style.getPropertyValue("--font-sans")).toBe(
			fontFamily("Test Sans", getTheme("sand").light.fontSans),
		);
		expect(document.documentElement.style.getPropertyValue("--font-mono")).toContain('"Test Mono"');
		applyInitialTheme();
		expect(getStoredFontPreferences()).toEqual({ ui: "Test Sans", code: "Test Mono" });
		expect(document.documentElement.style.getPropertyValue("--font-mono")).toContain('"Test Mono"');
		saveFontPreferences({ ui: "", code: "" });
		applyTheme("dark", "mono");
		expect(document.documentElement.style.getPropertyValue("--font-sans")).toBe(getTheme("mono").dark.fontSans);
		expect(document.documentElement.style.getPropertyValue("--font-mono")).toBe(getTheme("mono").dark.fontMono);
	});
	it("quotes family names as data rather than accepting CSS syntax", () => {
		expect(fontFamily('A "quoted" Font', "monospace")).toBe('"A \\"quoted\\" Font", monospace');
		expect(fontFamily("var(--evil)", "monospace")).toBe("monospace");
	});
	it("does not claim a preference was saved when storage fails", () => {
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw Error("quota");
		});
		expect(() => saveFontPreferences({ ui: "Test Sans", code: "" })).toThrow("quota");
		expect(getStoredFontPreferences()).toEqual({ ui: "", code: "" });
	});
});
