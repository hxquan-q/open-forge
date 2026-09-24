// Copyright The Open Forge contributors.

import { FileMcpServerCatalogCache } from "@vetta/runtime-node/mcp";
import type { McpConfigData, McpServerConfigData } from "../../preload/api-types/mcp.js";
import { getApplicationCacheService } from "../cache/application-cache-service.js";
import { getAppLogger } from "../logger.js";
import { readMcpConfig } from "./mcp-settings-service.js";

export interface McpServerToolListItem {
	readonly name: string;
	readonly description: string;
	readonly enabled: boolean;
	/** 在 disabledTools 中但已不在最近目录里（server 侧已改名或移除）。 */
	readonly stale: boolean;
}

export interface McpServerToolList {
	readonly tools: readonly McpServerToolListItem[];
	/** false 表示该 server 从未成功连接过，尚无目录缓存。 */
	readonly cached: boolean;
}

export interface McpServerToolCatalogDeps {
	readonly readConfig?: () => Promise<McpConfigData>;
	readonly cacheDirectory?: string;
}

/**
 * 供设置 UI 读取某 server 最近发现的工具清单。
 *
 * 数据源是 supervisor 每次成功发现后落盘的 catalog 缓存（`mcp-tool-catalog`
 * namespace），因此不触发任何连接；server 从未连过时返回 `cached: false` 空态。
 */
export async function listMcpServerTools(
	name: string,
	deps: McpServerToolCatalogDeps = {},
): Promise<McpServerToolList> {
	const config = await (deps.readConfig ?? readMcpConfig)();
	const server: McpServerConfigData | undefined = config.mcpServers[name];
	if (!server) throw new Error(`MCP server not found: ${name}`);

	const disabled = new Set(server.disabledTools ?? []);
	const directory = deps.cacheDirectory ?? getApplicationCacheService().namespace("mcp-tool-catalog").rootDir;
	const snapshot = await new FileMcpServerCatalogCache({
		directory,
		log: (message) => {
			try {
				getAppLogger("mcp").warn(message);
			} catch {
				// 测试宿主/轻量 sidecar 未配置 Electron logging 时静默。
			}
		},
	}).latest(name);

	const items: McpServerToolListItem[] = [];
	for (const tool of snapshot?.tools ?? []) {
		items.push({
			name: tool.name,
			description: tool.description?.trim() ?? "",
			enabled: !disabled.has(tool.name),
			stale: false,
		});
	}
	for (const toolName of disabled) {
		if (!items.some((item) => item.name === toolName)) {
			items.push({ name: toolName, description: "", enabled: false, stale: true });
		}
	}
	items.sort((left, right) => left.name.localeCompare(right.name));
	return { tools: items, cached: snapshot !== undefined };
}
