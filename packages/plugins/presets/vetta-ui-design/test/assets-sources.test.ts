// Copyright The Open Forge contributors.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PluginNetworkApi } from "@vetta-org/plugin-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bytesFromBase64, downloadAsset, rasterHeader } from "../src/assets/images";
import { assetRef, assetSource, assetUrl, parseAssetResults, searchAssets } from "../src/assets/sources";
import { commonsBody, PNG, WEBP } from "./assets-fixture";

afterEach(() => vi.unstubAllGlobals());
const candidate = () => parseAssetResults("wikimedia", commonsBody()).candidates[0];
const network = (body: unknown, headers: Record<string, string> = { "content-type": "image/png" }): PluginNetworkApi =>
	({ request: async () => ({ ok: true, status: 200, headers, body }) }) as PluginNetworkApi;

describe("source boundaries", () => {
	it.each([
		"http://upload.wikimedia.org/wikipedia/commons/x.png",
		"https://127.0.0.1/x",
		"https://[::1]/x",
		"https://localhost/x",
		"https://10.0.0.1/x",
		"https://upload.wikimedia.org.evil.test/x",
		"https://upload.wikimedia.org:444/x",
		"https://user:pass@upload.wikimedia.org/x",
		"file:///x",
		"https://upload.wikimedia.org/other/x",
	])("rejects URL outside the exact policy: %s", (url) => {
		expect(() => assetUrl(url, ["upload.wikimedia.org"], "/wikipedia/commons/")).toThrow();
	});
	it.each(["openverse", "unsplash", "https://example.com", undefined])(
		"does not silently expand source permissions for %s",
		(source) => expect(() => assetSource(source)).toThrow(/Supported sources/),
	);
	it.each(["../x.png", "File:x.svg", "https://upload.wikimedia.org/x.jpg", "File:x.png|File:y.png", "File:x.png\n"])(
		"rejects an untrusted source reference %s",
		(id) => expect(() => assetRef({ source: "wikimedia", id })).toThrow(),
	);
	it("rejects malformed JSON structures but reports a bad individual candidate as a partial rejection", () => {
		expect(() => parseAssetResults("wikimedia", { query: { pages: null } })).toThrow();
		expect(
			parseAssetResults("wikimedia", {
				query: { pages: [{ title: "bad" }, ...(commonsBody() as { query: { pages: unknown[] } }).query.pages] },
			}),
		).toMatchObject({ candidates: [{ title: "Mountain", author: "Test author" }], rejected: 1 });
	});
	it("keeps missing license metadata explicitly unknown", () => {
		const body = commonsBody() as { query: { pages: { imageinfo: { extmetadata: unknown }[] }[] } };
		body.query.pages[0].imageinfo[0].extmetadata = {};
		expect(parseAssetResults("wikimedia", body).candidates[0].license).toMatchObject({
			name: "Unknown license",
			status: "unknown",
			attributionRequired: null,
		});
	});
	it("NASA never assumes government hosting clears a particular image", () => {
		const c = parseAssetResults("nasa", {
			collection: {
				items: [
					{
						data: [
							{ nasa_id: "PIA00342", title: "Earth", media_type: "image", secondary_creator: "NASA/JPL/USGS" },
						],
						links: [{ rel: "preview", href: "https://images-assets.nasa.gov/image/PIA00342/PIA00342~thumb.jpg" }],
					},
				],
			},
		});
		expect(c).toMatchObject({
			candidates: [{ id: "PIA00342", license: { status: "unknown", attributionRequired: true } }],
			rejected: 0,
		});
	});
	it("encodes search terms as data, bounds metadata and surfaces source unavailability", async () => {
		let requested = "";
		await searchAssets(
			{
				request: async (req) => {
					requested = req.url;
					return { ok: true, status: 200, headers: {}, body: commonsBody() };
				},
			} as PluginNetworkApi,
			"wikimedia",
			"a&titles=File:Evil.png",
		);
		expect(new URL(requested).searchParams.get("gsrsearch")).toBe("a&titles=File:Evil.png");
		expect(new URL(requested).searchParams.has("titles")).toBe(false);
		await expect(
			searchAssets(
				{ request: async () => ({ ok: false, status: 429, body: null }) } as PluginNetworkApi,
				"nasa",
				"earth",
			),
		).rejects.toThrow(/429/);
	});
});

