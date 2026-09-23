// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { afterEach, describe, expect, it } from "vitest";
import { IN_APP_BROWSER_PICKER_ROOT_ID, runInAppBrowserGuestCommand } from "./webview-picker-guest.js";

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

	it("stop restores browsing and resolves the pending pick as cancelled", async () => {
		document.body.innerHTML = `<button id="go">Go</button>`;
		const pick = runInAppBrowserGuestCommand("start") as Promise<Record<string, unknown>>;
		expect(document.getElementById(IN_APP_BROWSER_PICKER_ROOT_ID)).toBeTruthy();
		await runInAppBrowserGuestCommand("stop");
		await expect(pick).resolves.toEqual({ cancelled: true });
		expect(document.getElementById(IN_APP_BROWSER_PICKER_ROOT_ID)).toBeNull();
	});
});
