// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import {
	collectPreviewAssets,
	extractPreviewAssetReferences,
	isHtmlPreviewExtension,
	MAX_PREVIEW_ASSET_DIRECTORIES,
	matchesPreviewAssetChange,
	previewFileUrl,
} from "./preview-assets";

describe("previewFileUrl", () => {
	it("maps local absolute paths onto the vetta-file scheme", () => {
		expect(previewFileUrl("C:\\workspace\\site\\index.html")).toBe(
			"vetta-file://local/C%3A/workspace/site/index.html",
		);
		expect(previewFileUrl("/home/me/site/index.html")).toBe("vetta-file://local/home/me/site/index.html");
		expect(previewFileUrl("\\\\server\\share\\index.html")).toContain("vetta-file://local/");
	});

	it("keeps the ssh origin for remote projects", () => {
		expect(previewFileUrl("ssh://box/home/me/site/index.html")).toBe(
			"vetta-file://local/ssh%3A//box/home/me/site/index.html",
		);
	});

	it("returns undefined for sources that already hold content or have no file base", () => {
		expect(previewFileUrl(undefined)).toBeUndefined();
		expect(previewFileUrl("   ")).toBeUndefined();
		expect(previewFileUrl("relative/index.html")).toBeUndefined();
		expect(previewFileUrl("https://example.test/index.html")).toBeUndefined();
		expect(previewFileUrl("data:text/html,<p>hi</p>")).toBeUndefined();
		expect(previewFileUrl("vetta-file://local/C%3A/workspace/site/index.html")).toBeUndefined();
	});
});

describe("isHtmlPreviewExtension", () => {
	it("accepts the three HTML document extensions regardless of case", () => {
		for (const extension of ["html", "htm", "xhtml", "HTML"]) {
			expect(isHtmlPreviewExtension(extension)).toBe(true);
		}
		expect(isHtmlPreviewExtension("md")).toBe(false);
		expect(isHtmlPreviewExtension("")).toBe(false);
	});
});

describe("extractPreviewAssetReferences", () => {
	it("collects src/href attributes and CSS url() references in every quoting style", () => {
		const html = [
			'<link rel="stylesheet" href="styles/app.css">',
			"<script src='./app.js'></script>",
			"<img src=logo.png>",
			"<style>body { background: url('img/bg.png'); }</style>",
			'<div style="background-image: url(img/hero.png)"></div>',
			"<style>.a { mask: url(icons/mask.svg#icon); }</style>",
		].join("\n");

		expect([...extractPreviewAssetReferences(html)].sort()).toEqual(
			["./app.js", "icons/mask.svg", "img/bg.png", "img/hero.png", "logo.png", "styles/app.css"].sort(),
		);
	});

	it("drops anchors, protocol-relative URLs and external schemes", () => {
		const html = [
			'<a href="#section">anchor</a>',
			'<script src="//cdn.example.test/lib.js"></script>',
			'<link href="https://example.test/site.css">',
			'<img src="data:image/png;base64,AAAA">',
			'<a href="mailto:dev@example.test">mail</a>',
			'<img src="">',
		].join("\n");

		expect(extractPreviewAssetReferences(html)).toEqual([]);
	});

	it("strips query and fragment but keeps Windows drive paths", () => {
		const html = '<link href="styles/app.css?v=2"><img src="C:/shared/logo.png">';
		expect(extractPreviewAssetReferences(html)).toEqual(["styles/app.css", "C:/shared/logo.png"]);
	});
});

describe("collectPreviewAssets", () => {
	it("resolves references against the HTML directory and lists the extra directories to watch", () => {
		const html = [
			'<link rel="stylesheet" href="styles/app.css">',
			'<script src="./app.js"></script>',
			'<img src="/assets/logo.png">',
		].join("\n");

		const assets = collectPreviewAssets(html, "C:\\workspace\\site\\index.html");

		expect([...assets.paths].sort()).toEqual(
			["C:/assets/logo.png", "C:/workspace/site/app.js", "C:/workspace/site/styles/app.css"].sort(),
		);
		expect([...assets.directories].sort()).toEqual(["C:/assets", "C:/workspace/site/styles"].sort());
	});

	it("keeps the ssh origin on remote projects", () => {
		const assets = collectPreviewAssets(
			'<link href="styles/app.css"><link href="../shared/base.css">',
			"ssh://box/home/me/site/index.html",
		);

		expect([...assets.paths].sort()).toEqual([
			"ssh://box/home/me/shared/base.css",
			"ssh://box/home/me/site/styles/app.css",
		]);
		expect([...assets.directories].sort()).toEqual(["ssh://box/home/me/shared", "ssh://box/home/me/site/styles"]);
	});

	it("does not watch the HTML's own directory twice", () => {
		const assets = collectPreviewAssets('<script src="app.js"></script>', "C:\\workspace\\site\\index.html");
		expect(assets.directories).toEqual([]);
	});

	it("returns nothing when the preview has no file base", () => {
		expect(collectPreviewAssets('<img src="logo.png">', undefined)).toEqual({ paths: new Set(), directories: [] });
		expect(collectPreviewAssets('<img src="logo.png">', "https://example.test/index.html")).toEqual({
			paths: new Set(),
			directories: [],
		});
	});

	it("caps the number of watched asset directories", () => {
		const html = Array.from({ length: MAX_PREVIEW_ASSET_DIRECTORIES + 4 }, (_, index) => {
			return `<img src="dir${index}/logo.png">`;
		}).join("\n");

		const assets = collectPreviewAssets(html, "C:\\workspace\\site\\index.html");

		expect(assets.paths.size).toBe(MAX_PREVIEW_ASSET_DIRECTORIES + 4);
		expect(assets.directories).toHaveLength(MAX_PREVIEW_ASSET_DIRECTORIES);
	});
});

describe("matchesPreviewAssetChange", () => {
	const assets = collectPreviewAssets(
		'<link href="styles/app.css"><script src="app.js"></script>',
		"C:\\workspace\\site\\index.html",
	);

	it("matches the referenced file name inside the HTML directory", () => {
		expect(matchesPreviewAssetChange(assets, "C:\\workspace\\site", ["app.js"])).toBe(true);
		expect(matchesPreviewAssetChange(assets, "C:/workspace/site", ["other.html"])).toBe(false);
	});

	it("matches the referenced file name inside an asset directory", () => {
		expect(matchesPreviewAssetChange(assets, "C:\\workspace\\site\\styles", ["app.css"])).toBe(true);
		expect(matchesPreviewAssetChange(assets, "C:\\workspace\\site\\styles", ["theme.css"])).toBe(false);
	});

	it("falls back to directory-level matching only when the host reports no file names", () => {
		expect(matchesPreviewAssetChange(assets, "C:\\workspace\\site\\styles", undefined)).toBe(true);
		expect(matchesPreviewAssetChange(assets, "C:\\workspace\\site", undefined)).toBe(false);
		expect(matchesPreviewAssetChange(assets, "C:\\workspace\\site", [])).toBe(false);
	});
});
