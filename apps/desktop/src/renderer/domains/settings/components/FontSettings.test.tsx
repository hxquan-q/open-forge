// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createInstance } from "i18next";
import { createStore, Provider } from "jotai";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../../../shared/i18n/locales/en/settings.json";
import { applyTheme } from "@shared/theme/apply";
import { getStoredFontPreferences } from "@shared/theme/fonts";
import { FontSettingsView } from "./FontSettingsView";
import { useFontSettingsModel } from "./useFontSettingsModel";

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
const originalHasPointerCapture = HTMLElement.prototype.hasPointerCapture;
const i18n = createInstance();
await i18n.init({ lng: "en", resources: { en: { settings: en } }, defaultNS: "settings", initAsync: false });
function FontSettings() {
	return <FontSettingsView model={useFontSettingsModel()} />;
}
function mount() {
	return render(
		<Provider store={createStore()}>
			<I18nextProvider i18n={i18n}>
				<FontSettings />
			</I18nextProvider>
		</Provider>,
	);
}

describe("font settings user flow", () => {
	beforeEach(() => {
		localStorage.clear();
		applyTheme("dark", "mono");
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
			const context = {
				font: "",
				measureText(text: string) {
					return { width: context.font.includes("Test Mono") ? text.length * 10 : text === "iiiiiiii" ? 16 : 72 };
				},
			};
			return context as unknown as CanvasRenderingContext2D;
		});
		HTMLElement.prototype.scrollIntoView = vi.fn();
		HTMLElement.prototype.hasPointerCapture = () => false;
	});
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
		HTMLElement.prototype.hasPointerCapture = originalHasPointerCapture;
	});
	it("reads only on request, searches, selects UI/code independently, survives themes, and resets", async () => {
		const query = vi.fn(async () => [{ family: "Test Sans" }, { family: "Test Mono" }, { family: "Test Sans" }]);
		vi.stubGlobal("queryLocalFonts", query);
		const user = userEvent.setup();
		mount();
		expect(query).not.toHaveBeenCalled();
		await user.click(screen.getByRole("button", { name: "Load installed fonts" }));
		await screen.findByRole("textbox", { name: "Search fonts" });
		await user.type(screen.getByRole("textbox", { name: "Search fonts" }), "Test Sans");
		await user.click(screen.getByRole("combobox", { name: "Interface font" }));
		await user.click(await screen.findByRole("option", { name: "Test Sans" }));
		expect(getStoredFontPreferences()).toEqual({ ui: "Test Sans", code: "" });
		expect(document.documentElement.style.getPropertyValue("--font-sans")).toContain('"Test Sans"');
		await user.clear(screen.getByRole("textbox", { name: "Search fonts" }));
		await user.click(screen.getByRole("combobox", { name: "Code and terminal font" }));
		expect(screen.queryByRole("option", { name: "Test Sans" })).toBeNull();
		await user.click(await screen.findByRole("option", { name: "Test Mono" }));
		expect(getStoredFontPreferences()).toEqual({ ui: "Test Sans", code: "Test Mono" });
		act(() => applyTheme("light", "sand"));
		expect(document.documentElement.style.getPropertyValue("--font-mono")).toContain('"Test Mono"');
		await user.click(screen.getByRole("button", { name: "Reset interface font" }));
		expect(getStoredFontPreferences()).toEqual({ ui: "", code: "Test Mono" });
		await user.click(screen.getByRole("button", { name: "Reset code font" }));
		expect(getStoredFontPreferences()).toEqual({ ui: "", code: "" });
	});
	it("keeps the page usable while loading and allows retry after permission failure", async () => {
		let reject: (reason: Error) => void = () => {};
		const query = vi.fn(
			() =>
				new Promise<unknown>((_resolve, r) => {
					reject = r;
				}),
		);
		vi.stubGlobal("queryLocalFonts", query);
		mount();
		fireEvent.click(screen.getByRole("button", { name: "Load installed fonts" }));
		expect(screen.getByRole("status").textContent).toContain("Loading installed fonts");
		expect(screen.getByRole("combobox", { name: "Interface font" })).toBeDefined();
		await act(async () => reject(Error("denied")));
		expect(screen.getByRole("alert").textContent).toContain("Could not read installed fonts");
		query.mockImplementation(async () => [{ family: "Test Mono" }]);
		fireEvent.click(screen.getByRole("button", { name: "Load installed fonts" }));
		await screen.findByRole("textbox", { name: "Search fonts" });
	});
	it("reports unsupported access without hiding the defaults", () => {
		vi.stubGlobal("queryLocalFonts", undefined);
		mount();
		fireEvent.click(screen.getByRole("button", { name: "Load installed fonts" }));
		return waitFor(() => expect(screen.getByRole("alert").textContent).toContain("not available"));
	});
	it("does not change the visible or applied preference after a failed save", async () => {
		vi.stubGlobal("queryLocalFonts", async () => [{ family: "Test Sans" }]);
		const user = userEvent.setup();
		mount();
		await user.click(screen.getByRole("button", { name: "Load installed fonts" }));
		await screen.findByRole("textbox", { name: "Search fonts" });
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw Error("quota");
		});
		await user.click(screen.getByRole("combobox", { name: "Interface font" }));
		await user.click(await screen.findByRole("option", { name: "Test Sans" }));
		expect(screen.getByRole("alert").textContent).toContain("Could not save");
		expect(getStoredFontPreferences().ui).toBe("");
		expect(document.documentElement.style.getPropertyValue("--font-sans")).not.toContain("Test Sans");
	});
});
