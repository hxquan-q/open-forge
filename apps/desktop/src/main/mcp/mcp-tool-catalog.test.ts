// Copyright The Open Forge contributors.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileMcpServerCatalogCache } from "@vetta/runtime-node/mcp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { McpConfigData } from "../../preload/api-types/mcp.js";
import { listMcpServerTools } from "./mcp-tool-catalog.js";

const SCHEMA = { type: "object" as const };

describe("listMcpServerTools", () => {
	let cacheDirectory: string;

	beforeEach(async () => {
		cacheDirectory = await mkdtemp(join(tmpdir(), "mcp-catalog-"));
	});

	afterEach(async () => {
		await rm(cacheDirectory, { recursive: true, force: true });
	});

	it("用户打开已连接过的 server 编辑面板时看到按停用状态标注的工具清单", async () => {
		const config: McpConfigData = {
			mcpServers: {
				web: { type: "http", url: "https://mcp.example.com", disabledTools: ["delete_thing"] },
			},
		};
		await new FileMcpServerCatalogCache({ directory: cacheDirectory, log: () => {} }).store("web", "sig-1", {
			serverInfo: { name: "web", version: "1.0" },
			tools: [
				{ name: "read_file", description: "Read a file", inputSchema: SCHEMA },
				{ name: "delete_thing", description: "Delete a thing", inputSchema: SCHEMA },
			],
			resources: [],
		});

		const list = await listMcpServerTools("web", { readConfig: async () => config, cacheDirectory });

		expect(list.cached).toBe(true);
		expect(list.tools).toEqual([
			{ name: "delete_thing", description: "Delete a thing", enabled: false, stale: false },
			{ name: "read_file", description: "Read a file", enabled: true, stale: false },
		]);
	});

	it("server 改名移除工具后，用户配置里的停用项保留并标记为已不在目录中", async () => {
		const config: McpConfigData = {
			mcpServers: {
				web: { type: "http", url: "https://mcp.example.com", disabledTools: ["removed_tool"] },
			},
		};
		await new FileMcpServerCatalogCache({ directory: cacheDirectory, log: () => {} }).store("web", "sig-1", {
			serverInfo: { name: "web", version: "1.0" },
			tools: [{ name: "read_file", description: "", inputSchema: SCHEMA }],
			resources: [],
		});

		const list = await listMcpServerTools("web", { readConfig: async () => config, cacheDirectory });

		expect(list.tools).toContainEqual({ name: "removed_tool", description: "", enabled: false, stale: true });
	});

	it("server 从未连接过时返回未缓存空态而不是报错", async () => {
		const config: McpConfigData = {
			mcpServers: { web: { type: "http", url: "https://mcp.example.com" } },
		};

		const list = await listMcpServerTools("web", { readConfig: async () => config, cacheDirectory });

		expect(list).toEqual({ tools: [], cached: false });
	});

	it("请求不存在的 server 名时得到明确错误", async () => {
		const config: McpConfigData = { mcpServers: {} };

		await expect(listMcpServerTools("missing", { readConfig: async () => config, cacheDirectory })).rejects.toThrow(
			"MCP server not found: missing",
		);
	});
});
