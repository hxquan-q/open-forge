// Copyright The Open Forge contributors.
import type { BrowserWindow } from "electron";
import type { ComputerDisplay } from "./contracts.js";

export class ComputerWindowDisplay implements ComputerDisplay {
	private revision = 0;
	constructor(
		private readonly options: {
			main: () => BrowserWindow | null;
			all: () => BrowserWindow[];
			show: () => void;
			canHide: () => boolean;
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
}
