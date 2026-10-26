// Modified by The Open Forge contributors.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LINUX_PACKAGE_METADATA, LINUX_RELEASE_TARGETS } from "./linux-packaging-contract.mjs";
import {
	normalizeArtifactFileNames,
	resolveDefaultTargets,
	resolveElectronBuilderPublishMode,
	resolveElectronBuilderTargets,
} from "./run-electron-builder.js";
import { WINDOWS_RELEASE_TARGETS } from "./windows-packaging-contract.mjs";

test("Linux release builds AppImage, Debian, and RPM artifacts together", () => {
	assert.deepEqual(resolveDefaultTargets("linux"), LINUX_RELEASE_TARGETS);
	assert.notEqual(resolveDefaultTargets("linux"), LINUX_RELEASE_TARGETS);
	assert.match(LINUX_PACKAGE_METADATA.author.email, /@/);
	assert.match(LINUX_PACKAGE_METADATA.maintainer, /<.+@.+>/);
	assert.match(LINUX_PACKAGE_METADATA.homepage, /^https:\/\//);
});

test("electron-builder never publishes unless the caller explicitly opts in", () => {
	assert.equal(resolveElectronBuilderPublishMode(undefined), "never");
	assert.equal(resolveElectronBuilderPublishMode("always"), "always");
});

test("Windows release builds Inno, MSI, and ZIP without exposing Inno to electron-builder", () => {
	assert.deepEqual(resolveDefaultTargets("win"), WINDOWS_RELEASE_TARGETS);
	assert.deepEqual(resolveElectronBuilderTargets("win", WINDOWS_RELEASE_TARGETS), {
		targets: ["dir", "msi", "zip"],
		usesInno: true,
	});
	assert.throws(
		() => resolveElectronBuilderTargets("linux", ["inno"]),
		/The inno target requires a Windows build/,
	);
});

test("release artifact file names drop spaces to match updater metadata", () => {
	const directory = mkdtempSync(join(tmpdir(), "openforge-artifact-names-"));
	try {
		writeFileSync(join(directory, "Allstr ai-0.1.3.AppImage"), "appimage");
		writeFileSync(join(directory, "Allstr ai-0.1.3.AppImage.blockmap"), "blockmap");
		writeFileSync(
			join(directory, "latest.yml"),
			"path: Allstr ai-0.1.3.AppImage\nfiles:\n  - url: Allstr%20ai-0.1.3.AppImage.blockmap\n",
		);
		mkdirSync(join(directory, "Allstr ai.app"));
		const renamed = normalizeArtifactFileNames(directory);
		assert.deepEqual(
			renamed.map(({ from, to }) => `${from}>${to}`).sort(),
			[
				"Allstr ai-0.1.3.AppImage>Allstr-ai-0.1.3.AppImage",
				"Allstr ai-0.1.3.AppImage.blockmap>Allstr-ai-0.1.3.AppImage.blockmap",
			].sort(),
		);
		assert.ok(existsSync(join(directory, "Allstr-ai-0.1.3.AppImage")));
		assert.ok(existsSync(join(directory, "Allstr-ai-0.1.3.AppImage.blockmap")));
		assert.ok(existsSync(join(directory, "Allstr ai.app")));
		const metadata = readFileSync(join(directory, "latest.yml"), "utf8");
		assert.match(metadata, /Allstr-ai-0\.1\.3\.AppImage/);
		assert.match(metadata, /Allstr-ai-0\.1\.3\.AppImage\.blockmap/);
		assert.doesNotMatch(metadata, /Allstr ai/);
		assert.doesNotMatch(metadata, /Allstr%20ai/);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("package scripts can build every Linux format independently", async () => {
	const packageJson = JSON.parse(await readFile(join(import.meta.dirname, "../package.json"), "utf8"));
	const scripts = packageJson.scripts;
	const expectedTargets = {
		"package:linux:appimage": "AppImage",
		"package:linux:deb": "deb",
		"package:linux:rpm": "rpm",
		"package:linux:tar.gz": "tar.gz",
	};

	assert.match(scripts["package:linux"], /--platform linux$/);
	assert.equal(scripts["dist:linux"], "bun run package:linux");
	assert.equal(scripts["package:linux:test"], "cross-env VETTA_BUILD_ENV=test bun run package:linux");
	for (const [scriptName, target] of Object.entries(expectedTargets)) {
		assert.match(scripts[scriptName], new RegExp(`--platform linux --target ${target}$`));
		assert.equal(scripts[`dist:${scriptName.slice("package:".length)}`], `bun run ${scriptName}`);
		assert.equal(
			scripts[`${scriptName}:test`],
			`cross-env VETTA_BUILD_ENV=test bun run ${scriptName}`,
		);
	}
});

test("package scripts can build every Windows format independently", async () => {
	const packageJson = JSON.parse(await readFile(join(import.meta.dirname, "../package.json"), "utf8"));
	const scripts = packageJson.scripts;
	const expectedTargets = {
		"package:win:inno": "inno",
		"package:win:msi": "msi",
		"package:win:portable": "portable",
		"package:win:zip": "zip",
	};

	assert.match(scripts["package:win"], /--platform win$/);
	assert.equal(scripts["dist:win"], "bun run package:win");
	assert.equal(scripts["package:win:test"], "cross-env VETTA_BUILD_ENV=test bun run package:win");
	for (const [scriptName, target] of Object.entries(expectedTargets)) {
		assert.match(scripts[scriptName], new RegExp(`--platform win --target ${target}$`));
		assert.equal(scripts[`dist:${scriptName.slice("package:".length)}`], `bun run ${scriptName}`);
		assert.equal(
			scripts[`${scriptName}:test`],
			`cross-env VETTA_BUILD_ENV=test bun run ${scriptName}`,
		);
	}
	assert.equal(scripts["dist:win:test"], "bun run package:win:test");
});
