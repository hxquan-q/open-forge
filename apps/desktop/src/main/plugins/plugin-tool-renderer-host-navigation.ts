// Copyright The Open Forge contributors.
import type { PluginToolRendererHostLifecycle } from "./plugin-tool-renderer-host-lifecycle.js";

/**
 * The navigation events that decide whether the plugin tool renderer document is
 * still alive. Kept structural so the Electron wiring can be exercised without a
 * BrowserWindow, and narrow enough that the production WebContents satisfies it.
 */
export interface PluginToolRendererHostNavigationSource {
	on(
		event: "did-start-navigation",
		listener: (details: { isMainFrame: boolean; isSameDocument: boolean }) => void,
	): unknown;
	removeListener(
		event: "did-start-navigation",
		listener: (details: { isMainFrame: boolean; isSameDocument: boolean }) => void,
	): unknown;
}

/**
 * Invalidates the renderer-side plugin tool lease when a main-frame navigation
 * starts. The renderer only reports readiness again after the plugin host has
 * finished loading the replacement document.
 */
export function attachPluginToolRendererHostNavigation(
	source: PluginToolRendererHostNavigationSource,
	host: Pick<PluginToolRendererHostLifecycle, "markLoading">,
): () => void {
	const onDidStartNavigation = (details: { isMainFrame: boolean; isSameDocument: boolean }): void => {
		if (!details.isMainFrame || details.isSameDocument) return;
		host.markLoading();
	};
	source.on("did-start-navigation", onDidStartNavigation);
	return () => source.removeListener("did-start-navigation", onDidStartNavigation);
}
