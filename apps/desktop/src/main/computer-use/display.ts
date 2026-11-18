// Copyright The Open Forge contributors.
import type { BrowserWindow } from "electron";
import type { ComputerDisplay } from "./contracts.js";

/** WDA_EXCLUDEFROMCAPTURE hides a window from capture while leaving it visible and interactive on screen. */
const captureExclusionBuild = 19041;

export function captureExclusionSupported(release: string): boolean {
	const build = Number.parseInt(release.split(".")[2] ?? "", 10);
	return Number.isInteger(build) && build >= captureExclusionBuild;
}

export class ComputerWindowDisplay implements ComputerDisplay {
	private revision = 0;
	constructor(
		private readonly options: {
			main: () => BrowserWindow | null;
			all: () => BrowserWindow[];
			show: () => void;
			canHide: () => boolean;
			canExclude: () => boolean;
		},
	) {}

	read(): { hidden: boolean; topmost: boolean } {
		const window = this.options.main();
		return { hidden: !window?.isVisible(), topmost: window?.isAlwaysOnTop() ?? false };
	}

	update(value: { hidden?: boolean; topmost?: boolean }): void {
		const window = this.options.main();
		if (!window || window.isDestroyed()) throw new Error("window_unavailable");
		if (value.hidden === true && !this.options.canHide()) throw new Error("recall_unavailable");
		if (value.hidden !== undefined) this.revision++;
		if (value.topmost !== undefined) window.setAlwaysOnTop(value.topmost);
		if (value.hidden === true) window.hide();
		if (value.hidden === false) this.options.show();
	}

	yield(): () => void {
		const revision = this.revision;
		const main = this.options.main();
		const visible = this.options.all().filter((window) => !window.isDestroyed() && window.isVisible());
		for (const window of visible) window.hide();
		return () => {
			for (const window of visible) {
				if (window === main && revision !== this.revision) continue;
				if (!window.isDestroyed()) window.showInactive();
			}
		};
	}
	exclude(): () => void {
		// Older Windows cannot exclude a window from capture without blacking it out,
		// so fall back to the input-surface yield: the screenshot and the input must match either way.
		if (!this.options.canExclude()) return this.yield();
		const windows = this.options.all().filter((window) => !window.isDestroyed());
		for (const window of windows) window.setContentProtection(true);
		return () => {
			for (const window of windows) {
				if (!window.isDestroyed()) window.setContentProtection(false);
			}
		};
	}
}
