// Copyright The Open Forge contributors.
import type { PluginToolRendererHostLifecycle } from "./plugin-tool-renderer-host-lifecycle.js";

/**
 * The committed-navigation event that decides whether the plugin tool renderer
 * document is still alive. Kept structural so the Electron wiring can be
 * exercised without a BrowserWindow, and narrow enough that the production
 * WebContents satisfies it.
 */
export interface PluginToolRendererHostNavigationSource {
	on(event: "did-navigate", listener: () => void): unknown;
	removeListener(event: "did-navigate", listener: () => void): unknown;
}

/**
 * Invalidates the renderer-side plugin tool lease once a main-frame navigation
 * has committed. `did-start-navigation` cannot be used here: it fires before
 * `will-navigate`, so a navigation the window manager cancels still emits it and
 * would strand the host in `loading` with no document reload to report readiness
 * again. `did-navigate` is only emitted after a main-frame navigation commits,
 * and it is not emitted for in-page navigations.
 */
export function attachPluginToolRendererHostNavigation(
	source: PluginToolRendererHostNavigationSource,
	host: Pick<PluginToolRendererHostLifecycle, "markLoading">,
	onDocumentInvalidated?: () => void,
): () => void {
	const onDidNavigate = (): void => {
		host.markLoading();
		onDocumentInvalidated?.();
	};
	source.on("did-navigate", onDidNavigate);
	return () => source.removeListener("did-navigate", onDidNavigate);
}
