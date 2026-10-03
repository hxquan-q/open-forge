// Modified by The Open Forge contributors.

import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { CONFIG_DIR_NAME, VERSION } from "@vetta/coding-agent/config";
import type { McpServerConfig } from "@vetta/runtime-mcp";
import {
	EMPTY_MCP_CONFIG_SOURCE,
	MCP_APP_CLIENT_CAPABILITY,
	MCP_APPS_EXTENSION_ID,
	type McpServerInteractionHandlers,
	type McpServerSupervisor,
} from "@vetta/runtime-mcp";
import { createMcpClient, createNodeMcpSupervisor, FileMcpConfigSource } from "@vetta/runtime-node/mcp";
import { isSshProjectUri } from "@vetta/ssh-transport";
import { ensureOpenMarketplaceManagedMcpRuntime } from "../abilities/open-marketplace/open-marketplace-mcp-runtime-host.js";
import { getDesktopMcpElicitationBroker } from "../conversations/mcp-elicitation-broker.js";
import { getAppLogger } from "../logger.js";
import { resolveBundledMcpServerConfig } from "../mcp/builtin-mcp-server-runtime.js";
import { type DesktopMcpResourceScope, resolveDesktopMcpServerResourceScope } from "./mcp-resource-scope.js";

export interface DesktopMcpSupervisorOptions {
	readonly projectRoot: string;
	readonly agentDir: string;
	readonly debug: boolean;
	readonly dynamicOnly?: boolean;
	/**
	 * 连接所有权：`application` 只装载应用级（全局、无 PROJECT_ROOT 依赖）条目与内置服务器，
	 * 且不向 server 通告工作区 roots；`workspace` 只装载工作区级条目、不含内置服务器。
	 * 省略时保持旧行为（全局+项目+内置合并到单个连接）。
	 */
	readonly resourceScope?: DesktopMcpResourceScope;
	/** Sampling stays unavailable unless the product composition injects an approved model policy. */
	readonly samplingHandler?: McpServerInteractionHandlers["sampling"];
	/** Directory for the persisted MCP tool catalog cache; omit to disable disk caching. */
	readonly catalogCacheDirectory?: string;
	/** Default idle timeout (ms) for spawned stdio servers; per-server `idleTimeout` overrides it. */
	readonly idleTimeoutMs?: number;
}

export function createDesktopMcpInteractionHandlers(
	options: Pick<DesktopMcpSupervisorOptions, "projectRoot" | "resourceScope" | "samplingHandler">,
	onDiagnostic: (message: string) => void = () => undefined,
): McpServerInteractionHandlers {
	const elicitationBroker = getDesktopMcpElicitationBroker();
	return {
		elicitation: async (params, context) => {
			const result = await elicitationBroker.handle(params, context);
			onDiagnostic(`interaction completed method=elicitation/create action=${result.action}`);
			return result;
		},
		// 应用级连接跨工作区复用，工作区根对它没有意义；如实不通告，避免 server 把某个项目
		// 误当成长期工作区。
		...(options.resourceScope === "application"
			? {}
			: { roots: async () => ({ roots: resolveMcpRoots(options.projectRoot) }) }),
		...(options.samplingHandler ? { sampling: options.samplingHandler } : {}),
	};
}

/**
 * 向 MCP server 通告的工作区根。
 *
 * MCP server 跑在本机，只能碰本机文件；远程项目在本机没有对应的目录，所以如实通告
 * 「没有根」。把项目 URI 交给 `pathToFileURL` 会得到一个指向本机进程 cwd 之下的假
 * `file://` 地址，filesystem 类的 server 会把它当成可以读写的工作区。
 */
export function resolveMcpRoots(projectRoot: string): { uri: string; name: string }[] {
	if (isSshProjectUri(projectRoot)) return [];
	return [{ uri: pathToFileURL(projectRoot).href, name: basename(projectRoot) || "workspace" }];
}

function managedRuntimeId(config: unknown): string | undefined {
	if (config === null || typeof config !== "object") return undefined;
	const value = (config as Record<string, unknown>).managedRuntimeId;
	return typeof value === "string" && value ? value : undefined;
}

/** Selects the Node MCP implementation at the Desktop Composition Root. */
export function createDesktopMcpSupervisor(options: DesktopMcpSupervisorOptions): McpServerSupervisor {
	let log: ReturnType<typeof getAppLogger> | undefined;
	const writeDiagnostic = (message: string): void => {
		try {
			log ??= getAppLogger("mcp");
		} catch {
			// Test hosts and lightweight sidecars may not configure Electron logging.
			return;
		}
		const isFailure = /failed|error|exit|timeout|invalid|unauthorized/i.test(message);
		if (message.startsWith("MCP server startup timing ")) log.info(message);
		else if (isFailure) log.warn(message);
		else if (options.debug) log.debug(message);
	};
	const interactionHandlers = createDesktopMcpInteractionHandlers(options, writeDiagnostic);
	const configSource = options.dynamicOnly
		? EMPTY_MCP_CONFIG_SOURCE
		: new FileMcpConfigSource({
				globalConfigPath: join(options.agentDir, "mcp.json"),
				projectConfigPath: join(options.projectRoot, CONFIG_DIR_NAME, "mcp.json"),
				projectRoot: options.projectRoot,
				...(options.resourceScope
					? {
							includeServer: ({ origin, config }: { origin: "global" | "project"; config: McpServerConfig }) =>
								resolveDesktopMcpServerResourceScope(origin, config) === options.resourceScope,
						}
					: {}),
			});
	return createNodeMcpSupervisor({
		projectRoot: options.projectRoot,
		agentDir: options.agentDir,
		clientVersion: VERSION,
		projectConfigDirectoryName: CONFIG_DIR_NAME,
		debug: options.debug,
		enabled: true,
		configSource,
		includeBuiltinServers: !options.dynamicOnly && options.resourceScope !== "workspace",
		clientFactory: (name, config, clientOptions) => {
			const runtimeId = config.type === "http" ? managedRuntimeId(config) : undefined;
			const resolvedConfig: McpServerConfig =
				config.type === "http" && runtimeId
					? {
							...config,
							resolveUrl: () => ensureOpenMarketplaceManagedMcpRuntime(runtimeId, config.managedRuntimeEnv),
						}
					: (resolveBundledMcpServerConfig(config) ?? config);
			return createMcpClient(name, resolvedConfig, clientOptions);
		},
		onDiagnostic: writeDiagnostic,
		interactionHandlers,
		clientCapabilities: {
			extensions: { [MCP_APPS_EXTENSION_ID]: MCP_APP_CLIENT_CAPABILITY },
		},
		catalogCacheDirectory: options.catalogCacheDirectory,
		idleTimeoutMs: options.idleTimeoutMs,
	}).supervisor;
}
