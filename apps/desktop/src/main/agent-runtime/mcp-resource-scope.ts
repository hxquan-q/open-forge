// Copyright The Open Forge contributors.

import type { McpServerConfig } from "@vetta/runtime-mcp";

export type DesktopMcpResourceScope = "application" | "workspace";
export type DesktopMcpConfigOrigin = "global" | "project";

/** 配置文件里用于引用工作区根的模板 token（字面量，不参与插值）。 */
const PROJECT_ROOT_TOKEN = `\${PROJECT_ROOT}`;

/**
 * 全局 MCP 条目默认是应用资源，只有显式依赖当前项目时才降为工作区资源。
 * 项目配置始终是工作区资源：文件位置本身属于它的契约。
 */
export function resolveDesktopMcpServerResourceScope(
	origin: DesktopMcpConfigOrigin,
	config: McpServerConfig,
): DesktopMcpResourceScope {
	if (origin === "project") return "workspace";
	const configuredScope = readConfiguredResourceScope(config);
	if (configuredScope) return configuredScope;
	return containsProjectRootReference(config) ? "workspace" : "application";
}

function readConfiguredResourceScope(config: McpServerConfig): DesktopMcpResourceScope | undefined {
	const value = (config as McpServerConfig & { readonly resourceScope?: unknown }).resourceScope;
	return value === "application" || value === "workspace" ? value : undefined;
}

function containsProjectRootReference(config: McpServerConfig): boolean {
	return visitConfigValue(config, (value) => value.includes(PROJECT_ROOT_TOKEN));
}

function visitConfigValue(value: unknown, predicate: (value: string) => boolean): boolean {
	if (typeof value === "string") return predicate(value);
	if (Array.isArray(value)) return value.some((entry) => visitConfigValue(entry, predicate));
	if (!value || typeof value !== "object") return false;
	return Object.values(value).some((entry) =>
		typeof entry === "function" ? false : visitConfigValue(entry, predicate),
	);
}
