// Modified by The Open Forge contributors.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	DESKTOP_BUILD_OUTPUTS,
	DESKTOP_LEGAL_FILES,
	DESKTOP_LEGAL_RESOURCE,
	DESKTOP_REQUIRED_SOURCE_FILES,
	VETTA_PLUGIN_FILE_ASSOCIATION,
} from "./desktop-packaging-layout.mjs";
import { stageDesktopLegalResources } from "./stage-desktop-legal-resources.mjs";

const desktopRoot = join(import.meta.dirname, "..");

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

test("packaged Desktop registers the dedicated Vetta plugin package type", () => {
	assert.deepEqual(VETTA_PLUGIN_FILE_ASSOCIATION, {
		ext: "vettapkg",
		name: "Open Forge Plugin Package",
		description: "Installable Open Forge plugin package",
		mimeType: "application/vnd.vetta.plugin+zip",
		role: "Editor",
	});
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
