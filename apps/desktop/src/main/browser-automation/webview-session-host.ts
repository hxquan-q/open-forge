// Copyright The Open Forge contributors.
import type { Input, WebContents } from "electron";
import { getEffectiveShortcut } from "../../shared/shortcuts.js";
import { readDesktopConfig } from "../config/desktop-config-store.js";
import { IN_APP_BROWSER_DOM_MUTATION_SENTINEL } from "./webview-picker-guest.js";
import { getInAppBrowserSessionController } from "./webview-session-controller.js";
import { matchShortcutCombo } from "./webview-shortcut-match.js";

/**
 * WebContentsView 路径（TASK-0072）：view 按 workspace 创建时就已知归属，
 * 直接 attach——历史上 <webview> 的 did-attach-webview/partition 匹配
 * attachUnbound 竞态已随迁移移除。
 */
export function bindInAppBrowserViewContents(webContents: WebContents, workspaceId: string): void {
	const controller = getInAppBrowserSessionController();
	controller.attachWebContents(workspaceId, webContents);

	const bump = (url?: string): void => {
		controller.bumpRevision(workspaceId, { url, title: webContents.getTitle() });
	};

	webContents.on("did-navigate", (_event, url) => {
		if (url === "about:blank") return;
		bump(url);
	});
	webContents.on("did-navigate-in-page", (_event, url, isMainFrame) => {
		if (!isMainFrame || url === "about:blank") return;
		bump(url);
	});
	webContents.on("dom-ready", () => {
		controller.attachWebContents(workspaceId, webContents);
	});
	webContents.on("console-message", (_event, _level, message) => {
		if (message !== IN_APP_BROWSER_DOM_MUTATION_SENTINEL) return;
		controller.bumpRevision(workspaceId);
	});
	webContents.on("before-input-event", (event, input) => {
		void handleBrowserGuestInput(workspaceId, event, input);
	});
	webContents.once("destroyed", () => {
		controller.detachWebContents(webContents);
	});
}

async function handleBrowserGuestInput(
	workspaceId: string,
	event: { preventDefault: () => void },
	input: Input,
): Promise<void> {
	const controller = getInAppBrowserSessionController();
	const config = await readDesktopConfig();
	const combo = getEffectiveShortcut("browser-element-picker", config.shortcuts?.bindings ?? {});
	if (matchShortcutCombo(input, combo)) {
		event.preventDefault();
		await controller.setPicker(workspaceId, !controller.getSession(workspaceId).pickerEnabled);
		return;
	}
	if (input.key === "Escape" && controller.getSession(workspaceId).pickerEnabled) {
		event.preventDefault();
		await controller.setPicker(workspaceId, false);
	}
}
