// Copyright The Open Forge contributors.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { PluginContext, PluginNetworkApi } from "@vetta-org/plugin-sdk";
import { strFromU8, unzipSync } from "fflate";
import { build } from "vite";
import { afterEach, expect, it, vi } from "vitest";
import type * as EngineManager from "../src/engine/engine-manager";

// Only substitute external process setup/build; history itself runs the real shipped Node runner.
vi.mock("../src/history/runner-host", () => ({
	runHistoryCommand: async (_ctx: unknown, request: Record<string, unknown>) => {
		const { stdout } = await promisify(execFile)(process.execPath, [
			join(__dirname, "../history-runner/dist/runner.mjs"),
			JSON.stringify(request),
		]);
		const result = JSON.parse(stdout.trim().split("\n").at(-1) ?? "null") as { ok?: boolean; error?: string };
		if (!result.ok) throw new Error(result.error);
		return result;
	},
}));
vi.mock("../src/engine/engine-manager", async (original) => {
	const actual = await original<typeof EngineManager>();
	return {
		...actual,
		buildDesign: async (ctx: PluginContext, dir: string, out: string) => {
			await ctx.fs.writeFile(
				`${dir}/index.html`,
				'<html><div id="root"></div><script type="module" src="/entry.tsx"></script></html>',
			);
			await ctx.fs.writeFile(
				`${dir}/entry.tsx`,
				'import Frame from "./frames/index"; import { createRoot } from "react-dom/client"; createRoot(document.getElementById("root")!).render(<Frame />);',
			);
			const modules = join(__dirname, "../node_modules").replaceAll("\\", "/");
			await build({
				configFile: false,
				root: dir,
				base: "/",
				mode: "production",
				define: { "process.env.NODE_ENV": JSON.stringify("production") },
				logLevel: "error",
				esbuild: { jsx: "automatic", jsxDev: false },
				resolve: {
					alias: [
						{ find: "react/jsx-runtime", replacement: `${modules}/react/jsx-runtime.js` },
						{ find: "react/jsx-dev-runtime", replacement: `${modules}/react/jsx-dev-runtime.js` },
						{ find: "react-dom/client", replacement: `${modules}/react-dom/client.js` },
						{ find: /^react$/, replacement: `${modules}/react/index.js` },
					],
				},
				build: { outDir: out, assetsInlineLimit: 4096, rollupOptions: { output: { inlineDynamicImports: true } } },
			});
		},
	};
});

import { rasterHeader } from "../src/assets/images";
import { buildDesignPackage } from "../src/export/export-design";
import { runHistoryCommand } from "../src/history/runner-host";
import { findAssetReferences, inlineSnapshotAssets } from "../src/preview/snapshot-assets";
import { DesignSession } from "../src/vetd/design-session";
import { scaffoldDesign } from "../src/vetd/scaffold";
import { assetFixture, COMMONS_ID, commonsBody, nodeDesignFs } from "./assets-fixture";

afterEach(() => vi.unstubAllGlobals());
it("preserves local image and credits through reopen, real history restore and offline share export, with a license warning", async () => {
	const root = (await mkdtemp(join(tmpdir(), "vetd-asset-life-"))).replaceAll("\\", "/");
	const fs = nodeDesignFs();
	const { dirPath: dir } = await scaffoldDesign(fs, root, "trip");
	const photo = await readFile(join(__dirname, "fixtures/assets/mountain.jpg"));
	const header = rasterHeader(new Uint8Array(photo), "image/jpeg");
	vi.stubGlobal("createImageBitmap", async () => ({ width: header.width, height: header.height, close() {} }));
	try {
		const fixture = assetFixture(
			{
				request: async (request) => ({
					ok: true,
					status: 200,
					headers: { "content-type": request.responseType === "base64" ? "image/jpeg" : "application/json" },
					body: request.responseType === "base64" ? photo.toString("base64") : commonsBody(),
				}),
			} as PluginNetworkApi,
			fs,
		);
		const notify = vi.fn();
		fixture.ctx.ui.notify = notify;
		const result = (await fixture.call({
			action: "import",
			design: dir,
			ref: { source: "wikimedia", id: COMMONS_ID },
		})) as { ok: boolean; asset: { file: string } };
		expect(result.ok).toBe(true);
		await fs.writeFile(
			`${dir}/frames/index.tsx`,
			`export const frame = { width: 1440, height: 900, title: "Travel" };\nimport photo from "../${result.asset.file}";\nexport default function Travel() { return <img src={photo} alt="Mountain" />; }\n`,
		);
		const session = new DesignSession(fixture.ctx, dir);
		await session.reload();
		expect(session.manifest.frames.map((f) => f.id)).toEqual(["index"]);
		const first = await runHistoryCommand<{ commit: { sha: string } }>(fixture.ctx, {
			cmd: "commit",
			dir,
			title: "Photo selected",
		});
		await rm(`${dir}/${result.asset.file}`);
		await writeFile(`${dir}/CREDITS.json`, '{"version":1,"assets":[]}');
		await runHistoryCommand(fixture.ctx, { cmd: "commit", dir, title: "Photo removed" });
		await runHistoryCommand(fixture.ctx, { cmd: "restore", dir, sha: first.commit.sha, title: "Restore photo" });
		await session.reload();
		expect((await readFile(`${dir}/${result.asset.file}`)).toString("base64")).toBe(photo.toString("base64"));
		expect(await fixture.call({ action: "credits", design: dir })).toMatchObject({
			ok: true,
			credits: { assets: [{ file: result.asset.file }] },
		});
		const pkg = await buildDesignPackage(fixture.ctx, session);
		const zip = unzipSync(Buffer.from(pkg.base64, "base64"));
		expect(JSON.parse(strFromU8(zip["design/CREDITS.json"]))).toMatchObject({
			assets: [{ file: result.asset.file, license: { status: "source-reported" } }],
		});
		expect(Buffer.from(zip[`design/${result.asset.file}`]).toString("base64")).toBe(photo.toString("base64"));
		expect(zip["history.zip"]).toBeDefined();
		const builtReferences = findAssetReferences(strFromU8(zip["snapshot.html"]));
		expect(builtReferences.length).toBeGreaterThan(0);
		expect(builtReferences.every((path) => path.replace(/^\//, "") !== result.asset.file)).toBe(true);
		const designFiles = new Map(
			Object.entries(zip)
				.filter(([path]) => path.startsWith("design/"))
				.map(([path, bytes]) => [path.slice(7), bytes]),
		);
		expect(await inlineSnapshotAssets(strFromU8(zip["snapshot.html"]), designFiles)).toContain(
			`data:image/jpeg;base64,${photo.toString("base64")}`,
		);
		expect(notify).toHaveBeenCalledWith(
			expect.objectContaining({ variant: "warning", message: "assets.exportReview" }),
		);
		session.dispose();
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}, 30000);
