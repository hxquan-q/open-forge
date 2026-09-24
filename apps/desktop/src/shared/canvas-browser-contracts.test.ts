// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { BROWSER_TAB_CHANNELS, unimplementedBrowserTabResult } from "./browser-tab-ipc.js";
import { CANVAS_CHANNELS, unimplementedCanvasResult } from "./canvas-ipc.js";
import { DESKTOP_IPC_UNIMPLEMENTED, isDesktopIpcUnimplemented } from "./desktop-ipc-result.js";
import enChat from "./i18n/locales/en/chat.json";
import enSettings from "./i18n/locales/en/settings.json";
import zhChat from "./i18n/locales/zh/chat.json";
import zhSettings from "./i18n/locales/zh/settings.json";
import { getEffectiveShortcut, isShortcutActionId, SHORTCUT_ACTIONS } from "./shortcuts.js";

describe("canvas / browser tab IPC stubs", () => {
	it("冻结 channel 名，避免下游改写聚合文件", () => {
		expect(CANVAS_CHANNELS).toEqual({
			LIST: "vetta:canvas:list",
			GET: "vetta:canvas:get",
			SAVE_TO_PROJECT: "vetta:canvas:save-to-project",
			DELETE: "vetta:canvas:delete",
		});
		expect(BROWSER_TAB_CHANNELS).toEqual({
			GET_SESSION: "vetta:browser-tab:session",
			SET_PICKER: "vetta:browser-tab:set-picker",
			CROP_SCREENSHOT: "vetta:browser-tab:crop-screenshot",
			LIVE_EDIT: "vetta:browser-tab:live-edit",
			EVENT: "vetta:browser-tab:event",
		});
	});

	it("未实现时返回明确 unimplemented", () => {
		const canvas = unimplementedCanvasResult();
		const browser = unimplementedBrowserTabResult();
		expect(canvas).toEqual({
			ok: false,
			code: DESKTOP_IPC_UNIMPLEMENTED,
			message: "canvas is not implemented",
		});
		expect(isDesktopIpcUnimplemented(browser)).toBe(true);
	});
});

describe("browser-element-picker shortcut", () => {
	it("注册为 app 作用域，默认 mod+shift+d", () => {
		expect(isShortcutActionId("browser-element-picker")).toBe(true);
		const action = SHORTCUT_ACTIONS.find((item) => item.id === "browser-element-picker");
		expect(action).toMatchObject({
			defaultShortcut: "mod+shift+d",
			scope: "app",
			labelKey: "shortcutBrowserElementPickerLabel",
		});
		expect(getEffectiveShortcut("browser-element-picker")).toBe("mod+shift+d");
	});
});

describe("canvas / browser i18n skeleton", () => {
	it("冻结下游 tab / picker / 快捷键文案 key，worker 不再改 locale", () => {
		expect(zhChat.activityPanel.tabs.canvas).toBeTypeOf("string");
		expect(enChat.activityPanel.tabs.canvas).toBeTypeOf("string");
		expect(zhChat.activityPanel.canvas.empty).toBeTypeOf("string");
		expect(enChat.activityPanel.canvas.saveToProject).toBeTypeOf("string");
		expect(zhChat.browser.picker).toBeTypeOf("string");
		expect(enChat.browser.elementAttached).toBeTypeOf("string");
		expect(zhSettings.shortcutBrowserElementPickerLabel).toBeTypeOf("string");
		expect(enSettings.shortcutBrowserElementPickerDesc).toBeTypeOf("string");
	});
});
