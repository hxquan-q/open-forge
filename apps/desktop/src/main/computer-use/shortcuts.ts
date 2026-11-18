// Copyright The Open Forge contributors.
import { globalShortcut } from "electron";
import { getEffectiveShortcut } from "../../shared/shortcuts.js";
import { readDesktopConfig } from "../config/desktop-config-store.js";

const actions = ["computer-use-stop", "computer-use-recall"] as const;
type Action = (typeof actions)[number];
let handlers: Record<Action, () => void> | undefined;
const registered = new Map<Action, string>();
let available = false;
let generation = 0;

export function computerUseShortcutsAvailable(): boolean {
	return available;
}

export function toSystemAccelerator(combo: string): string {
	const names: Readonly<Record<string, string>> = {
		mod: "CommandOrControl",
		ctrl: "Control",
		alt: "Alt",
		shift: "Shift",
		escape: "Escape",
		space: "Space",
		arrowup: "Up",
		arrowdown: "Down",
		arrowleft: "Left",
		arrowright: "Right",
		enter: "Enter",
		backspace: "Backspace",
		delete: "Delete",
		tab: "Tab",
	};
	return combo
		.split("+")
		.map((key) => names[key] ?? key.toUpperCase())
		.join("+");
}

export async function refreshComputerUseShortcuts(): Promise<void> {
	if (!handlers) return;
	const current = ++generation;
	const config = await readDesktopConfig().catch(() => undefined);
	if (!config) {
		available = false;
		return;
	}
	if (current !== generation || !handlers) return;
	for (const accelerator of registered.values()) globalShortcut.unregister(accelerator);
	registered.clear();
	for (const action of actions) {
		const accelerator = toSystemAccelerator(getEffectiveShortcut(action, config.shortcuts?.bindings));
		try {
			if (globalShortcut.register(accelerator, handlers[action])) registered.set(action, accelerator);
		} catch {
			/* The tray remains available if the operating system rejects a binding. */
		}
	}
	available = registered.size === actions.length;
}

export function bindComputerUseShortcuts(value: Record<Action, () => void>): () => void {
	handlers = value;
	void refreshComputerUseShortcuts().catch(() => {
		available = false;
	});
	return () => {
		generation++;
		handlers = undefined;
		available = false;
		for (const accelerator of registered.values()) globalShortcut.unregister(accelerator);
		registered.clear();
	};
}