describe("download and image boundaries", () => {
	it.each([
		[4000, 2000, 2048, 1024],
		[2000, 4000, 1024, 2048],
	])("resizes %i×%i to a proportional %i×%i WebP", async (width, height, expectedWidth, expectedHeight) => {
		const close = vi.fn();
		vi.stubGlobal("createImageBitmap", async () => ({ width, height, close }));
		vi.stubGlobal(
			"OffscreenCanvas",
			class {
				constructor(
					readonly width: number,
					readonly height: number,
				) {
					expect(width).toBe(expectedWidth);
					expect(height).toBe(expectedHeight);
				}
				getContext() {
					return { drawImage() {} };
				}
				async convertToBlob(options: { type: string; quality: number }) {
					expect(options).toEqual({ type: "image/webp", quality: 0.86 });
					return new Blob([Buffer.from(WEBP, "base64")], { type: "image/webp" });
				}
			},
		);
		expect(await downloadAsset(network(PNG), candidate())).toMatchObject({
			mime: "image/webp",
			extension: "webp",
			width: expectedWidth,
			height: expectedHeight,
			base64: WEBP,
			transformed: true,
		});
		expect(close).toHaveBeenCalledOnce();
	});
	it("closes a decoded image if the native encoder fails", async () => {
		const close = vi.fn();
		vi.stubGlobal("createImageBitmap", async () => ({ width: 4000, height: 2000, close }));
		vi.stubGlobal(
			"OffscreenCanvas",
			class {
				getContext() {
					return { drawImage() {} };
				}
				async convertToBlob() {
					throw new Error("encoder failed");
				}
			},
		);
		await expect(downloadAsset(network(PNG), candidate())).rejects.toThrow(/encoder failed/);
		expect(close).toHaveBeenCalledOnce();
	});
	it("accepts the credited, real Wikimedia JPEG fixture without needing a live network", async () => {
		const bytes = new Uint8Array(await readFile(join(__dirname, "fixtures/assets/mountain.jpg")));
		const header = rasterHeader(bytes, "image/jpeg");
		expect(header).toMatchObject({ mime: "image/jpeg", width: 500 });
		vi.stubGlobal("createImageBitmap", async () => ({ width: header.width, height: header.height, close() {} }));
		const image = await downloadAsset(
			network(Buffer.from(bytes).toString("base64"), { "content-type": "image/jpeg" }),
			candidate(),
		);
		expect(image).toMatchObject({ extension: "jpg", width: 500, transformed: false });
	});
	it("validates signature, decodes a raster and closes its native bitmap", async () => {
		const close = vi.fn();
		vi.stubGlobal("createImageBitmap", async () => ({ width: 1, height: 1, close }));
		expect(await downloadAsset(network(PNG), candidate())).toMatchObject({
			base64: PNG,
			width: 1,
			height: 1,
			mime: "image/png",
			transformed: false,
		});
		expect(close).toHaveBeenCalledOnce();
	});
	it("rejects HTML/SVG and MIME disguises before decoding", async () => {
		await expect(downloadAsset(network(btoa("<svg></svg>")), candidate())).rejects.toThrow(/JPEG\/PNG/);
		await expect(downloadAsset(network(PNG, { "content-type": "text/html" }), candidate())).rejects.toThrow(/MIME/);
	});
	it("rejects oversized declared responses and excessive dimensions before native decoding", async () => {
		await expect(
			downloadAsset(
				network(PNG, { "content-type": "image/png", "content-length": "99999999" } as Record<string, string>),
				candidate(),
			),
		).rejects.toThrow(/8 MiB/);
		const bytes = bytesFromBase64(PNG);
		new DataView(bytes.buffer).setUint32(16, 20000);
		expect(() => rasterHeader(bytes, "image/png")).toThrow(/dimensions/);
		expect(() => bytesFromBase64("!not-base64!")).toThrow();
	});
	it("does not save an undecodable image or fake successful decoding when unavailable", async () => {
		vi.stubGlobal("createImageBitmap", async () => {
			throw new Error("bad image");
		});
		await expect(downloadAsset(network(PNG), candidate())).rejects.toThrow(/cannot be decoded/);
		vi.stubGlobal("createImageBitmap", undefined);
		await expect(downloadAsset(network(PNG), candidate())).rejects.toThrow(/unavailable/);
	});
});
