// Copyright The Open Forge contributors.
import { Type } from "@sinclair/typebox";
import { defineHostMethod, type HostMethodSignatures } from "../method.js";

/**
 * MCP 无凭证子域合同（PLAN-0029 Phase 2，TASK-0462）：配置路径、OAuth 状态与工具清单。
 * 含 env/headers 密钥面的 `mcp:get/set` 与 OAuth 登录六通道按 ADR-0152 §7 留待单独评审后迁入。
 */

/** 无参数方法的封闭合同：额外属性拒绝，不静默忽略。 */
const NoParams = Type.Object({}, { additionalProperties: false });
const ServerNameParams = Type.Object({ serverName: Type.String({ minLength: 1 }) }, { additionalProperties: false });

export const MCP_HOST_METHODS = {
	configPath: defineHostMethod({
		name: "mcp.configPath",
		params: NoParams,
		result: Type.String(),
	}),
	hasAuth: defineHostMethod({
		name: "mcp.hasAuth",
		params: ServerNameParams,
		result: Type.Boolean(),
	}),
	authStatus: defineHostMethod({
		name: "mcp.authStatus",
		params: Type.Object({ serverNames: Type.Array(Type.String({ minLength: 1 })) }, { additionalProperties: false }),
		result: Type.Record(Type.String(), Type.Boolean()),
	}),
	listServerTools: defineHostMethod({
		name: "mcp.listServerTools",
		params: ServerNameParams,
		result: Type.Object({
			tools: Type.Array(
				Type.Object({
					name: Type.String(),
					description: Type.String(),
					enabled: Type.Boolean(),
					stale: Type.Boolean(),
				}),
			),
			cached: Type.Boolean(),
		}),
	}),
} as const;

export type McpHostMethods = HostMethodSignatures<typeof MCP_HOST_METHODS>;
