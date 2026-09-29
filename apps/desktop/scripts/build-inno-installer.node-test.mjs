// Modified by The Open Forge contributors.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveInnoInstallerIdentity, writeAppUpdateConfig, writeInnoVerificationManifest } from "./build-inno-installer.mjs";
import { resolveUpdatePublishConfig } from "./resolve-update-publish-config.mjs";

test("writes updater config into the version directory installed by Inno", async () => {
	const sourceDir = await mkdtemp(join(tmpdir(), "vetta-inno-test-"));
	const version = "0.5.42";
	const resourcesDir = join(sourceDir, "versions", version, "resources");
	await mkdir(resourcesDir, { recursive: true });

	try {
		const publishConfig = resolveUpdatePublishConfig({
			VETTA_UPDATE_PROVIDER: "generic",
			VETTA_UPDATE_URL: "https://releases.example.com/desktop/test",
		});
		assert.ok(publishConfig);
		await writeAppUpdateConfig(sourceDir, version, publishConfig);

		const config = await readFile(join(resourcesDir, "app-update.yml"), "utf8");
		assert.match(config, /provider: generic/);
		assert.match(config, /url: https:\/\/releases.example.com\/desktop\/test/);
		assert.match(config, /useMultipleRangeRequest: true/);
		assert.match(config, /updaterCacheDirName: openforge-updater/);
	} finally {
		await rm(sourceDir, { recursive: true, force: true });
	}
});

test("writes a stable versioned file manifest for pre-publish verification", async () => {
	const sourceDir = await mkdtemp(join(tmpdir(), "vetta-inno-test-"));
	const manifestPath = join(sourceDir, "installer.files.json");
	const versionDir = join(sourceDir, "version");
	await mkdir(join(versionDir, "resources"), { recursive: true });
	await Promise.all([
		writeFile(join(versionDir, "OpenForge.exe"), "exe"),
		writeFile(join(versionDir, "resources", "app.asar"), "asar"),
	]);

	try {
		await writeInnoVerificationManifest(versionDir, manifestPath, "1.2.3");
		assert.deepEqual(JSON.parse(await readFile(manifestPath, "utf8")), {
			version: "1.2.3",
			files: [
				{ path: "OpenForge.exe", size: 3 },
				{ path: "resources/app.asar", size: 4 },
			],
		});
	} finally {
		await rm(sourceDir, { recursive: true, force: true });
	}
});

test("安装器身份随品牌档案：文件名与显示名 define 从暂存 productName 派生", () => {
	const { fileName, displayNameDefine } = resolveInnoInstallerIdentity("Allstr ai", "0.1.2", "x64");
	assert.equal(fileName, "Allstr ai-0.1.2-win-x64.exe");
	assert.equal(displayNameDefine, "/DAppDisplayName=Allstr ai");

	const self = resolveInnoInstallerIdentity("Open Forge", "0.1.2", "x64");
	assert.equal(self.fileName, "Open Forge-0.1.2-win-x64.exe");
	assert.equal(self.displayNameDefine, "/DAppDisplayName=Open Forge");

	assert.throws(() => resolveInnoInstallerIdentity("", "0.1.2", "x64"), /missing staged productName/);
	assert.throws(() => resolveInnoInstallerIdentity(undefined, "0.1.2", "x64"), /missing staged productName/);
});
