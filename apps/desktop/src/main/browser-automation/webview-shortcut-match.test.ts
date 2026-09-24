// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { matchShortcutCombo } from "./webview-shortcut-match.js";

describe("webview before-input shortcut matching", () => {
	it("treats mod as Control on Windows and Meta on macOS", () => {
		expect(
			matchShortcutCombo(
				{ type: "keyDown", key: "d", control: true, shift: true, alt: false, meta: false },
				"mod+shift+d",
				"win32",
			),
		).toBe(true);
		expect(
			matchShortcutCombo(
				{ type: "keyDown", key: "d", control: false, shift: true, alt: false, meta: true },
				"mod+shift+d",
				"darwin",
			),
		).toBe(true);
		expect(
			matchShortcutCombo(
				{ type: "keyDown", key: "d", control: true, shift: true, alt: false, meta: false },
				"mod+shift+d",
				"darwin",
			),
		).toBe(false);
	});

	it("ignores keyUp and bare modifier presses", () => {
		expect(
			matchShortcutCombo(
				{ type: "keyUp", key: "d", control: true, shift: true, alt: false, meta: false },
				"mod+shift+d",
				"win32",
			),
		).toBe(false);
		expect(
			matchShortcutCombo(
				{ type: "keyDown", key: "Shift", control: true, shift: true, alt: false, meta: false },
				"mod+shift+d",
				"win32",
			),
		).toBe(false);
	});
});
