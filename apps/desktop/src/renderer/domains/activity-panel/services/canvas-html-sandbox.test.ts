// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import {
	CANVAS_HTML_CSP,
	CANVAS_HTML_PARTITION,
	CANVAS_HTML_WEB_PREFERENCES,
	canvasHtmlDataUrl,
	canvasHtmlWebviewAttributes,
	classifyCanvasHtmlNavigation,
	wrapCanvasHtmlDocument,
} from "./canvas-html-sandbox";

describe("canvas HTML sandbox policy", () => {
	it("webview 使用隔离 partition，且不放开 Node / same-origin / 弹窗", () => {
		const attributes = canvasHtmlWebviewAttributes();
		expect(attributes.partition).toBe(CANVAS_HTML_PARTITION);
		expect(attributes.partition.startsWith("persist:")).toBe(false);
		expect(attributes.webpreferences).toBe(CANVAS_HTML_WEB_PREFERENCES);
		expect(attributes.webpreferences).toContain("contextIsolation=yes");
		expect(attributes.webpreferences).toContain("nodeIntegration=no");
		expect(attributes.allowpopups).toBe(false);
		expect(attributes.disablewebsecurity).toBe(false);
		expect("preload" in attributes).toBe(false);
	});

	it("给不可信 HTML 注入默认拒绝的 CSP，并拦下跳出文档的导航", () => {
		const wrapped = wrapCanvasHtmlDocument("<h1>hello</h1>");
		expect(wrapped).toContain(`content="${CANVAS_HTML_CSP}"`);
		expect(wrapped).toContain("<h1>hello</h1>");
		expect(canvasHtmlDataUrl("<p>x</p>").startsWith("data:text/html;charset=utf-8,")).toBe(true);
		expect(classifyCanvasHtmlNavigation("data:text/html,hi")).toBe("allow");
		expect(classifyCanvasHtmlNavigation("https://example.com")).toBe("external");
		expect(classifyCanvasHtmlNavigation("file:///etc/passwd")).toBe("block");
		expect(classifyCanvasHtmlNavigation("javascript:alert(1)")).toBe("block");
	});
});
