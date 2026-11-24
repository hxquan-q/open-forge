// Copyright The Open Forge contributors.
import type { BrowserWindow } from "electron";
import { describe, expect, it } from "vitest";
import { ComputerWindowDisplay, captureExclusionSupported } from "./display.js";

function windowFixture() {
	let visible = true;
	let topmost = false;
	let protection = false;
	let destroyed = false;
	const value = {
		isDestroyed: () => destroyed,
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
		setContentProtection: (next: boolean) => {
			protection = next;
		},
		destroy: () => {
			destroyed = true;
		},
	};
	return {
		window: value as unknown as BrowserWindow,
		visible: () => visible,
		topmost: () => topmost,
		protection: () => protection,
	};
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
			canExclude: () => true,
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
			canExclude: () => true,
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
			canExclude: () => true,
		});
		expect(() => display.update({ hidden: true })).toThrow("recall_unavailable");
		expect(main.visible()).toBe(true);
	});
});

describe("capture exclusion during observation", () => {
	it("excludes every Vetta surface from capture while it stays visible on screen", () => {
		const main = windowFixture(),
			other = windowFixture();
		const display = new ComputerWindowDisplay({
			main: () => main.window,
			all: () => [main.window, other.window],
			show: () => {},
			canHide: () => true,
			canExclude: () => true,
		});
		const restore = display.exclude();
		expect(main.visible()).toBe(true);
		expect(other.visible()).toBe(true);
		expect(main.protection()).toBe(true);
		expect(other.protection()).toBe(true);
		restore();
		expect(main.protection()).toBe(false);
		expect(other.protection()).toBe(false);
		expect(main.visible()).toBe(true);
		expect(other.visible()).toBe(true);
	});
	it("falls back to hiding Vetta for the observation when capture exclusion is unavailable", () => {
		const main = windowFixture(),
			other = windowFixture();
		const display = new ComputerWindowDisplay({
			main: () => main.window,
			all: () => [main.window, other.window],
			show: () => main.window.showInactive(),
			canHide: () => true,
			canExclude: () => false,
		});
		const restore = display.exclude();
		expect(main.visible()).toBe(false);
		expect(other.visible()).toBe(false);
		restore();
		expect(main.visible()).toBe(true);
		expect(other.visible()).toBe(true);
	});
	it("clears protection for windows that are destroyed during the observation", () => {
		const main = windowFixture(),
			other = windowFixture();
		const display = new ComputerWindowDisplay({
			main: () => main.window,
			all: () => [main.window, other.window],
			show: () => {},
			canHide: () => true,
			canExclude: () => true,
		});
		const restore = display.exclude();
		other.window.destroy();
		expect(() => restore()).not.toThrow();
		expect(main.protection()).toBe(false);
	});
	it("treats the capture exclusion floor as Windows 10 build 19041", () => {
		expect(captureExclusionSupported("10.0.26200")).toBe(true);
		expect(captureExclusionSupported("10.0.19041")).toBe(true);
		expect(captureExclusionSupported("10.0.19040")).toBe(false);
		expect(captureExclusionSupported("10.0.18363")).toBe(false);
		expect(captureExclusionSupported("6.1.7601")).toBe(false);
		expect(captureExclusionSupported("unexpected")).toBe(false);
	});
});
