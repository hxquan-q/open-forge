// Copyright The Open Forge contributors.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	isMcpServerCatalogSnapshot,
	type McpServerCatalogCache,
	type McpServerCatalogSnapshot,
} from "@vetta/runtime-mcp";

const CATALOG_FILE_VERSION = 1;
const MAX_SIGNATURE_ENTRIES = 4;

interface CatalogCacheEntry {
	readonly signature: string;
	readonly cachedAt: number;
	readonly serverInfo?: McpServerCatalogSnapshot["serverInfo"];
	readonly tools: McpServerCatalogSnapshot["tools"];
	readonly resources: McpServerCatalogSnapshot["resources"];
}

interface CatalogCacheFile {
	readonly version: number;
	readonly entries: CatalogCacheEntry[];
}

export interface FileMcpServerCatalogCacheOptions {
	readonly directory: string;
	readonly log?: (message: string) => void;
}

/**
 * Persists per-server MCP tool catalogs on disk, keyed by the canonical server
 * configuration signature. The latest few signatures are retained so that
 * reverting a configuration still hits the cache. Writes are atomic
 * (write-then-rename) and every entry is validated on read so a corrupted file
 * degrades to a cold discovery instead of a crash.
 */
export class FileMcpServerCatalogCache implements McpServerCatalogCache {
	private readonly directory: string;
	private readonly log?: (message: string) => void;

	constructor(options: FileMcpServerCatalogCacheOptions) {
		this.directory = options.directory;
		this.log = options.log;
	}

	async load(name: string, signature: string): Promise<McpServerCatalogSnapshot | undefined> {
		const file = await this.readFile(name);
		const entry = file?.entries.find((candidate) => candidate.signature === signature);
		if (!entry) return undefined;
		return { serverInfo: entry.serverInfo, tools: entry.tools, resources: entry.resources };
	}

	/** 最近一次成功发现的目录（不限签名）。供设置 UI 展示工具清单；签名匹配仍走 `load`。 */
	async latest(name: string): Promise<McpServerCatalogSnapshot | undefined> {
		const entry = (await this.readFile(name))?.entries[0];
		if (!entry) return undefined;
		return { serverInfo: entry.serverInfo, tools: entry.tools, resources: entry.resources };
	}

	async store(name: string, signature: string, snapshot: McpServerCatalogSnapshot): Promise<void> {
		const file = await this.readFile(name);
		const entries: CatalogCacheEntry[] = [
			{
				signature,
				cachedAt: Date.now(),
				serverInfo: snapshot.serverInfo,
				tools: snapshot.tools,
				resources: snapshot.resources,
			},
			...(file?.entries ?? []).filter((entry) => entry.signature !== signature),
		].slice(0, MAX_SIGNATURE_ENTRIES);
		const payload: CatalogCacheFile = { version: CATALOG_FILE_VERSION, entries };
		await mkdir(this.directory, { recursive: true });
		const path = this.filePath(name);
		const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
		await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
		await rename(temporaryPath, path);
	}

	private filePath(name: string): string {
		return join(this.directory, `${encodeURIComponent(name)}.json`);
	}

	private async readFile(name: string): Promise<CatalogCacheFile | undefined> {
		let raw: string;
		try {
			raw = await readFile(this.filePath(name), "utf8");
		} catch {
			return undefined;
		}
		try {
			const parsed = JSON.parse(raw) as unknown;
			if (parsed === null || typeof parsed !== "object") return undefined;
			const candidate = parsed as { version?: unknown; entries?: unknown };
			if (candidate.version !== CATALOG_FILE_VERSION || !Array.isArray(candidate.entries)) return undefined;
			const entries: CatalogCacheEntry[] = [];
			for (const item of candidate.entries) {
				const entry = toValidEntry(item);
				if (entry) entries.push(entry);
			}
			return { version: CATALOG_FILE_VERSION, entries };
		} catch (error) {
			this.log?.(`Ignoring invalid MCP catalog cache file for '${name}': ${toMessage(error)}`);
			return undefined;
		}
	}
}

function toValidEntry(value: unknown): CatalogCacheEntry | undefined {
	if (value === null || typeof value !== "object") return undefined;
	const candidate = value as Record<string, unknown>;
	const signature = candidate.signature;
	const cachedAt = candidate.cachedAt;
	if (typeof signature !== "string" || signature.length === 0) return undefined;
	if (!isMcpServerCatalogSnapshot(candidate)) return undefined;
	return {
		signature,
		cachedAt: typeof cachedAt === "number" ? cachedAt : 0,
		serverInfo: candidate.serverInfo,
		tools: candidate.tools,
		resources: candidate.resources,
	};
}

function toMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
