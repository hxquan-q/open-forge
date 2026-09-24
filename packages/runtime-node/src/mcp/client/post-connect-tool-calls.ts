import type { McpClientHandle } from "@vetta/runtime-mcp/client";
import {
	isStdioServerConfig,
	type McpPostConnectToolCall,
	type McpServerConfig,
	type McpTool,
} from "../protocol/index.js";

/**
 * postConnectToolCalls 装饰器：在 client.initialize() 成功后、handle 返回给
 * supervisor 前，自发执行配置声明的工具调用。
 *
 * 不变量（REQ-0007）：
 * - resolved args 只存在于内存与 tools/call 载荷，绝不回写磁盘、绝不进入
 *   onDiagnostic/console/遥测/任何日志或调试管道；诊断输出只允许 server 名、
 *   tool 名与成败。
 * - `{env:KEY}` 模板从 server `env` 取值；env 缺失或类型转换失败时整个 key
 *   从 arguments 剔除（不置空串/undefined/null）。
 * - 执行前先以 listTools 的目标 tool inputSchema 做浅校验，不符即 fail-fast
 *   报「不兼容」，不发出错位调用。
 * - bootstrap 失败视同连接失败（initialize reject），由 lazy handle 进入错误态。
 */

const ENV_TOKEN_PATTERN = /^\{env:([A-Za-z_][A-Za-z0-9_]*)(?::(number|boolean))?\}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 把 spec 的 args 模板 resolve 成 tools/call 的 arguments；缺值 key 整体剔除。 */
export function resolvePostConnectArgs(
	spec: Record<string, string> | undefined,
	env: Record<string, string> | undefined,
): Record<string, unknown> {
	const resolved: Record<string, unknown> = {};
	for (const [key, raw] of Object.entries(spec ?? {})) {
		const token = ENV_TOKEN_PATTERN.exec(raw);
		if (!token) {
			resolved[key] = raw;
			continue;
		}
		const [, envKey, coercion] = token;
		const value = env?.[envKey];
		// 空串视同缺失：传 host:"" 会让上游以空地址/默认值静默误连，剔除后由 schema 必填校验给出明确错误。
		if (value === undefined || value.trim() === "") continue;
		if (coercion === "number") {
			const parsed = Number(value);
			if (!Number.isFinite(parsed)) continue;
			resolved[key] = parsed;
		} else if (coercion === "boolean") {
			const normalized = value.trim().toLowerCase();
			if (normalized !== "true" && normalized !== "false") continue;
			resolved[key] = normalized === "true";
		} else {
			resolved[key] = value;
		}
	}
	return resolved;
}

/** 校验 spec 参数形状与上游声明的 inputSchema 一致；不符抛「不兼容」。 */
function assertArgsCompatible(serverName: string, tool: McpTool, args: Record<string, unknown>): void {
	const properties = isRecord(tool.inputSchema?.properties) ? tool.inputSchema.properties : {};
	for (const [key, value] of Object.entries(args)) {
		if (!(key in properties)) {
			throw new Error(
				`MCP server '${serverName}': post-connect tool '${tool.name}' has no declared parameter '${key}' (upstream schema incompatible)`,
			);
		}
		const declared = properties[key];
		const expected = isRecord(declared) ? declared.type : undefined;
		if (typeof expected !== "string") continue;
		const actual = typeof value;
		const compatible =
			expected === "integer" || expected === "number"
				? actual === "number"
				: expected === "boolean"
					? actual === "boolean"
					: expected === "string"
						? actual === "string"
						: true;
		if (!compatible) {
			throw new Error(
				`MCP server '${serverName}': post-connect tool '${tool.name}' parameter '${key}' expects '${expected}' (upstream schema incompatible)`,
			);
		}
	}
	const required = Array.isArray(tool.inputSchema?.required) ? tool.inputSchema.required : [];
	for (const key of required) {
		if (!(key in args)) {
			throw new Error(
				`MCP server '${serverName}': post-connect tool '${tool.name}' requires parameter '${key}' but resolved args do not provide it (env value unset or template key missing)`,
			);
		}
	}
}

const URI_CREDENTIAL_PATTERN = /([a-z][a-z0-9+.-]*:\/\/[^:/?#\s]+:)[^@/?#\s]+(@)/gi;
const SECRET_ARG_KEY_PATTERN = /pass|secret|token|key|credential/i;

/**
 * 上游驱动连接失败时，错误文本可能回显连接 URI（scheme://user:password@host）或
 * 参数值本身；透出前抹掉凭据形态的值，避免报错反向泄漏。
 */
export function scrubPostConnectError(text: string, args: Record<string, unknown>): string {
	let scrubbed = text.replace(URI_CREDENTIAL_PATTERN, "$1****$2");
	for (const [key, value] of Object.entries(args)) {
		if (typeof value === "string" && value.length > 0 && SECRET_ARG_KEY_PATTERN.test(key)) {
			scrubbed = scrubbed.split(value).join("****");
		}
	}
	return scrubbed;
}

async function runPostConnectToolCalls(
	client: McpClientHandle,
	serverName: string,
	spec: readonly McpPostConnectToolCall[],
	env: Record<string, string> | undefined,
	onDiagnostic?: (message: string) => void,
): Promise<void> {
	const { tools } = await client.listTools();
	for (const call of spec) {
		const tool = tools.find((candidate) => candidate.name === call.tool);
		if (!tool) {
			throw new Error(
				`MCP server '${serverName}': post-connect tool '${call.tool}' not advertised by server (upstream schema incompatible)`,
			);
		}
		const args = resolvePostConnectArgs(call.args, env);
		assertArgsCompatible(serverName, tool, args);
		try {
			await client.callTool(call.tool, args);
		} catch (error) {
			throw new Error(scrubPostConnectError(error instanceof Error ? error.message : String(error), args));
		}
		onDiagnostic?.(`MCP server '${serverName}': post-connect call '${call.tool}' completed`);
	}
}

/**
 * 包装 clientFactory 产物：仅 stdio config 且声明了 postConnectToolCalls 时才装饰；
 * 否则原样返回。可选方法通过 Proxy 透传，保持 `in`/`?.` 语义不变。
 */
export function withPostConnectToolCalls(
	client: McpClientHandle,
	serverName: string,
	config: McpServerConfig,
	onDiagnostic?: (message: string) => void,
): McpClientHandle {
	if (!isStdioServerConfig(config)) return client;
	const spec = config.postConnectToolCalls;
	if (!spec || spec.length === 0) return client;
	const env = config.env;
	return new Proxy(client, {
		get(target, prop, _receiver) {
			if (prop === "initialize") {
				return async (params: Parameters<McpClientHandle["initialize"]>[0]) => {
					const result = await target.initialize(params);
					await runPostConnectToolCalls(target, serverName, spec, env, onDiagnostic);
					return result;
				};
			}
			const value = Reflect.get(target, prop, target);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
}
