// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { DESKTOP_BRAND } from "../shared/desktop-brand.js";
import { createAboutPanelOptions } from "./app-about-panel.js";

describe("Desktop About panel options", () => {
	it("uses the product brand and legal-notice guidance in development", () => {
		expect(createAboutPanelOptions("1.2.3", "License files included", false)).toEqual({
			applicationName: DESKTOP_BRAND.displayName,
			applicationVersion: "1.2.3",
			version: "",
			credits: "License files included",
		});
	});

	it("keeps the packaged application version behavior while adding credits", () => {
		expect(createAboutPanelOptions("1.2.3", "License files included", true)).toEqual({
			applicationName: DESKTOP_BRAND.displayName,
			credits: "License files included",
		});
	});
});
