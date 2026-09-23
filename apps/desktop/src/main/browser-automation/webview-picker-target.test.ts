// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { afterEach, describe, expect, it } from "vitest";
import { chooseInAppBrowserPickTarget, type InAppBrowserPickPointEvent } from "./webview-picker-target.js";

const OVERLAY_ID = "__vetta-in-app-browser-picker";

afterEach(() => {
	document.body.innerHTML = "";
});

function rect(width: number, height: number): DOMRect {
	return { x: 0, y: 0, width, height, top: 0, left: 0, right: width, bottom: height, toJSON: () => ({}) };
}

function clickEvent(target: Element, clientX = 20, clientY = 20): InAppBrowserPickPointEvent {
	return { target, clientX, clientY };
}

describe("chooseInAppBrowserPickTarget", () => {
	it("空白点到 body 时不产生 html/body 目标，保持可继续点选", () => {
		document.body.innerHTML = `<button id="go">Go</button>`;
		Object.defineProperty(document.body, "getBoundingClientRect", {
			value: () => rect(window.innerWidth, window.innerHeight),
			configurable: true,
		});
		document.elementsFromPoint = () => [document.body, document.documentElement];
		const chosen = chooseInAppBrowserPickTarget(clickEvent(document.body), document, OVERLAY_ID);
		expect(chosen).toBeNull();
	});

	it("点到按钮时选中 button，而不是视口", () => {
		document.body.innerHTML = `<form><button type="submit" id="go">Go</button></form>`;
		const button = document.getElementById("go");
		if (!button) throw new Error("missing button");
		Object.defineProperty(button, "getBoundingClientRect", {
			value: () => rect(80, 24),
			configurable: true,
		});
		document.elementsFromPoint = () => [button, document.body, document.documentElement];
		const chosen = chooseInAppBrowserPickTarget(clickEvent(button), document, OVERLAY_ID);
		expect(chosen).toBe(button);
	});

	it("满屏装饰容器包住按钮时，点按钮中心仍选中按钮", () => {
		document.body.innerHTML = `<div id="wrap" style="position:fixed;width:100vw;height:100vh"><button id="go">Go</button></div>`;
		const wrap = document.getElementById("wrap");
		const button = document.getElementById("go");
		if (!wrap || !button) throw new Error("missing nodes");
		Object.defineProperty(wrap, "getBoundingClientRect", {
			value: () => rect(window.innerWidth, window.innerHeight),
			configurable: true,
		});
		Object.defineProperty(button, "getBoundingClientRect", {
			value: () => rect(64, 20),
			configurable: true,
		});
		document.elementsFromPoint = () => [button, wrap, document.body, document.documentElement];
		const chosen = chooseInAppBrowserPickTarget(clickEvent(button), document, OVERLAY_ID);
		expect(chosen).toBe(button);
	});

	it("点在满屏装饰容器的空白处时拒绝整页容器", () => {
		document.body.innerHTML = `<div id="wrap" style="position:fixed;width:100vw;height:100vh"><button id="go">Go</button></div>`;
		const wrap = document.getElementById("wrap");
		if (!wrap) throw new Error("missing wrap");
		Object.defineProperty(wrap, "getBoundingClientRect", {
			value: () => rect(window.innerWidth, window.innerHeight),
			configurable: true,
		});
		document.elementsFromPoint = () => [wrap, document.body, document.documentElement];
		const chosen = chooseInAppBrowserPickTarget(clickEvent(wrap), document, OVERLAY_ID);
		expect(chosen).toBeNull();
	});
});
