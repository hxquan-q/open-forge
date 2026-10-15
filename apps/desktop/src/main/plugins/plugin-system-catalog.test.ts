import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginManifest } from "../../preload/api-types/plugins.js";
import { SystemPluginPreferenceStore } from "./plugin-registry-store.js";
import { SystemPluginCatalog } from "./plugin-system-catalog.js";

const root = join(process.cwd(), `.tmp-system-plugin-catalog-${process.pid}`);
const pluginsDir = join(root, "plugins");
const preferences = new SystemPluginPreferenceStore(join(root, "preferences.json"));

async function writePlugin(manifest: PluginManifest, includeEntry = true): Promise<void> {
	const dir = join(pluginsDir, manifest.id);
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, "plugin.json"), JSON.stringify(manifest));
	if (includeEntry) {
		await mkdir(join(dir, "dist"), { recursive: true });
		await writeFile(join(dir, manifest.entry), "export {};");
	}
}

function manifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
	return {
		id: "system-demo",
		name: "System Demo",
		version: "1.0.0",
		pluginApiVersion: "^2.0.0",
		entry: "dist/mf-manifest.json",
		moduleFederation: { remoteName: "system_demo", expose: "./plugin" },
		commands: ["demo.run"],
		...overrides,
	};
}

function createCatalog(requiredPluginIds: ReadonlySet<string> = new Set()) {
	return new SystemPluginCatalog({
		baseDir: () => pluginsDir,
		preferences,
		requiredPluginIds,
		hostApiVersion: "2.0.0",
		isPackaged: true,
		registerModeGate: vi.fn(),
		logger: { warn: vi.fn() },
	});
}

beforeEach(async () => {
	await rm(root, { recursive: true, force: true });
	await mkdir(pluginsDir, { recursive: true });
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

function manifestSha256(source: string): string {
	return createHash("sha256").update(source).digest("hex");
}

/** 内置插件集的完整性清单（staging 时由 prepare-pack 写入）。 */
async function writeIntegrityManifest(plugins: { id: string; version: string; manifestSha256: string }[]) {
	await writeFile(
		join(pluginsDir, "system-plugins.manifest.json"),
		JSON.stringify({ version: 1, plugins: plugins.map((entry) => ({ ...entry, sha256: "a".repeat(64) })) }),
	);
}

async function writePluginWithIntegrity(pluginManifest: PluginManifest) {
	const source = JSON.stringify(pluginManifest);
	await writePlugin(pluginManifest);
	await writeIntegrityManifest([
		{ id: pluginManifest.id, version: pluginManifest.version, manifestSha256: manifestSha256(source) },
	]);
}

describe("SystemPluginCatalog", () => {
	it("keeps required plugins enabled despite a disabled preference", async () => {
		await writePlugin(manifest());
		preferences.write({ "system-demo": { enabled: false } });

		const plugin = createCatalog(new Set(["system-demo"])).list()[0];
		expect(plugin).toMatchObject({ id: "system-demo", enabled: true, required: true, trustLevel: "official" });
	});

	it("skips an incomplete staged plugin without blocking discovery", async () => {
		await writePlugin(manifest({ id: "incomplete" }), false);
		await writePlugin(manifest({ id: "complete", name: "Complete" }));
		const catalog = createCatalog();

		expect(catalog.list().map((plugin) => plugin.id)).toEqual(["complete"]);
	});

	it("refreshes cached manifests only when forced", async () => {
		await writePlugin(manifest());
		const catalog = createCatalog();
		expect(catalog.list()[0]?.name).toBe("System Demo");

		await writePlugin(manifest({ name: "Updated" }));
		expect(catalog.list()[0]?.name).toBe("System Demo");
		expect(catalog.list(true)[0]?.name).toBe("Updated");
	});

	it("persists command disable and enable preferences", async () => {
		await writePlugin(manifest());
		const catalog = createCatalog();

		expect(catalog.revokeCommands("system-demo", ["demo.run"]).grantedCommandNames).toEqual([]);
		expect(catalog.grantCommands("system-demo", ["demo.run"]).grantedCommandNames).toEqual(["demo.run"]);
	});

	it("拒绝加载 plugin.json 与内置完整性清单不一致的插件", async () => {
		const intactPlugin = manifest({ id: "intact", name: "Intact" });
		await writePlugin(manifest());
		await writePlugin(intactPlugin);
		await writeIntegrityManifest([
			{ id: "system-demo", version: "1.0.0", manifestSha256: manifestSha256(JSON.stringify(manifest())) },
			{ id: "intact", version: "1.0.0", manifestSha256: manifestSha256(JSON.stringify(intactPlugin)) },
		]);
		const catalog = createCatalog();
		expect(
			catalog
				.list()
				.map((plugin) => plugin.id)
				.sort(),
		).toEqual(["intact", "system-demo"]);

		// 安装后 plugin.json 被改写（例如权限声明被偷偷放宽）：该插件不再被发现，其他插件不受影响。
		const tampered = manifest({ commands: ["demo.run", "demo.escalate"] });
		await writeFile(join(pluginsDir, "system-demo", "plugin.json"), JSON.stringify(tampered));

		expect(catalog.list(true).map((plugin) => plugin.id)).toEqual(["intact"]);
	});

	it("拒绝清单里版本与 staging 不一致的插件，未登记的插件照旧加载", async () => {
		await writePluginWithIntegrity(manifest({ version: "2.0.0" }));
		await writeIntegrityManifest([
			{ id: "system-demo", version: "1.0.0", manifestSha256: manifestSha256(JSON.stringify(manifest())) },
		]);
		await writePlugin(manifest({ id: "legacy", name: "Legacy" }));
		const catalog = createCatalog();

		expect(catalog.list().map((plugin) => plugin.id)).toEqual(["legacy"]);
	});
});
