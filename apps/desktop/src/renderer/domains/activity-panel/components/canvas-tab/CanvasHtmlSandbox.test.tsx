// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	CANVAS_HTML_PARTITION,
	CANVAS_HTML_WEB_PREFERENCES,
} from "../../services/canvas-html-sandbox";
import { CanvasHtmlSandbox } from "./CanvasHtmlSandbox";

afterEach(() => cleanup());

describe("CanvasHtmlSandbox", () => {
	it("把隔离 webview 属性落到 DOM，并拦截跳出文档的导航", () => {
		const onNavigate = vi.fn();
		const { container } = render(
			<CanvasHtmlSandbox src="data:text/html,hi" label="activityPanel.canvas.htmlSandboxLabel" onNavigate={onNavigate} />,
		);
		const guest = container.querySelector("webview");
		expect(guest).toBeTruthy();
		expect(guest?.getAttribute("partition")).toBe(CANVAS_HTML_PARTITION);
		expect(guest?.getAttribute("webpreferences")).toBe(CANVAS_HTML_WEB_PREFERENCES);
		expect(guest?.getAttribute("allowpopups")).not.toBe("true");
		expect(guest?.hasAttribute("disablewebsecurity")).toBe(false);
		expect(guest?.hasAttribute("preload")).toBe(false);
		expect(guest?.getAttribute("aria-label")).toBe("activityPanel.canvas.htmlSandboxLabel");

		guest?.dispatchEvent(Object.assign(new Event("will-navigate", { cancelable: true }), { url: "https://evil.example" }));
		expect(onNavigate).toHaveBeenCalledWith("https://evil.example");

		onNavigate.mockClear();
		guest?.dispatchEvent(Object.assign(new Event("will-navigate", { cancelable: true }), { url: "javascript:alert(1)" }));
		expect(onNavigate).not.toHaveBeenCalled();
	});
});
