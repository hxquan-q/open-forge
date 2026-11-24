// Copyright The Open Forge contributors.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	bindComputerUseShortcuts,
	computerUseShortcutsAvailable,
	refreshComputerUseShortcuts,
	toSystemAccelerator,
} from "./shortcuts.js";

const { registered, config } = vi.hoisted(() => ({
	registered: new Map<string, () => void>(),
	config: { shortcuts: { bindings: {} as Record<string, string> } },
}));
vi.mock("electron", () => ({
	globalShortcut: {
		register: (key: string, action: () => void) => {
			if (registered.has(key)) return false;
			registered.set(key, action);
			return true;
		},
		unregister: (key: string) => registered.delete(key),
	},
}));
vi.mock("../config/desktop-config-store.js", () => ({ readDesktopConfig: async () => config }));
const disposers: Array<() => void> = [];
afterEach(() => {
	for (const dispose of disposers.splice(0)) dispose();
	registered.clear();
	config.shortcuts.bindings = {};
});

describe("system stopping and recall shortcuts", () => {
	it("uses configurable bindings and unregisters only its own keys", async () => {
		registered.set("Control+T", () => {});
		config.shortcuts.bindings["computer-use-stop"] = "ctrl+shift+q";
		const stop = vi.fn(),
			recall = vi.fn();
		const dispose = bindComputerUseShortcuts({ "computer-use-stop": stop, "computer-use-recall": recall });
		disposers.push(dispose);
		await refreshComputerUseShortcuts();
		expect(computerUseShortcutsAvailable()).toBe(true);
		registered.get("Control+Shift+Q")?.();
		registered.get("CommandOrControl+Alt+V")?.();
		expect(stop).toHaveBeenCalledOnce();
		expect(recall).toHaveBeenCalledOnce();
		dispose();
		expect([...registered.keys()]).toEqual(["Control+T"]);
	});
	it("reports unavailable bindings without unregistering another application's shortcut", async () => {
		const occupied = () => {};
		registered.set("CommandOrControl+Alt+Q", occupied);
		disposers.push(bindComputerUseShortcuts({ "computer-use-stop": () => {}, "computer-use-recall": () => {} }));
		await refreshComputerUseShortcuts();
		expect(computerUseShortcutsAvailable()).toBe(false);
		expect(registered.get("CommandOrControl+Alt+Q")).toBe(occupied);
	});
	it("maps normalized keys without changing their configured meaning", () => {
		expect(toSystemAccelerator("mod+alt+q")).toBe("CommandOrControl+Alt+Q");
		expect(toSystemAccelerator("ctrl+shift+arrowup")).toBe("Control+Shift+Up");
	});
});
