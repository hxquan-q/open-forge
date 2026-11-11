// Copyright The Open Forge contributors.
import type { BrowserWindow } from "electron";
import { describe, expect, it } from "vitest";
import { ComputerWindowDisplay } from "./display.js";

function windowFixture() {
	let visible = true;
	let topmost = false;
	const value = {
		isDestroyed: () => false,
		isVisible: () => visible,
		isAlwaysOnTop: () => topmost,
		hide: () => {
			visible = false;
		},
		showInactive: () => {
			visible = true;
		},
		setAlwaysOnTop: (next: boolean) => {
			topmost = next;
		},
	};
	return { window: value as unknown as BrowserWindow, visible: () => visible, topmost: () => topmost };
}

describe("Vetta display ownership during physical input", () => {
	it("yields visible Vetta surfaces and restores them without changing topmost", () => {
		const main = windowFixture(),
			other = windowFixture();
		const display = new ComputerWindowDisplay({
			main: () => main.window,
			all: () => [main.window, other.window],
			show: () => main.window.showInactive(),
			canHide: () => true,
		});
		display.update({ topmost: true });
		const restore = display.yield();
		expect(main.visible()).toBe(false);
		expect(other.visible()).toBe(false);
		restore();
		expect(main.visible()).toBe(true);
		expect(other.visible()).toBe(true);
		expect(main.topmost()).toBe(true);
	});
	it("preserves an explicit main-window hide while restoring other surfaces", () => {
		const main = windowFixture(),
			other = windowFixture();
		const display = new ComputerWindowDisplay({
			main: () => main.window,
			all: () => [main.window, other.window],
			show: () => main.window.showInactive(),
			canHide: () => true,
		});
		const restore = display.yield();
		display.update({ hidden: true });
		restore();
		expect(main.visible()).toBe(false);
		expect(other.visible()).toBe(true);
	});
	it("does not hide the only stopping surface if recall is unavailable", () => {
		const main = windowFixture();
		const display = new ComputerWindowDisplay({
			main: () => main.window,
			all: () => [main.window],
			show: () => {},
			canHide: () => false,
		});
		expect(() => display.update({ hidden: true })).toThrow("recall_unavailable");
		expect(main.visible()).toBe(true);
	});
});
