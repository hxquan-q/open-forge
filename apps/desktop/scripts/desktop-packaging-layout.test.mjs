// Modified by The Open Forge contributors.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
	DESKTOP_BUILD_OUTPUTS,
	DESKTOP_LEGAL_FILES,
	DESKTOP_LEGAL_RESOURCE,
	DESKTOP_REQUIRED_SOURCE_FILES,
	VETTA_PLUGIN_FILE_ASSOCIATION,
} from "./desktop-packaging-layout.mjs";
import { stageDesktopLegalResources } from "./stage-desktop-legal-resources.mjs";

const desktopRoot = join(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const layoutModuleUrl = pathToFileURL(join(import.meta.dirname, "desktop-packaging-layout.mjs")).href;

function associationNameFor(profile) {
	const childEnvironment = { ...process.env };
	if (profile === "unset") delete childEnvironment.VETTA_BRAND_PROFILE;
	else childEnvironment.VETTA_BRAND_PROFILE = profile;
	const result = spawnSync(
		process.execPath,
		[
			"-e",
			`import(${JSON.stringify(layoutModuleUrl)}).then((m) => console.log(m.VETTA_PLUGIN_FILE_ASSOCIATION.name))`,
		],
		{ cwd: import.meta.dirname, env: childEnvironment, encoding: "utf8" },
	);
	assert.equal(result.status, 0, result.stderr);
	return result.stdout.trim();
}

test("production build outputs have stable staging destinations", () => {
	assert.deepEqual(
		DESKTOP_BUILD_OUTPUTS,
		[
			{ source: "dist/main", target: "main" },
			{ source: "dist/preload", target: "preload" },
			{ source: "dist/renderer", target: "renderer" },
			{ source: "dist/ocr-preload", target: "ocr-preload" },
			{ source: "dist/ocr-runner", target: "ocr-runner" },
		],
	);
});

test("required source entry points exist", () => {
	for (const relativePath of DESKTOP_REQUIRED_SOURCE_FILES) {
		assert.ok(existsSync(join(desktopRoot, relativePath)), `missing Desktop source entry: ${relativePath}`);
	}
});

test("packaged Desktop registers the dedicated Vetta plugin package type declared by the active brand profile", () => {
	const activeBrand = require(
		process.env.VETTA_BRAND_PROFILE === "self"
			? "../src/shared/desktop-brand.json"
			: "../src/shared/desktop-brand.distribution.json",
	);
	assert.deepEqual(VETTA_PLUGIN_FILE_ASSOCIATION, {
		ext: "vettapkg",
		name: `${activeBrand.displayName} Plugin Package`,
		description: `Installable ${activeBrand.displayName} plugin package`,
		mimeType: "application/vnd.vetta.plugin+zip",
		role: "Editor",
	});

	// 默认（未设置 VETTA_BRAND_PROFILE）为外部分发档；显式 self 回到 Open Forge。
	assert.equal(associationNameFor("unset"), "Allstr ai Plugin Package");
	assert.equal(associationNameFor("self"), "Open Forge Plugin Package");
});

test("Desktop legal resources are staged with the complete repository license files", () => {
	const repoRoot = join(desktopRoot, "..", "..");
	const stagingRoot = mkdtempSync(join(tmpdir(), "openforge-desktop-legal-"));
	try {
		const legalDirectory = stageDesktopLegalResources(repoRoot, stagingRoot);
		assert.deepEqual(readdirSync(legalDirectory).sort(), [...DESKTOP_LEGAL_FILES].sort());
		for (const filename of DESKTOP_LEGAL_FILES) {
			assert.deepEqual(readFileSync(join(legalDirectory, filename)), readFileSync(join(repoRoot, filename)));
		}
		assert.deepEqual(DESKTOP_LEGAL_RESOURCE, {
			from: "legal",
			to: "legal",
			filter: DESKTOP_LEGAL_FILES,
		});
	} finally {
		rmSync(stagingRoot, { recursive: true, force: true });
	}
});
