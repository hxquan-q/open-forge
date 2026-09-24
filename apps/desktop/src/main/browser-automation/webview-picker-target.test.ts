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

function stubRect(element: Element, width: number, height: number): void {
	Object.defineProperty(element, "getBoundingClientRect", {
		value: () => rect(width, height),
		configurable: true,
	});
}

function stubViewportRect(element: Element): void {
	stubRect(element, window.innerWidth, window.innerHeight);
}

function clickEvent(target: Element, clientX = 20, clientY = 20): InAppBrowserPickPointEvent {
	return { target, clientX, clientY };
}

describe("chooseInAppBrowserPickTarget", () => {
	it("空白点到 body 时不产生 html/body 目标，保持可继续点选", () => {
		document.body.innerHTML = `<button id="go">Go</button>`;
		stubViewportRect(document.body);
		document.elementsFromPoint = () => [document.body, document.documentElement];
		const chosen = chooseInAppBrowserPickTarget(clickEvent(document.body), document, OVERLAY_ID);
		expect(chosen).toBeNull();
	});

	it("点击目标直接落到 html 文档根时同样拒绝（BUG-0006 保持）", () => {
		document.body.innerHTML = `<div id="app">content</div>`;
		document.elementsFromPoint = () => [document.documentElement];
		const chosen = chooseInAppBrowserPickTarget(clickEvent(document.documentElement), document, OVERLAY_ID);
		expect(chosen).toBeNull();
	});

	it("点到按钮时选中 button，而不是视口", () => {
		document.body.innerHTML = `<form><button type="submit" id="go">Go</button></form>`;
		const button = document.getElementById("go");
		if (!button) throw new Error("missing button");
		stubRect(button, 80, 24);
		document.elementsFromPoint = () => [button, document.body, document.documentElement];
		const chosen = chooseInAppBrowserPickTarget(clickEvent(button), document, OVERLAY_ID);
		expect(chosen).toBe(button);
	});

	it("满屏装饰容器包住按钮时，点按钮中心仍选中按钮", () => {
		document.body.innerHTML = `<div id="wrap" style="position:fixed;width:100vw;height:100vh"><button id="go">Go</button></div>`;
		const wrap = document.getElementById("wrap");
		const button = document.getElementById("go");
		if (!wrap || !button) throw new Error("missing nodes");
		stubViewportRect(wrap);
		stubRect(button, 64, 20);
		document.elementsFromPoint = () => [button, wrap, document.body, document.documentElement];
		const chosen = chooseInAppBrowserPickTarget(clickEvent(button), document, OVERLAY_ID);
		expect(chosen).toBe(button);
	});

	it("透明全屏捕获层下的按钮：pass-1 仍按视觉意图选中按钮", () => {
		document.body.innerHTML = `<div id="capture" style="position:fixed;width:100vw;height:100vh"></div><button id="go">Go</button>`;
		const capture = document.getElementById("capture");
		const button = document.getElementById("go");
		if (!capture || !button) throw new Error("missing nodes");
		stubViewportRect(capture);
		stubRect(button, 64, 20);
		document.elementsFromPoint = () => [capture, button, document.body, document.documentElement];
		const chosen = chooseInAppBrowserPickTarget(clickEvent(capture), document, OVERLAY_ID);
		expect(chosen).toBe(button);
	});

	it("全屏自定义 grid（无交互 role、有 onclick）被点击时直接选中，不被面积启发式拒绝", () => {
		document.body.innerHTML = `<div id="grid" onclick="void 0" style="position:fixed;width:100vw;height:100vh"></div>`;
		const grid = document.getElementById("grid");
		if (!grid) throw new Error("missing grid");
		stubViewportRect(grid);
		document.elementsFromPoint = () => [grid, document.body, document.documentElement];
		const chosen = chooseInAppBrowserPickTarget(clickEvent(grid), document, OVERLAY_ID);
		expect(chosen).toBe(grid);
	});

	it("全屏 canvas 应用被点击时选中 canvas，不被面积启发式拒绝", () => {
		document.body.innerHTML = `<canvas id="board" style="position:fixed;width:100vw;height:100vh"></canvas>`;
		const canvas = document.getElementById("board");
		if (!canvas) throw new Error("missing canvas");
		stubViewportRect(canvas);
		document.elementsFromPoint = () => [canvas, document.body, document.documentElement];
		const chosen = chooseInAppBrowserPickTarget(clickEvent(canvas), document, OVERLAY_ID);
		expect(chosen).toBe(canvas);
	});

	it("容器间空白点击选中承载布局的容器，而不是静默返回 null", () => {
		document.body.innerHTML = `
			<div id="layout" style="position:fixed;width:100vw;height:100vh;display:flex;flex-direction:column;gap:40px">
				<div id="panel-a" style="height:100px"></div>
				<div id="panel-b" style="height:100px"></div>
			</div>`;
		const layout = document.getElementById("layout");
		if (!layout) throw new Error("missing layout");
		stubViewportRect(layout);
		document.elementsFromPoint = () => [layout, document.body, document.documentElement];
		const chosen = chooseInAppBrowserPickTarget(clickEvent(layout, 20, 200), document, OVERLAY_ID);
		expect(chosen).toBe(layout);
	});

	it("点在满屏容器的空白处时回落到该容器（最深非 overlay 元素），文档根仍拒", () => {
		document.body.innerHTML = `<div id="wrap" style="position:fixed;width:100vw;height:100vh"><button id="go">Go</button></div>`;
		const wrap = document.getElementById("wrap");
		if (!wrap) throw new Error("missing wrap");
		stubViewportRect(wrap);
		document.elementsFromPoint = () => [wrap, document.body, document.documentElement];
		const chosen = chooseInAppBrowserPickTarget(clickEvent(wrap), document, OVERLAY_ID);
		expect(chosen).toBe(wrap);
	});

	it("面积启发式只拒 walk 祖先链：满屏装饰元素被跳过后仍落到物理点击目标", () => {
		document.body.innerHTML = `
			<div id="decor" style="position:fixed;width:100vw;height:100vh"></div>
			<span id="hit">cell</span>`;
		const decor = document.getElementById("decor");
		const hit = document.getElementById("hit");
		if (!decor || !hit) throw new Error("missing nodes");
		stubViewportRect(decor);
		document.elementsFromPoint = () => [decor, hit, document.body, document.documentElement];
		const chosen = chooseInAppBrowserPickTarget(clickEvent(hit), document, OVERLAY_ID);
		expect(chosen).toBe(hit);
	});
});
