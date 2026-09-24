// Copyright The Open Forge contributors.

/** In-memory partition; must not reuse persist:vetta-browser. */
export const CANVAS_HTML_PARTITION = "vetta-canvas-html";

/** Guest prefs: isolated renderer, no Node, no privileged preload. */
export const CANVAS_HTML_WEB_PREFERENCES = "contextIsolation=yes, nodeIntegration=no, sandbox=yes";

export const CANVAS_HTML_CSP =
	"default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

export type CanvasHtmlNavigationDecision = "allow" | "block" | "external";

export function canvasHtmlWebviewAttributes(): {
	readonly partition: string;
	readonly webpreferences: string;
	readonly allowpopups: false;
	readonly disablewebsecurity: false;
} {
	return {
		partition: CANVAS_HTML_PARTITION,
		webpreferences: CANVAS_HTML_WEB_PREFERENCES,
		allowpopups: false,
		disablewebsecurity: false,
	};
}

export function wrapCanvasHtmlDocument(content: string): string {
	const csp = `<meta http-equiv="Content-Security-Policy" content="${CANVAS_HTML_CSP}">`;
	if (/<head(\s[^>]*)?>/i.test(content)) {
		return content.replace(/<head(\s[^>]*)?>/i, (open) => `${open}${csp}`);
	}
	if (/<html(\s[^>]*)?>/i.test(content)) {
		return content.replace(/<html(\s[^>]*)?>/i, (open) => `${open}<head><meta charset="utf-8">${csp}</head>`);
	}
	return `<!DOCTYPE html><html><head><meta charset="utf-8">${csp}</head><body>${content}</body></html>`;
}

export function canvasHtmlDataUrl(content: string): string {
	return `data:text/html;charset=utf-8,${encodeURIComponent(wrapCanvasHtmlDocument(content))}`;
}

export function classifyCanvasHtmlNavigation(url: string): CanvasHtmlNavigationDecision {
	if (url === "about:blank" || url.startsWith("data:text/html")) return "allow";
	if (/^https?:\/\//i.test(url)) return "external";
	return "block";
}
