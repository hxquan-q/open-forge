// Copyright The Open Forge contributors.
import type { HostDomainImplementation, MCP_HOST_METHODS } from "@vetta/host-protocol";
import { getDesktopMcpOAuthService } from "../mcp/mcp-oauth-service.js";
import { MCP_CONFIG_PATH } from "../mcp/mcp-settings-service.js";
import { listMcpServerTools } from "../mcp/mcp-tool-catalog.js";

/** MCP 无凭证子域的 Host 实现：参数已由合同校验，这里只调用既有业务服务。 */
export const mcpHostDomain: HostDomainImplementation<typeof MCP_HOST_METHODS> = {
	configPath: () => MCP_CONFIG_PATH,
	hasAuth: ({ serverName }) => {
		const trimmed = serverName.trim();
		return trimmed ? getDesktopMcpOAuthService().hasAuth(trimmed) : Promise.resolve(false);
	},
	authStatus: ({ serverNames }) => {
		const result: Record<string, boolean> = {};
		for (const name of serverNames) {
			const trimmed = name.trim();
			if (trimmed) result[trimmed] = getDesktopMcpOAuthService().hasAuth(trimmed);
		}
		return Promise.resolve(result);
	},
	listServerTools: async ({ serverName }) => {
		const list = await listMcpServerTools(serverName.trim());
		// 服务返回 readonly 数组；合同 Static 为可变形状，浅拷贝对齐（零拷贝语义不变）。
		return { tools: list.tools.map((tool) => ({ ...tool })), cached: list.cached };
	},
};
