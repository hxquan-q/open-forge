// Copyright The Open Forge contributors.
// @vitest-environment node

import { mkdtempSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setImmediate as nextTurn, setTimeout as delay } from "node:timers/promises";
import tailwindcss from "@tailwindcss/vite";
import { createServer } from "vite";
import type { Plugin, ViteDevServer } from "vite";
import type { PluginFsApi } from "@vetta-org/plugin-sdk";
import { expect, it, vi } from "vitest";
import { isDesignManifest, vetdThemeSource } from "../engine/plugins/theme-source.mjs";
import { vetdWatchDesign } from "../engine/plugins/watch-design.mjs";
import { queuedAtomicWrite } from "../src/shared/design-fs";

const require = createRequire(import.meta.url);
const engineRoot = resolve(__dirname, "../engine");

it("excludes only the root manifest and its actual atomic-write temporary names", () => {
	for (const path of ["design.json", "design.json.tmp-mabc-1"]) expect(isDesignManifest(path)).toBe(true);
	for (const path of [
		"components/design.json",
		"components\\design.json.tmp-mabc-1",
		"design.json.tsx",
		"frames/index.tsx",
		"package.json",
	])
		expect(isDesignManifest(path)).toBe(false);
});

it("50 次布局回写不触发 frame 的 HMR 重载，TSX/CSS 编辑仍更新", async () => {
	const fixture = mkdtempSync(join(tmpdir(), "open-forge-design-hmr-"));
	const design = join(fixture, "design");
	mkdirSync(design);
	mkdirSync(join(fixture, "src"));
	writeFileSync(
		join(fixture, "src/styles.css"),
		`@import "${require.resolve("tailwindcss/index.css").replaceAll("\\", "/")}";\n/*__VETD_SOURCE__*/\n@import "${join(design, "theme.css").replaceAll("\\", "/")}";`,
	);
	const manifest = join(design, "design.json");
	const frame = join(design, "frames/index.tsx");
	const theme = join(design, "theme.css");
	mkdirSync(join(design, "frames"));
	writeFileSync(frame, 'export default function Frame() { return <div className="p-4">Before</div>; }');
	writeFileSync(theme, "@theme { --color-probe: #123456; }");
	writeFileSync(manifest, JSON.stringify({ frames: [], viewport: { x: 0, y: 0, zoom: 1 } }));
	let server: ViteDevServer | undefined;
	const observed = new Map<string, () => void>();
	const barrier: Plugin = {
		name: "test-hmr-observed",
		enforce: "post",
		handleHotUpdate(context) {
			observed.get(context.file)?.();
		},
	};
	try {
		// The actual engine source plugin and Tailwind scanner run against disposable files.
		server = await createServer({
			configFile: false,
			root: fixture,
			logLevel: "silent",
			plugins: [
				vetdThemeSource(design.replaceAll("\\", "/")),
				vetdWatchDesign(fixture, design),
				tailwindcss(),
				barrier,
			],
			resolve: {
				alias: {
					react: dirname(require.resolve("react/package.json")),
					"react-dom": dirname(require.resolve("react-dom/package.json")),
				},
			},
			optimizeDeps: { noDiscovery: true, include: [] },
			server: {
				host: "127.0.0.1",
				port: 0,
				strictPort: false,
				fs: { strict: true, allow: [engineRoot, fixture, resolve(engineRoot, "../../../../..")] },
			},
		});
		await server.listen();
		await server.transformRequest("/src/styles.css");
		await server.transformRequest(`/@fs/${frame.replaceAll("\\", "/")}`);
		await server.waitForRequestsIdle();
		const sends = vi.spyOn(server.ws, "send");
		const updates = () =>
			sends.mock.calls.filter(
				([payload]) =>
					typeof payload === "object" &&
					payload !== null &&
					"type" in payload &&
					(payload.type === "update" || payload.type === "full-reload"),
			);
		const writeObserved = async (file: string, content: string): Promise<void> => {
			let timeout: ReturnType<typeof setTimeout> | undefined;
			const handled = new Promise<void>((fulfill, reject) => {
				timeout = setTimeout(() => reject(new Error(`No HMR watcher event for ${file}`)), 5_000);
				observed.set(file.replaceAll("\\", "/"), fulfill);
			});
			try {
				writeFileSync(file, content);
				// Drive Vite's real watcher boundary without OS debounce/coalescing.
				server?.watcher.emit("change", file.replaceAll("\\", "/"));
				await handled;
				await nextTurn();
				await server?.waitForRequestsIdle();
				await nextTurn();
			} finally {
				clearTimeout(timeout);
				observed.delete(file.replaceAll("\\", "/"));
			}
		};
		let slowRename = true;
		const fs = {
			writeFile: async (path: string, content: string) => {
				await writeObserved(path, content);
				if (slowRename) {
					slowRename = false;
					// Hold one real atomic-write temp file beyond the production 60ms debounce.
					await delay(120);
				}
			},
			rename: async (from: string, to: string) => {
				renameSync(from, to);
				server?.watcher.emit("change", to.replaceAll("\\", "/"));
				await nextTurn();
			},
			delete: async (path: string) => rmSync(path, { force: true }),
		} as unknown as PluginFsApi;
		for (let i = 0; i < 50; i += 1) {
			await queuedAtomicWrite(
				fs,
				design,
				manifest,
				JSON.stringify({
					frames: [{ id: "index", title: `w-[${301 + i}px]`, x: i, y: i, width: 390, height: 844 }],
					viewport: { x: i, y: i * 2, zoom: 1 + i / 100 },
				}),
			);
		}
		await delay(120); // Drain the same watcher debounce after the final rename.
		const manifestUpdates = updates().length;
		sends.mockClear();
		await writeObserved(frame, 'export default function Frame() { return <div className="p-8">After</div>; }');
		const frameUpdates = updates().length;
		sends.mockClear();
		await writeObserved(theme, "@theme { --color-probe: #654321; }");
		const cssUpdates = updates().length;
		sends.mockClear();
		await writeObserved(
			join(design, "frames/new.tsx"),
			"export default function New() { return <div>New frame</div>; }",
		);
		await expect.poll(() => updates().length, { timeout: 2_000 }).toBeGreaterThan(0);
		const newFrameUpdates = updates().length;
		console.info("[design-hmr]", { writes: 50, manifestUpdates, frameUpdates, cssUpdates, newFrameUpdates });
		// bridge.armReloadOnNextUpdate reloads the frame on any vite:beforeUpdate.
		expect(manifestUpdates).toBe(0);
		expect(frameUpdates).toBeGreaterThan(0);
		expect(cssUpdates).toBeGreaterThan(0);
	} finally {
		await server?.close();
		rmSync(fixture, { recursive: true, force: true });
	}
}, 60_000);
