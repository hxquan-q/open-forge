// Copyright The Open Forge contributors.
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { HtmlPreviewView } from "./HtmlPreviewView";

it("loads a file-backed document through src instead of inlining it", () => {
	const markup = renderToStaticMarkup(
		<HtmlPreviewView src="vetta-file://local/site/index.html" revision={2} content="<p>inline</p>" title="HTML preview" />,
	);

	expect(markup).toContain('src="vetta-file://local/site/index.html"');
	expect(markup).not.toContain("srcdoc");
	expect(markup).not.toContain("inline");
	expect(markup).toContain('title="HTML preview"');
	expect(markup).toContain('sandbox="allow-scripts allow-same-origin allow-popups allow-forms"');
});

it("keeps the srcDoc path for inline documents", () => {
	const markup = renderToStaticMarkup(
		<HtmlPreviewView content="<html><head></head><body><p>hello</p></body></html>" title="HTML preview" />,
	);

	expect(markup).toMatch(/srcdoc=/i);
	expect(markup).not.toContain("<iframe src=");
	// Chrome CSS is injected into the document so the frame scrollbars match the app.
	expect(markup).toContain("data-preview-chrome");
	expect(markup).toContain("hello");
});

it("renders the first frame immediately and reports loading separately", () => {
	const markup = renderToStaticMarkup(
		<HtmlPreviewView src="vetta-file://local/site/index.html" title="HTML preview" />,
	);

	// The old gate hid the whole frame behind opacity-0 until onLoad; only the bar may signal loading now.
	expect(markup).not.toContain("opacity-0");
	expect(markup).toContain('aria-busy="true"');
	expect(markup).toContain("data-preview-loading");
});
