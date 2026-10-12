// Modified by The Open Forge contributors.
/**
 * Desktop production staging layout.
 *
 * The pack step copies build output to these top-level directories inside the
 * Electron app archive. Runtime code in packaged mode must resolve resources
 * relative to this layout, not the development dist/ directory.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// 品牌档案与主链同开关（VETTA_BRAND_PROFILE）：默认外部分发档，显式 self 回 Open Forge。
const desktopBrand = require(
	process.env.VETTA_BRAND_PROFILE === "self"
		? "../src/shared/desktop-brand.json"
		: "../src/shared/desktop-brand.distribution.json",
);

export const DESKTOP_BUILD_OUTPUTS = Object.freeze([
	{ source: "dist/main", target: "main" },
	{ source: "dist/preload", target: "preload" },
	{ source: "dist/renderer", target: "renderer" },
	{ source: "dist/ocr-preload", target: "ocr-preload" },
	{ source: "dist/ocr-runner", target: "ocr-runner" },
]);

export const DESKTOP_LEGAL_FILES = Object.freeze(["LICENSE", "NOTICE"]);

export const DESKTOP_LEGAL_RESOURCE = Object.freeze({
	from: "legal",
	to: "legal",
	filter: DESKTOP_LEGAL_FILES,
});

export const VETTA_PLUGIN_FILE_ASSOCIATION = Object.freeze({
	ext: "vettapkg",
	name: `${desktopBrand.displayName} Plugin Package`,
	description: `Installable ${desktopBrand.displayName} plugin package`,
	mimeType: "application/vnd.vetta.plugin+zip",
	role: "Editor",
});

export const DESKTOP_REQUIRED_SOURCE_FILES = Object.freeze([
	"src/main/main.ts",
	"src/preload/index.ts",
	"src/preload/remote-desktop.ts",
	"src/renderer/index.html",
	"src/renderer/remote-desktop-host.html",
]);
