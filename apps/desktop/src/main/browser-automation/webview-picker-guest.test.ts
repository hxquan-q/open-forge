// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { afterEach, describe, expect, it } from "vitest";
import { DESKTOP_BROWSER_ANNOTATION_CHROME_FALLBACK } from "../../shared/browser-tab-ipc.js";
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

	it("罩层接住指针时，仍命中下面的按钮并打开批注，页面按钮不触发", async () => {
		document.body.innerHTML = `<button id="go">Go</button>`;
		const button = document.getElementById("go");
		if (!button) throw new Error("missing button");
		let pageClicked = false;
		button.addEventListener("click", () => {
			pageClicked = true;
		});
		const pick = runInAppBrowserGuestCommand("start") as Promise<Record<string, unknown>>;
		const overlay = document.getElementById(IN_APP_BROWSER_PICKER_ROOT_ID);
		if (!(overlay instanceof HTMLElement)) throw new Error("missing overlay");
		expect(overlay.style.cursor).toBe("crosshair");
		expect(overlay.style.pointerEvents).toBe("auto");
		const original = document.elementsFromPoint.bind(document);
		document.elementsFromPoint = (x, y) => {
			if (overlay.style.display === "none") return [button];
			return [overlay, ...original(x, y)];
		};
		const down = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 8, clientY: 8 });
		overlay.dispatchEvent(down);
		expect(down.defaultPrevented).toBe(true);
		expect(document.querySelector("[data-vetta-annotation]")).toBeTruthy();
		expect(pageClicked).toBe(false);
		await runInAppBrowserGuestCommand("stop");
		await expect(pick).resolves.toEqual({ cancelled: true });
	});

	it("只有 pointerdown、没有后续 click 时，仍在元素旁打开批注且页面按钮不触发", async () => {
		document.body.innerHTML = `<button id="go">Go</button>`;
		const button = document.getElementById("go");
		if (!button) throw new Error("missing button");
		let pageClicked = false;
		button.addEventListener("click", () => {
			pageClicked = true;
		});
		const pick = runInAppBrowserGuestCommand("start") as Promise<Record<string, unknown>>;
		const down = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 8, clientY: 8 });
		button.dispatchEvent(down);
		expect(down.defaultPrevented).toBe(true);
		expect(document.querySelector("[data-vetta-annotation]")).toBeTruthy();
		expect(pageClicked).toBe(false);
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

	it("批注使用传入的浮层色，并写出已选数量", async () => {
		document.body.innerHTML = `<button id="go">Go</button>`;
		const button = document.getElementById("go");
		if (!button) throw new Error("missing button");
		const pick = runInAppBrowserGuestCommand("start", {
			placeholder: "要怎么改这个元素",
			send: "发送给 Agent",
			selectedCount: "已选 {count} 个",
			selectionLimit: "一次最多选择 4 个元素",
			chrome: {
				...DESKTOP_BROWSER_ANNOTATION_CHROME_FALLBACK,
				background: "rgb(255, 255, 255)",
				primary: "rgb(0, 0, 0)",
			},
		}) as Promise<Record<string, unknown>>;
		button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 8, clientY: 8 }));
		const box = document.querySelector("[data-vetta-annotation]");
		if (!(box instanceof HTMLElement)) throw new Error("missing annotation");
		expect(box.style.backgroundColor).toBe("rgb(255, 255, 255)");
		expect(box.style.borderRadius).toBe("0.5rem");
		expect(box.style.padding).toBe("10px");
		expect(box.style.boxShadow).toContain("0.18");
		expect(box.style.boxShadow).not.toContain("8px 24px");
		expect(box.style.fontSize).toBe("14px");
		const send = box.querySelector("button");
		expect(send?.style.backgroundColor).toBe("rgb(0, 0, 0)");
		expect(send?.style.height).toBe("32px");
		expect(document.querySelector("[data-vetta-selection-count]")?.textContent).toBe("已选 1 个");
		const field = box.querySelector("textarea");
		if (!(field instanceof HTMLTextAreaElement)) throw new Error("missing field");
		field.focus();
		expect(field.style.borderColor).toBe("rgb(228, 228, 228)");
		box.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		await pick;
	});

	it("没有传入主题时批注使用出厂 mono 暗色浮层", async () => {
		document.body.innerHTML = `<button id="go">Go</button>`;
		const button = document.getElementById("go");
		if (!button) throw new Error("missing button");
		const pick = runInAppBrowserGuestCommand("start") as Promise<Record<string, unknown>>;
		button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 8, clientY: 8 }));
		const box = document.querySelector("[data-vetta-annotation]");
		if (!(box instanceof HTMLElement)) throw new Error("missing annotation");
		expect(box.style.backgroundColor).toBe(DESKTOP_BROWSER_ANNOTATION_CHROME_FALLBACK.background);
		expect(document.querySelector("[data-vetta-selection-count]")?.textContent).toBe("1 selected");
		box.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		await pick;
	});

	it("拒绝把 url() 写进批注颜色，并在第 5 个元素时说明上限", async () => {
		document.body.innerHTML = `<button id="a">A</button><button id="b">B</button><button id="c">C</button><button id="d">D</button><button id="e">E</button>`;
		const ids = ["a", "b", "c", "d", "e"];
		const buttons = ids.map((id) => document.getElementById(id));
		if (buttons.some((button) => !button)) throw new Error("missing buttons");
		const pick = runInAppBrowserGuestCommand("start", {
			selectedCount: "已选 {count} 个",
			selectionLimit: "一次最多选择 4 个元素",
			chrome: { background: "red;background:url(https://evil.example/x)" },
		}) as Promise<Record<string, unknown>>;
		for (const [index, button] of buttons.entries()) {
			button?.dispatchEvent(
				new MouseEvent("click", {
					bubbles: true,
					cancelable: true,
					clientX: 8 + index,
					clientY: 8,
					shiftKey: index > 0,
				}),
			);
		}
		const box = document.querySelector("[data-vetta-annotation]");
		if (!(box instanceof HTMLElement)) throw new Error("missing annotation");
		expect(box.style.backgroundColor).toBe(DESKTOP_BROWSER_ANNOTATION_CHROME_FALLBACK.background);
		expect(document.querySelector("[data-vetta-selection-count]")?.textContent).toBe("已选 4 个");
		const limit = document.querySelector("[data-vetta-selection-limit]");
		expect(limit).toBeTruthy();
		expect((limit as HTMLElement).hidden).toBe(false);
		expect(limit?.textContent).toBe("一次最多选择 4 个元素");
		box.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		const result = await pick;
		expect(result.domPath).toBe("button#a");
		expect(result.companions).toHaveLength(3);
	});

	it("指针移到元素上时高亮框跟元素一样大", async () => {
		document.body.innerHTML = `<button id="go">Go</button>`;
		const button = document.getElementById("go");
		if (!button) throw new Error("missing button");
		button.getBoundingClientRect = () =>
			({
				x: 10,
				y: 20,
				width: 48,
				height: 24,
				top: 20,
				left: 10,
				right: 58,
				bottom: 44,
				toJSON: () => ({}),
			}) as DOMRect;
		const pick = runInAppBrowserGuestCommand("start") as Promise<Record<string, unknown>>;
		button.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 12, clientY: 22 }));
		const overlay = document.getElementById(IN_APP_BROWSER_PICKER_ROOT_ID);
		const highlight = overlay?.querySelector("div");
		if (!(highlight instanceof HTMLElement)) throw new Error("missing highlight");
		expect(highlight.style.width).toBe("48px");
		expect(highlight.style.height).toBe("24px");
		expect(highlight.style.borderRadius).toBe("0");
		await runInAppBrowserGuestCommand("stop");
		await expect(pick).resolves.toEqual({ cancelled: true });
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
