// Copyright The Open Forge contributors.

import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileMcpServerCatalogCache } from "../../src/mcp/catalog/index.js";
import type { McpServerCatalogSnapshot } from "../../src/mcp/index.js";

describe("FileMcpServerCatalogCache", () => {
	let directory: string;

	beforeEach(async () => {
		directory = await mkdtemp(join(tmpdir(), "mcp-catalog-test-"));
	});

	afterEach(async () => {
		await rm(directory, { recursive: true, force: true });
	});

	it("round-trips a snapshot for a matching signature", async () => {
		const cache = new FileMcpServerCatalogCache({ directory });
		const snapshot: McpServerCatalogSnapshot = {
			serverInfo: { name: "docs", version: "1" },
			tools: [{ name: "search", inputSchema: { type: "object", properties: { q: { type: "string" } } } }],
			resources: [{ uri: "docs://index", name: "index" }],
		};

		await cache.store("docs", "sig-a", snapshot);

		await expect(cache.load("docs", "sig-a")).resolves.toEqual(snapshot);
		await expect(cache.load("docs", "sig-b")).resolves.toBeUndefined();
		await expect(cache.load("other", "sig-a")).resolves.toBeUndefined();
	});

	it("persists across cache instances and keeps the latest signatures", async () => {
		const first = new FileMcpServerCatalogCache({ directory });
		for (let index = 0; index < 5; index += 1) {
			await first.store("docs", `sig-${index}`, { serverInfo: undefined, tools: [], resources: [] });
		}

		const second = new FileMcpServerCatalogCache({ directory });
		await expect(second.load("docs", "sig-4")).resolves.toEqual({
			serverInfo: undefined,
			tools: [],
			resources: [],
		});
		// 只保留最近 4 个签名，最旧的一条被回收。
		await expect(second.load("docs", "sig-0")).resolves.toBeUndefined();
	});

	it("re-storing a signature refreshes its entry", async () => {
		const cache = new FileMcpServerCatalogCache({ directory });
		await cache.store("docs", "sig-a", { serverInfo: undefined, tools: [], resources: [] });
		await cache.store("docs", "sig-a", {
			serverInfo: { name: "docs", version: "2" },
			tools: [{ name: "new", inputSchema: { type: "object" as const } }],
			resources: [],
		});

		await expect(cache.load("docs", "sig-a")).resolves.toMatchObject({
			serverInfo: { name: "docs", version: "2" },
		});
		const files = await readdir(directory);
		expect(files.filter((file) => file === "docs.json")).toHaveLength(1);
	});

	it("treats corrupt files as cache misses and keeps entries shape-safe", async () => {
		const cache = new FileMcpServerCatalogCache({ directory });
		await writeFile(join(directory, "docs.json"), "not json", "utf8");
		await expect(cache.load("docs", "sig-a")).resolves.toBeUndefined();

		await writeFile(
			join(directory, "half.json"),
			JSON.stringify({
				version: 1,
				entries: [
					{ signature: "ok", cachedAt: 1, serverInfo: { name: "x", version: "1" }, tools: [], resources: [] },
					{ signature: "broken-entry" },
					"nonsense",
				],
			}),
			"utf8",
		);
		await expect(cache.load("half", "ok")).resolves.toMatchObject({ serverInfo: { name: "x" } });
		await expect(cache.load("half", "broken-entry")).resolves.toBeUndefined();
	});

	it("encodes server names into a single file per server", async () => {
		const cache = new FileMcpServerCatalogCache({ directory });
		await cache.store("my server/one", "sig", { serverInfo: undefined, tools: [], resources: [] });
		const files = await readdir(directory);
		expect(files).toHaveLength(1);
		expect(files[0]).toBe(`${encodeURIComponent("my server/one")}.json`);
		const raw = JSON.parse(await readFile(join(directory, files[0]!), "utf8"));
		expect(raw.version).toBe(1);
		expect(raw.entries).toHaveLength(1);
	});
});
