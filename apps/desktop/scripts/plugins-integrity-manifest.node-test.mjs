// Modified by The Open Forge contributors.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	SYSTEM_PLUGINS_MANIFEST_FILENAME,
	SYSTEM_PLUGINS_MANIFEST_VERSION,
	buildSystemPluginsManifest,
	createPluginIntegrityEntry,
	findManifestEntry,
	readSystemPluginsManifest,
	resolveSystemPluginsManifestPath,
	selectManifestEntries,
	sha256Hex,
	verifyPluginArchiveIntegrity,
	verifyStagedPluginManifestIntegrity,
	writeSystemPluginsManifest,
} from "./plugins-integrity-manifest.mjs";

function createFixture() {
	const root = mkdtempSync(join(tmpdir(), "of-plugin-integrity-"));
	const pluginDir = join(root, "demo");
	mkdirSync(join(pluginDir, "release"), { recursive: true });
	writeFileSync(join(pluginDir, "plugin.json"), JSON.stringify({ id: "demo", version: "1.2.3" }));
	writeFileSync(join(pluginDir, "release", "demo-1.2.3.vettapkg"), "archive-bytes-v1");
	return {
		root,
		pluginDir,
		archivePath: join(pluginDir, "release", "demo-1.2.3.vettapkg"),
		manifestPath: join(pluginDir, "plugin.json"),
	};
}

function createEntry(fixture) {
	return createPluginIntegrityEntry({
		pluginId: "demo",
		version: "1.2.3",
		archivePath: fixture.archivePath,
		archiveRelativePath: "demo/release/demo-1.2.3.vettapkg",
		manifestPath: fixture.manifestPath,
	});
}

test("清单记录版本、归档指纹与 plugin.json 指纹，写入后可原样读回", () => {
	const fixture = createFixture();
	try {
		const entry = createEntry(fixture);
		assert.equal(entry.id, "demo");
		assert.equal(entry.version, "1.2.3");
		assert.equal(entry.archive, "demo/release/demo-1.2.3.vettapkg");
		assert.equal(entry.sha256, sha256Hex(Buffer.from("archive-bytes-v1")));
		assert.equal(entry.manifestSha256, sha256Hex(readFileSync(fixture.manifestPath)));

		const manifestPath = resolveSystemPluginsManifestPath(fixture.root);
		assert.ok(manifestPath.endsWith(join("release", SYSTEM_PLUGINS_MANIFEST_FILENAME)));
		writeSystemPluginsManifest(manifestPath, buildSystemPluginsManifest([entry]));

		const manifest = readSystemPluginsManifest(manifestPath);
		assert.equal(manifest.version, SYSTEM_PLUGINS_MANIFEST_VERSION);
		assert.deepEqual(manifest.plugins.map((plugin) => plugin.id), ["demo"]);
		assert.deepEqual(findManifestEntry(manifest, "demo"), entry);
		assert.equal(findManifestEntry(manifest, "missing"), undefined);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test("清单缺失返回 null，格式非法直接报错", () => {
	const fixture = createFixture();
	try {
		const manifestPath = join(fixture.root, "release", SYSTEM_PLUGINS_MANIFEST_FILENAME);
		assert.equal(readSystemPluginsManifest(manifestPath), null);

		mkdirSync(join(fixture.root, "release"), { recursive: true });
		writeFileSync(manifestPath, "{ not json");
		assert.throws(() => readSystemPluginsManifest(manifestPath), /不是合法 JSON/);

		writeFileSync(manifestPath, JSON.stringify({ version: 99, plugins: [] }));
		assert.throws(() => readSystemPluginsManifest(manifestPath), /版本不受支持/);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test("归档被替换后指纹校验失败并给出期望值与实际值", () => {
	const fixture = createFixture();
	try {
		const entry = createEntry(fixture);
		assert.equal(verifyPluginArchiveIntegrity({ archivePath: fixture.archivePath, entry }), entry.sha256);

		writeFileSync(fixture.archivePath, "archive-bytes-v2");
		assert.throws(
			() => verifyPluginArchiveIntegrity({ archivePath: fixture.archivePath, entry }),
			(error) => {
				assert.match(String(error.message), /插件归档指纹不匹配/);
				assert.match(String(error.message), new RegExp(entry.sha256));
				return true;
			},
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test("manifestData 锚定归档内字节，源码 plugin.json 排版差异不影响校验", () => {
	const fixture = createFixture();
	try {
		// 打包会对 plugin.json 做归一化（压缩空白、调整键序），归档内字节与源码不同。
		const archiveManifestData = Buffer.from(`${JSON.stringify({ id: "demo", version: "1.2.3" })}\n`);
		const entry = createPluginIntegrityEntry({
			pluginId: "demo",
			version: "1.2.3",
			archivePath: fixture.archivePath,
			archiveRelativePath: "demo/release/demo-1.2.3.vettapkg",
			manifestData: archiveManifestData,
		});
		assert.equal(entry.manifestSha256, sha256Hex(archiveManifestData));
		assert.notEqual(entry.manifestSha256, sha256Hex(readFileSync(fixture.manifestPath)));

		// staging 解出的是归档内字节：校验必须通过。
		writeFileSync(fixture.manifestPath, archiveManifestData);
		assert.equal(
			verifyStagedPluginManifestIntegrity({ pluginDir: fixture.pluginDir, entry }).ok,
			true,
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test("staging 目录里的 plugin.json 被改过即判为不通过", () => {
	const fixture = createFixture();
	try {
		const entry = createEntry(fixture);
		assert.deepEqual(verifyStagedPluginManifestIntegrity({ pluginDir: fixture.pluginDir, entry }), {
			ok: true,
			expected: entry.manifestSha256,
			actual: entry.manifestSha256,
			reason: null,
		});

		writeFileSync(fixture.manifestPath, JSON.stringify({ id: "demo", version: "1.2.3", permissions: ["shell"] }));
		const tampered = verifyStagedPluginManifestIntegrity({ pluginDir: fixture.pluginDir, entry });
		assert.equal(tampered.ok, false);
		assert.match(tampered.reason, /指纹不一致/);

		rmSync(fixture.manifestPath);
		const missing = verifyStagedPluginManifestIntegrity({ pluginDir: fixture.pluginDir, entry });
		assert.equal(missing.ok, false);
		assert.equal(missing.actual, null);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test("只把目标 staging 目录里实际存在的插件写进清单副本", () => {
	const fixture = createFixture();
	try {
		const demo = createEntry(fixture);
		const other = { ...demo, id: "other" };
		const manifest = buildSystemPluginsManifest([other, demo]);
		assert.deepEqual(
			manifest.plugins.map((plugin) => plugin.id),
			["demo", "other"],
		);
		assert.deepEqual(selectManifestEntries(manifest, new Set(["demo"])).plugins.map((p) => p.id), ["demo"]);
		assert.deepEqual(selectManifestEntries(manifest, undefined).plugins.map((p) => p.id), ["demo", "other"]);
		assert.equal(selectManifestEntries(null, new Set()), null);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});
