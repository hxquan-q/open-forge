// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { afterEach, describe, expect, it } from "vitest";
import { evaluateInjectedGuestScript } from "../../test/injected-guest-script.js";
import {
	buildInAppBrowserGuestScript,
	IN_APP_BROWSER_PICKER_ROOT_ID,
	runInAppBrowserGuestCommand,
} from "./webview-picker-guest.js";

afterEach(async () => {
	await runInAppBrowserGuestCommand("stop");
	document.body.innerHTML = "";
});

describe("in-app browser picker guest", () => {
	it("intercepts the click so the page button does not fire, then leaves no overlay", async () => {
		document.body.innerHTML = `<form><input id="email" name="email" type="email"><button type="submit" id="go">Go</button></form>`;
		const button = document.getElementById("go");
		if (!button) throw new Error("missing button");
		let pageClicked = false;
		button.addEventListener("click", () => {
			pageClicked = true;
		});

		const pick = runInAppBrowserGuestCommand("start") as Promise<Record<string, unknown>>;
		expect(document.getElementById(IN_APP_BROWSER_PICKER_ROOT_ID)).toBeTruthy();
		button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 8, clientY: 8 }));
		const result = await pick;

		expect(pageClicked).toBe(false);
		expect(result.role).toBe("button");
		expect(result.accessibleName).toBe("Go");
		expect(result.domPath).toBe("button#go");
		expect(document.getElementById(IN_APP_BROWSER_PICKER_ROOT_ID)).toBeNull();
	});

	it("空白点到 body 时不产生 capsule，并保持 picker", async () => {
		document.body.innerHTML = `<button id="go">Go</button>`;
		Object.defineProperty(document.body, "getBoundingClientRect", {
			value: () => ({
				x: 0,
				y: 0,
				width: window.innerWidth,
				height: window.innerHeight,
				top: 0,
				left: 0,
				right: window.innerWidth,
				bottom: window.innerHeight,
				toJSON: () => ({}),
			}),
			configurable: true,
		});
		document.elementsFromPoint = () => [document.body, document.documentElement];
		const pick = runInAppBrowserGuestCommand("start") as Promise<Record<string, unknown>>;
		document.body.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 8, clientY: 8 }));
		expect(document.getElementById(IN_APP_BROWSER_PICKER_ROOT_ID)).toBeTruthy();
		let settled = false;
		void pick.then(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(settled).toBe(false);
		await runInAppBrowserGuestCommand("stop");
		await expect(pick).resolves.toEqual({ cancelled: true });
	});

	it("注入脚本整段求值也能完成点选（与 executeJavaScript 同一入口）", async () => {
		document.body.innerHTML = `<button id="go">Go</button>`;
		const button = document.getElementById("go");
		if (!button) throw new Error("missing button");

		const pick = evaluateInjectedGuestScript(buildInAppBrowserGuestScript("start")) as Promise<
			Record<string, unknown>
		>;
		expect(document.getElementById(IN_APP_BROWSER_PICKER_ROOT_ID)).toBeTruthy();
		button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 6, clientY: 6 }));
		const result = await pick;

		expect(result.role).toBe("button");
		expect(result.domPath).toBe("button#go");
		expect(document.getElementById(IN_APP_BROWSER_PICKER_ROOT_ID)).toBeNull();
	});

	it("stop restores browsing and resolves the pending pick as cancelled", async () => {
		document.body.innerHTML = `<button id="go">Go</button>`;
		const pick = runInAppBrowserGuestCommand("start") as Promise<Record<string, unknown>>;
		expect(document.getElementById(IN_APP_BROWSER_PICKER_ROOT_ID)).toBeTruthy();
		await runInAppBrowserGuestCommand("stop");
		await expect(pick).resolves.toEqual({ cancelled: true });
		expect(document.getElementById(IN_APP_BROWSER_PICKER_ROOT_ID)).toBeNull();
	});
});
