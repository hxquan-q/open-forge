// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { afterEach, describe, expect, it } from "vitest";
import { evaluateInjectedGuestScript } from "../../test/injected-guest-script.js";
import { readBrowserElementSourceHint } from "./webview-element-extract.js";
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
		const annotation = document.querySelector("[data-vetta-annotation]");
		expect(annotation).toBeTruthy();
		expect(pageClicked).toBe(false);
		annotation?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		const result = await pick;

		expect(result.role).toBe("button");
		expect(result.accessibleName).toBe("Go");
		expect(result.domPath).toBe("button#go");
		expect(result.sourceHint).toBeUndefined();
		expect(result.comment).toBe("");
		expect(document.getElementById(IN_APP_BROWSER_PICKER_ROOT_ID)).toBeNull();
	});

	it("点选带 data-insp-path 的元素时带回文件位置，并拒绝 javascript 地址", async () => {
		document.body.innerHTML = `<button id="go" data-insp-path="src/App.tsx:12:3">Go</button><a id="bad" data-source="javascript:alert(1)">Bad</a>`;
		const button = document.getElementById("go");
		if (!button) throw new Error("missing button");
		const pick = runInAppBrowserGuestCommand("start") as Promise<Record<string, unknown>>;
		button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 8, clientY: 8 }));
		const field = document.querySelector("[data-vetta-annotation] textarea");
		if (!(field instanceof HTMLTextAreaElement)) throw new Error("missing annotation");
		field.value = "把按钮改成蓝色";
		field.closest("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		await expect(pick).resolves.toMatchObject({
			sourceHint: { kind: "attribute", file: "src/App.tsx", line: 12, column: 3 },
			comment: "把按钮改成蓝色",
		});

		const bad = document.getElementById("bad");
		if (!bad) throw new Error("missing link");
		expect(readBrowserElementSourceHint(bad)).toBeUndefined();
	});

	it("Shift+点击把后选的元素留在同一次批注里", async () => {
		document.body.innerHTML = `<button id="a">A</button><button id="b">B</button>`;
		const first = document.getElementById("a");
		const second = document.getElementById("b");
		if (!first || !second) throw new Error("missing buttons");
		const pick = runInAppBrowserGuestCommand("start") as Promise<Record<string, unknown>>;
		first.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 4, clientY: 4 }));
		second.dispatchEvent(
			new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 20, clientY: 4, shiftKey: true }),
		);
		const field = document.querySelector("[data-vetta-annotation] textarea");
		if (!(field instanceof HTMLTextAreaElement)) throw new Error("missing annotation");
		field.value = "让 B 和 A 一样";
		field.closest("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		const result = await pick;
		expect(result.domPath).toBe("button#a");
		expect(result.companions).toEqual([expect.objectContaining({ domPath: "button#b" })]);
		expect(result.comment).toBe("让 B 和 A 一样");
	});

	it("Alt+点击把元素放进输入，不打开旁边批注", async () => {
		document.body.innerHTML = `<button id="go">Go</button>`;
		const button = document.getElementById("go");
		if (!button) throw new Error("missing button");
		const pick = runInAppBrowserGuestCommand("start") as Promise<Record<string, unknown>>;
		button.dispatchEvent(
			new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 8, clientY: 8, altKey: true }),
		);
		const result = await pick;
		expect(result).toMatchObject({ role: "button", placement: "input" });
		expect(result.comment).toBeUndefined();
		expect(document.querySelector("[data-vetta-annotation]")).toBeNull();
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
		document
			.querySelector("[data-vetta-annotation]")
			?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
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
