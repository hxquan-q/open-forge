// Copyright The Open Forge contributors.
import type { Input, WebContents } from "electron";
import { session as electronSession } from "electron";
import { getEffectiveShortcut } from "../../shared/shortcuts.js";
import { readDesktopConfig } from "../config/desktop-config-store.js";
import { IN_APP_BROWSER_DOM_MUTATION_SENTINEL } from "./webview-picker-guest.js";
import { getInAppBrowserSessionController, IN_APP_BROWSER_PARTITION } from "./webview-session-controller.js";
import { matchShortcutCombo } from "./webview-shortcut-match.js";

export function isInAppBrowserWebContents(webContents: WebContents): boolean {
	try {
		return webContents.session === electronSession.fromPartition(IN_APP_BROWSER_PARTITION);
	} catch {
		return false;
	}
}

export function bindInAppBrowserWebview(webContents: WebContents): void {
	if (!isInAppBrowserWebContents(webContents)) return;
	wireInAppBrowserContents(webContents, null);
}

/**
 * WebContentsView 路径（TASK-0072）：view 按 workspace 创建时就已知归属，
 * 直接 attach，不走 did-attach-webview 的 attachUnbound 竞态。
 */
export function bindInAppBrowserViewContents(webContents: WebContents, workspaceId: string): void {
	getInAppBrowserSessionController().attachWebContents(workspaceId, webContents);
	wireInAppBrowserContents(webContents, workspaceId);
}

function wireInAppBrowserContents(webContents: WebContents, workspaceId: string | null): void {
	const controller = getInAppBrowserSessionController();
	if (!workspaceId) controller.attachUnboundWebContents(webContents);

	const resolveWorkspaceId = (): string | undefined =>
		workspaceId ?? controller.workspaceIdForContents(webContents.id);
	const bump = (url?: string): void => {
		const id = resolveWorkspaceId();
		if (!id) return;
		controller.bumpRevision(id, { url, title: webContents.getTitle() });
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
		const id = resolveWorkspaceId();
		if (id) controller.attachWebContents(id, webContents);
		else controller.attachUnboundWebContents(webContents);
	});
	webContents.on("console-message", (_event, _level, message) => {
		if (message !== IN_APP_BROWSER_DOM_MUTATION_SENTINEL) return;
		const id = resolveWorkspaceId();
		if (id) controller.bumpRevision(id);
	});
	webContents.on("before-input-event", (event, input) => {
		void handleBrowserGuestInput(webContents, event, input);
	});
	webContents.once("destroyed", () => {
		controller.detachWebContents(webContents);
	});
}

async function handleBrowserGuestInput(
	webContents: WebContents,
	event: { preventDefault: () => void },
	input: Input,
): Promise<void> {
	const controller = getInAppBrowserSessionController();
	const workspaceId = controller.workspaceIdForContents(webContents.id);
	if (!workspaceId) return;
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
