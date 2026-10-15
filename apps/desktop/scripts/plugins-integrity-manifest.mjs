// Modified by The Open Forge contributors.
/**
 * 内置插件集完整性指纹（对应 VS Code `product.json` 里按 `version`+`sha256` 钉死
 * 内置扩展的做法）。
 *
 * `build-presets.mjs` 在产出 `.vettapkg` 之后把「插件 id + 版本 + 归档 sha256 +
 * 归档内 plugin.json sha256」写进清单；`stage-system-plugins.mjs` 解包前校验归档指纹，
 * 运行时 `SystemPluginCatalog` 加载前校验 plugin.json 指纹。三者共用一个格式：
 *
 * ```json
 * {
 *   "version": 1,
 *   "plugins": [
 *     { "id": "git", "version": "0.2.3", "archive": "git/release/git-0.2.3.vettapkg",
 *       "sha256": "<归档摘要>", "manifestSha256": "<plugin.json 摘要>" }
 *   ]
 * }
 * ```
 *
 * 归档摘要是发布/分发的完整性锚点，plugin.json 摘要负责把「拒绝加载」的判断
 * 压到一次小文件读取，不让启动路径去散列整个插件目录。
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const SYSTEM_PLUGINS_MANIFEST_FILENAME = "system-plugins.manifest.json";
export const SYSTEM_PLUGINS_MANIFEST_VERSION = 1;
export const SYSTEM_PLUGINS_MANIFEST_RELATIVE_PATH = `release/${SYSTEM_PLUGINS_MANIFEST_FILENAME}`;

export function sha256Hex(data) {
	return createHash("sha256").update(data).digest("hex");
}

export function sha256FileHex(path) {
	return sha256Hex(readFileSync(path));
}

export function resolveSystemPluginsManifestPath(presetsDir) {
	return join(presetsDir, "release", SYSTEM_PLUGINS_MANIFEST_FILENAME);
}

/**
 * 单个插件的指纹条目：版本和归档路径进清单，便于人工核对「哪一版」。
 * `manifestData` 必须是归档内 plugin.json 的原始字节——加载侧校验的是解包后的
 * 文件内容，锚定源码文件会因打包期归一化（压缩空白等）而永远不匹配。
 */
export function createPluginIntegrityEntry({
	pluginId,
	version,
	archivePath,
	archiveRelativePath,
	manifestPath,
	manifestData,
}) {
	return {
		id: pluginId,
		version,
		archive: archiveRelativePath.replaceAll("\\", "/"),
		sha256: sha256FileHex(archivePath),
		manifestSha256: manifestData === undefined ? sha256FileHex(manifestPath) : sha256Hex(manifestData),
	};
}

export function buildSystemPluginsManifest(entries) {
	return {
		version: SYSTEM_PLUGINS_MANIFEST_VERSION,
		plugins: [...entries].sort((left, right) => left.id.localeCompare(right.id)),
	};
}

export function writeSystemPluginsManifest(path, manifest) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(manifest, null, "\t")}\n`, "utf8");
	return path;
}

/** 读清单：缺失返回 `null`（由调用方决定是否算违规），格式非法直接抛错。 */
export function readSystemPluginsManifest(path) {
	if (!existsSync(path)) return null;
	let parsed;
	try {
		parsed = JSON.parse(readFileSync(path, "utf8"));
	} catch (error) {
		throw new Error(`插件完整性清单不是合法 JSON：${path}（${error.message}）`);
	}
	if (parsed?.version !== SYSTEM_PLUGINS_MANIFEST_VERSION || !Array.isArray(parsed.plugins)) {
		throw new Error(
			`插件完整性清单版本不受支持：${path}（version=${String(parsed?.version)}，期望 ${SYSTEM_PLUGINS_MANIFEST_VERSION}）`,
		);
	}
	return parsed;
}

export function findManifestEntry(manifest, pluginId) {
	return manifest?.plugins.find((entry) => entry.id === pluginId);
}

/** 只保留给定插件集合的条目，用于写入 staging 目录的清单副本。 */
export function selectManifestEntries(manifest, pluginIds) {
	if (manifest === null) return null;
	return buildSystemPluginsManifest(
		manifest.plugins.filter((entry) => pluginIds === undefined || pluginIds.has(entry.id)),
	);
}

export function verifyPluginArchiveIntegrity({ archivePath, entry }) {
	const actual = sha256FileHex(archivePath);
	if (actual !== entry.sha256) {
		throw new Error(
			`插件归档指纹不匹配：${archivePath}（插件 ${entry.id}@${entry.version}）\n` +
				`  期望 sha256 ${entry.sha256}\n  实际 sha256 ${actual}\n` +
				"重新运行 `bun run build:presets` 生成归档与清单后再打包。",
		);
	}
	return actual;
}

/** 加载侧校验：只比对 plugin.json 摘要，避免每次启动散列整棵插件目录。 */
export function verifyStagedPluginManifestIntegrity({ pluginDir, entry }) {
	const manifestPath = join(pluginDir, "plugin.json");
	if (!existsSync(manifestPath)) {
		return { ok: false, expected: entry.manifestSha256, actual: null, reason: "缺少 plugin.json" };
	}
	const actual = sha256FileHex(manifestPath);
	return {
		ok: actual === entry.manifestSha256,
		expected: entry.manifestSha256,
		actual,
		reason: actual === entry.manifestSha256 ? null : "plugin.json 与内置清单指纹不一致",
	};
}
