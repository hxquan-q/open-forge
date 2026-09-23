// Copyright The Open Forge contributors.

import type { McpInitializeResult, McpResource, McpServerConfig, McpServerInfo, McpTool } from "../protocol/index.js";

export interface McpServerCatalogSnapshot {
	readonly serverInfo: McpServerInfo | undefined;
	readonly tools: readonly McpTool[];
	readonly resources: readonly McpResource[];
}

export interface McpServerCatalogCache {
	load(name: string, signature: string): Promise<McpServerCatalogSnapshot | undefined>;
	store(name: string, signature: string, snapshot: McpServerCatalogSnapshot): Promise<void>;
}

export function computeMcpServerConfigSignature(config: McpServerConfig): string {
	return canonicalizeForSignature(config);
}

export function toMcpServerCatalogSnapshot(
	result: Pick<McpInitializeResult, "serverInfo">,
	tools: readonly McpTool[],
	resources: readonly McpResource[],
): McpServerCatalogSnapshot {
	return {
		serverInfo: result.serverInfo,
		tools: [...tools],
		resources: [...resources],
	};
}

export function isMcpServerCatalogSnapshot(value: unknown): value is McpServerCatalogSnapshot {
	if (value === null || typeof value !== "object") return false;
	const candidate = value as { serverInfo?: unknown; tools?: unknown; resources?: unknown };
	if (candidate.serverInfo !== undefined && !isServerInfo(candidate.serverInfo)) return false;
	if (!Array.isArray(candidate.tools) || !candidate.tools.every(isTool)) return false;
	if (!Array.isArray(candidate.resources) || !candidate.resources.every(isResource)) return false;
	return true;
}

function isServerInfo(value: unknown): value is McpServerInfo {
	if (value === null || typeof value !== "object") return false;
	const candidate = value as { name?: unknown; version?: unknown };
	return typeof candidate.name === "string" && typeof candidate.version === "string";
}

function isTool(value: unknown): value is McpTool {
	if (value === null || typeof value !== "object") return false;
	const candidate = value as { name?: unknown; inputSchema?: unknown };
	return (
		typeof candidate.name === "string" && candidate.inputSchema !== null && typeof candidate.inputSchema === "object"
	);
}

function isResource(value: unknown): value is McpResource {
	if (value === null || typeof value !== "object") return false;
	const candidate = value as { uri?: unknown; name?: unknown };
	return typeof candidate.uri === "string" && typeof candidate.name === "string";
}

/**
 * Canonicalizes an MCP server configuration into a stable string so a catalog
 * cache entry can be keyed by the *effective* configuration. Key order is
 * normalized recursively; non-serializable values (functions, e.g. header
 * resolvers) are ignored so that semantically identical configurations share
 * the same signature.
 */
function canonicalizeForSignature(value: unknown): string {
	if (value === null) return "null";
	const kind = typeof value;
	if (kind === "string") return JSON.stringify(value);
	if (kind === "number" || kind === "boolean") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonicalizeForSignature).join(",")}]`;
	if (kind === "object") {
		const record = value as Record<string, unknown>;
		const parts: string[] = [];
		for (const key of Object.keys(record).sort()) {
			const item = record[key];
			const itemKind = typeof item;
			if (item === undefined || itemKind === "function" || itemKind === "symbol") continue;
			parts.push(`${JSON.stringify(key)}:${canonicalizeForSignature(item)}`);
		}
		return `{${parts.join(",")}}`;
	}
	return "null";
}
