// Modified by The Open Forge contributors.
/**
 * 内置（system）插件的加载侧完整性校验。
 *
 * 与 `apps/desktop/scripts/plugins-integrity-manifest.mjs` 共用同一份清单格式：
 * staging 时写入 `<system-plugins>/system-plugins.manifest.json`，这里在加载前
 * 比对每个插件 `plugin.json` 的 sha256。只散列一个小文件，不扫整个插件目录，
 * 因此不影响启动开销；指纹不符即拒绝加载该插件并给出可诊断日志。
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const SYSTEM_PLUGINS_MANIFEST_FILENAME = "system-plugins.manifest.json";
export const SYSTEM_PLUGINS_MANIFEST_VERSION = 1;

export interface SystemPluginIntegrityEntry {
	id: string;
	version: string;
	sha256: string;
	manifestSha256: string;
}

export type SystemPluginIntegrityVerdict = { ok: true } | { ok: false; reason: string };

/** 清单缺失或格式不受支持时返回 `null`：没有清单就没有可校验的锚点，保持旧行为。 */
export function readSystemPluginsIntegrityManifest(pluginsDir: string): Map<string, SystemPluginIntegrityEntry> | null {
	const manifestPath = join(pluginsDir, SYSTEM_PLUGINS_MANIFEST_FILENAME);
	if (!existsSync(manifestPath)) return null;
	try {
		const parsed = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
			version?: unknown;
			plugins?: unknown;
		};
		if (parsed.version !== SYSTEM_PLUGINS_MANIFEST_VERSION || !Array.isArray(parsed.plugins)) return null;
		const entries = new Map<string, SystemPluginIntegrityEntry>();
		for (const entry of parsed.plugins as SystemPluginIntegrityEntry[]) {
			if (typeof entry?.id === "string" && typeof entry.manifestSha256 === "string") {
				entries.set(entry.id, entry);
			}
		}
		return entries;
	} catch {
		return null;
	}
}

export function verifySystemPluginIntegrity(
	pluginDir: string,
	entry: SystemPluginIntegrityEntry,
	pluginVersion: string,
): SystemPluginIntegrityVerdict {
	if (entry.version !== pluginVersion) {
		return { ok: false, reason: `清单版本 ${entry.version} 与插件版本 ${pluginVersion} 不一致` };
	}
	const manifestPath = join(pluginDir, "plugin.json");
	if (!existsSync(manifestPath)) return { ok: false, reason: "staging 缺少 plugin.json" };
	const actual = createHash("sha256").update(readFileSync(manifestPath)).digest("hex");
	if (actual !== entry.manifestSha256) {
		return { ok: false, reason: `plugin.json 指纹不匹配（期望 ${entry.manifestSha256}，实际 ${actual}）` };
	}
	return { ok: true };
}
