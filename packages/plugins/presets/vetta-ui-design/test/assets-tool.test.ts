// Copyright The Open Forge contributors.

import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	PluginAgentToolHandler,
	PluginAgentToolRegistration,
	PluginContext,
	PluginNetworkApi,
} from "@vetta-org/plugin-sdk";
import { afterEach, expect, it, vi } from "vitest";
import { scaffoldDesign } from "../src/vetd/scaffold";
import { assetFixture, COMMONS_ID, nodeDesignFs, PNG, WEBP } from "./assets-fixture";

afterEach(() => vi.unstubAllGlobals());

it("persists converted WebP bytes, dimensions, hash and credits consistently through the normal import tool", async () => {
	const root = (await mkdtemp(join(tmpdir(), "vetd-assets-resize-"))).replaceAll("\\", "/");
	const fs = nodeDesignFs();
	const { dirPath: dir } = await scaffoldDesign(fs, root, "trip");
	vi.stubGlobal("createImageBitmap", async () => ({ width: 4000, height: 2000, close() {} }));
	vi.stubGlobal(
		"OffscreenCanvas",
		class {
			getContext() {
				return { drawImage() {} };
			}
			async convertToBlob() {
				return new Blob([Buffer.from(WEBP, "base64")], { type: "image/webp" });
			}
		},
	);
	try {
		const fixture = assetFixture(undefined, fs);
		const result = (await fixture.call({
			action: "import",
			design: dir,
			ref: { source: "wikimedia", id: COMMONS_ID },
		})) as { asset: { file: string; sha256: string } };
		expect(result).toMatchObject({
			ok: true,
			asset: {
				file: expect.stringMatching(/\.webp$/),
				width: 2048,
				height: 1024,
				mime: "image/webp",
				transformed: true,
			},
		});
		expect((await readFile(`${dir}/${result.asset.file}`)).toString("base64")).toBe(WEBP);
		const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", Buffer.from(WEBP, "base64"))), (n) =>
			n.toString(16).padStart(2, "0"),
		).join("");
		expect(result.asset.sha256).toBe(hash);
		expect(await fixture.call({ action: "credits", design: dir })).toMatchObject({
			ok: true,
			credits: { assets: [{ file: result.asset.file, sha256: hash, width: 2048, height: 1024 }] },
		});
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it("rejects a credits append that would exceed the reader limit before writing an image", async () => {
	const root = (await mkdtemp(join(tmpdir(), "vetd-assets-credit-limit-"))).replaceAll("\\", "/");
	const fs = nodeDesignFs();
	const { dirPath: dir } = await scaffoldDesign(fs, root, "trip");
	try {
		const candidate = parseAssetResults("wikimedia", commonsBody()).candidates[0];
		const large = {
			...candidate,
			title: "t".repeat(1000),
			author: "a".repeat(1000),
			license: {
				...candidate.license,
				name: "l".repeat(1000),
				url: `https://creativecommons.org/licenses/by/4.0/?x=${"x".repeat(3800)}`,
			},
			originalUrl: `${candidate.originalUrl}?x=${"x".repeat(3800)}`,
			downloadUrl: `${candidate.downloadUrl}?x=${"x".repeat(3800)}`,
			previewUrl: `${candidate.previewUrl}?x=${"x".repeat(3800)}`,
			pageUrl: `${candidate.pageUrl}?x=${"x".repeat(3800)}`,
		};
		const prior = {
			...large,
			file: "assets/prior.png",
			sha256: "0".repeat(64),
			mime: "image/png",
			width: 1,
			height: 1,
			transformed: false,
			importedAt: new Date(0).toISOString(),
		};
		const entries = Array.from({ length: 170 }, (_, index) => ({ ...prior, file: `assets/prior-${index}.png` }));
		while (
			JSON.stringify(
				{ version: 1, assets: [...entries, { ...prior, file: `assets/prior-${entries.length}.png` }] },
				null,
				"\t",
			).length <= 4_000_000
		)
			entries.push({ ...prior, file: `assets/prior-${entries.length}.png` });
		const before = JSON.stringify({ version: 1, assets: entries }, null, "\t");
		expect(before.length).toBeLessThanOrEqual(4_000_000);
		await writeFile(`${dir}/CREDITS.json`, before);
		await expect(
			saveAsset(fs, dir, large, {
				base64: PNG,
				mime: "image/png",
				extension: "png",
				width: 1,
				height: 1,
				transformed: false,
			}),
		).rejects.toThrow(/credits.*limit/i);
		expect(await readFile(`${dir}/CREDITS.json`, "utf8")).toBe(before);
		expect(await readdir(`${dir}/assets`)).toEqual([]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it("propagates host cancellation and does not continue a preview batch or write an imported image", async () => {
	const root = (await mkdtemp(join(tmpdir(), "vetd-assets-cancel-"))).replaceAll("\\", "/");
	const fs = nodeDesignFs();
	const { dirPath: dir } = await scaffoldDesign(fs, root, "trip");
	try {
		let requests = 0;
		const error = Object.assign(new Error("Host request cancelled"), { name: "AbortError", reason: "cancelled" });
		const fixture = assetFixture(
			{
				request: async () => {
					requests += 1;
					throw error;
				},
			} as PluginNetworkApi,
			fs,
		);
		await expect(
			fixture.call({
				action: "preview",
				design: dir,
				refs: [
					{ source: "wikimedia", id: COMMONS_ID },
					{ source: "wikimedia", id: "File:Valley.png" },
				],
			}),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(requests).toBe(1);
		await expect(
			fixture.call({ action: "import", design: dir, ref: { source: "wikimedia", id: COMMONS_ID } }),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(await readdir(`${dir}/assets`)).toEqual([]);
		expect(await fs.stat(`${dir}/CREDITS.json`)).toBeNull();
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it("rolls back only its new image if the credits commit fails, leaving previous assets and credits intact", async () => {
	const root = (await mkdtemp(join(tmpdir(), "vetd-assets-rollback-"))).replaceAll("\\", "/");
	const fs = nodeDesignFs();
	const { dirPath: dir } = await scaffoldDesign(fs, root, "trip");
	vi.stubGlobal("createImageBitmap", async () => ({ width: 1, height: 1, close() {} }));
	try {
		const first = assetFixture(undefined, fs);
		expect(
			await first.call({ action: "import", design: dir, ref: { source: "wikimedia", id: COMMONS_ID } }),
		).toMatchObject({ ok: true });
		const before = await readFile(`${dir}/CREDITS.json`, "utf8");
		const files = await readdir(`${dir}/assets`);
		const brokenFs = {
			...fs,
			rename: async (from: string, to: string) => {
				if (to.endsWith("/CREDITS.json")) throw new Error("fixture credits write failed");
				return fs.rename(from, to);
			},
		};
		const broken = assetFixture(undefined, brokenFs);
		expect(
			await broken.call({ action: "import", design: dir, ref: { source: "wikimedia", id: COMMONS_ID } }),
		).toMatchObject({ ok: false, error: expect.stringContaining("fixture credits") });
		expect(await readFile(`${dir}/CREDITS.json`, "utf8")).toBe(before);
		expect(await readdir(`${dir}/assets`)).toEqual(files);
		expect((await readdir(dir)).some((file) => file.includes(".tmp-"))).toBe(false);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it("refuses malformed existing credits without overwriting them and preserves source transport failures", async () => {
	const root = (await mkdtemp(join(tmpdir(), "vetd-assets-bad-"))).replaceAll("\\", "/");
	const fs = nodeDesignFs();
	const { dirPath: dir } = await scaffoldDesign(fs, root, "trip");
	vi.stubGlobal("createImageBitmap", async () => ({ width: 1, height: 1, close() {} }));
	try {
		await writeFile(`${dir}/CREDITS.json`, "unparseable");
		expect(
			await assetFixture(undefined, fs).call({
				action: "import",
				design: dir,
				ref: { source: "wikimedia", id: COMMONS_ID },
			}),
		).toMatchObject({ ok: false, code: "invalid-credits" });
		expect(await readFile(`${dir}/CREDITS.json`, "utf8")).toBe("unparseable");
		expect(await readdir(`${dir}/assets`)).toEqual([]);
		const offline = assetFixture(
			{
				request: async () => {
					throw new Error("Plugin network request timed out");
				},
			} as PluginNetworkApi,
			fs,
		);
		expect(await offline.call({ action: "search", source: "nasa", query: "earth" })).toMatchObject({
			ok: false,
			error: expect.stringContaining("timed out"),
		});
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

import { saveAsset } from "../src/assets/credits";
import { parseAssetResults } from "../src/assets/sources";
import { registerDesignTools } from "../src/tools";
import { commonsBody } from "./assets-fixture";

it("exposes a host-mediated image search with source-reported credits through the normal design tool registry", async () => {
	let handler: PluginAgentToolHandler<unknown> | undefined;
	const ctx = {
		agent: {
			registerTool: (tool: PluginAgentToolRegistration) => {
				if (tool.name === "vetd_assets") handler = tool.handler;
				return { dispose() {} };
			},
		},
		network: {
			request: async () => ({
				ok: true,
				status: 200,
				headers: {},
				body: {
					query: {
						pages: [
							{
								title: "File:Mountain.jpg",
								imageinfo: [
									{
										url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Mountain.jpg",
										thumburl:
											"https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Mountain.jpg/640px-Mountain.jpg",
										descriptionurl: "https://commons.wikimedia.org/wiki/File:Mountain.jpg",
										mime: "image/jpeg",
										width: 1200,
										height: 800,
										size: 20000,
										extmetadata: {
											Artist: { value: "A photographer" },
											LicenseShortName: { value: "CC BY 4.0" },
											LicenseUrl: { value: "https://creativecommons.org/licenses/by/4.0/" },
											AttributionRequired: { value: "true" },
										},
									},
								],
							},
						],
					},
				},
			}),
		},
	} as unknown as PluginContext;
	registerDesignTools(ctx);
	expect(handler, "vetd_assets must be reachable from registerDesignTools").toBeTypeOf("function");
	const result = await handler?.({
		host: {},
		session: { cwd: "C:/work" },
		trigger: { input: { action: "search", source: "wikimedia", query: "mountain" } },
	} as never);
	expect(result).toMatchObject({
		ok: true,
		candidates: [
			{
				source: "wikimedia",
				id: "File:Mountain.jpg",
				license: { name: "CC BY 4.0", status: "source-reported", attributionRequired: true },
			},
		],
	});
});

it("searches, previews and imports a real local raster with linked credits, then reads it after reopen", async () => {
	const root = (await mkdtemp(join(tmpdir(), "vetd-assets-"))).replaceAll("\\", "/");
	const { dirPath: dir } = await scaffoldDesign(nodeDesignFs(), root, "trip");
	vi.stubGlobal("createImageBitmap", async () => ({ width: 1, height: 1, close() {} }));
	try {
		const { call, requested } = assetFixture();
		expect(await call({ action: "search", source: "wikimedia", query: "mountains" })).toMatchObject({
			ok: true,
			candidates: [{ id: COMMONS_ID }],
		});
		expect(
			await call({ action: "preview", design: dir, refs: [{ source: "wikimedia", id: COMMONS_ID }] }),
		).toMatchObject({ ok: true, previews: [{ id: COMMONS_ID, path: expect.stringContaining("/.snapshots/") }] });
		const imported = (await call({
			action: "import",
			design: dir,
			ref: { source: "wikimedia", id: COMMONS_ID },
		})) as { ok: boolean; asset: { file: string } };
		expect(imported).toMatchObject({
			ok: true,
			asset: { file: expect.stringMatching(/^assets\/wikimedia-.*\.png$/), license: { status: "source-reported" } },
			warnings: expect.arrayContaining([expect.stringContaining("legal clearance")]),
		});
		expect((await readFile(`${dir}/${imported.asset.file}`)).toString("base64")).toBe(PNG);
		const reopened = assetFixture();
		expect(await reopened.call({ action: "credits", design: dir })).toMatchObject({
			ok: true,
			credits: {
				version: 1,
				assets: [
					{
						file: imported.asset.file,
						author: "Test author",
						pageUrl: "https://commons.wikimedia.org/wiki/File:Mountain.png",
					},
				],
			},
		});
		expect(
			requested.every((url) => ["commons.wikimedia.org", "thumb.wikimedia.org"].includes(new URL(url).hostname)),
		).toBe(true);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
