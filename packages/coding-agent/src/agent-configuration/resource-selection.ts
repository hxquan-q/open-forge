// Modified by The Open Forge contributors.
import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import type { McpRuntimeToolDescriptor } from "@vetta/runtime-mcp";
import type { AgentPluginRuntimeConfig } from "../model-context/plugin-runtime.js";
import type {
	CodingAgentPromptResourceResolver,
	CodingAgentPromptResourceSource,
} from "../runtime-contracts/prompt-runtime.js";
import { type AgentConfiguration, AgentConfigurationError } from "./configuration-schema.js";
import type { AgentConfigurationResourceCatalog } from "./session-configuration-contract.js";

export function allowsAgentResource(selection: readonly string[] | null, id: string): boolean {
	return selection === null || selection.includes(id);
}

/**
 * MCP 工具名由 server 在运行时上报，静态 `tools` 白名单在配置时点根本无法
 * 枚举它们——把 MCP 工具也压进 tools 名单等于让所有已装连接器永远不可见。
 * 归属已知 server 的 MCP 工具只受 `mcpServers` 轴约束；`serverName` 缺失的
 * 描述符无法映射到白名单，维持旧的 tools ∩ mcpServers 交集语义。
 */
export function allowsAgentMcpTool(configuration: AgentConfiguration, tool: McpRuntimeToolDescriptor): boolean {
	if (tool.serverName !== undefined) {
		return configuration.mcpServers === null || configuration.mcpServers.includes(tool.serverName);
	}
	return allowsAgentResource(configuration.tools, tool.name) && configuration.mcpServers === null;
}

export function selectAgentPlugins(
	config: AgentPluginRuntimeConfig | undefined,
	selection: readonly string[] | null,
): AgentPluginRuntimeConfig | undefined {
	if (!config || selection === null) return config;
	const select = <T extends { readonly pluginId: string }>(items: T[] | undefined) =>
		items?.filter(({ pluginId }) => allowsAgentResource(selection, pluginId));
	return {
		systemPromptContributions: select(config.systemPromptContributions),
		skillPathContributions: select(config.skillPathContributions),
		toolPolicyContributions: select(config.toolPolicyContributions),
		toolContributions: select(config.toolContributions),
		stateContributions: select(config.stateContributions),
		continuationContributions: select(config.continuationContributions),
		systemPromptProviderContributions: select(config.systemPromptProviderContributions),
		mcpServerContributions: select(config.mcpServerContributions),
	};
}

export function readAgentPluginIds(config: AgentPluginRuntimeConfig | undefined): string[] {
	return [
		...new Set(
			Object.values(config ?? {}).flatMap(
				(items) => items?.map((item: { pluginId: string }) => item.pluginId) ?? [],
			),
		),
	].sort();
}

export function selectAgentSkillSource(
	source: CodingAgentPromptResourceSource,
	read: () => AgentConfiguration,
): CodingAgentPromptResourceSource {
	return {
		getAgentsFiles: () => source.getAgentsFiles(),
		getAppendSystemPrompt: () => source.getAppendSystemPrompt(),
		getSystemPrompt: () => source.getSystemPrompt(),
		getSkills: () => {
			const result = source.getSkills();
			const selection = read().skills;
			if (selection === null) return result;
			const skills = result.skills.filter((skill) => allowsAgentResource(selection, skill.name));
			if (selection.some((id) => skills.filter((skill) => skill.name === id).length !== 1))
				throw new AgentConfigurationError("AGENT_CONFIGURATION_RESOURCE_UNAVAILABLE");
			return { ...result, skills };
		},
		refreshContextResourcesIfChanged: (signal) => source.refreshContextResourcesIfChanged(signal),
		refreshSkillsIfChanged: (signal) => source.refreshSkillsIfChanged(signal),
		setRuntimeSkillPaths: (paths, signal) => source.setRuntimeSkillPaths(paths, signal),
	};
}

/** A final intersection, never an activation override that can expand the host surface. */
export function createAgentToolSelection(
	configuration: AgentConfiguration,
	mcpTools: readonly McpRuntimeToolDescriptor[],
): (name: string) => boolean {
	const mcp = new Map(mcpTools.map((tool) => [tool.name, tool]));
	const selectedTools = configuration.tools === null ? null : new Set(configuration.tools);
	return (name) => {
		const mcpTool = mcp.get(name);
		if (mcpTool !== undefined) return allowsAgentMcpTool(configuration, mcpTool);
		return selectedTools === null || selectedTools.has(name);
	};
}

export function selectAgentPromptResourceResolver(
	delegate: CodingAgentPromptResourceResolver | undefined,
	read: () => AgentConfiguration,
): CodingAgentPromptResourceResolver {
	const resolver: CodingAgentPromptResourceResolver = (text, reference, context) => {
		if (!allowsAgentResource(read().skills, reference.name.trim()))
			throw new AgentConfigurationError("AGENT_CONFIGURATION_RESOURCE_UNAVAILABLE");
		return delegate?.(text, reference, context) ?? { text, promptRef: reference };
	};
	resolver.bindForTurn = async (context) => {
		const configuration = read();
		const bound = (await delegate?.bindForTurn?.(context)) ?? delegate;
		return selectAgentPromptResourceResolver(bound, () => configuration);
	};
	return resolver;
}

export function filterAgentTools(
	tools: ReadonlyMap<string, RuntimeToolDefinition>,
	allows: ((name: string) => boolean) | undefined,
): ReadonlyMap<string, RuntimeToolDefinition> {
	return allows ? new Map([...tools].filter(([name]) => allows(name))) : tools;
}

export function validateAgentResourceSelection(
	configuration: AgentConfiguration,
	catalog: AgentConfigurationResourceCatalog,
): void {
	for (const kind of ["skills", "tools", "mcpServers", "plugins"] as const) {
		const selected = configuration[kind];
		if (selected?.some((id) => !catalog[kind].includes(id)))
			throw new AgentConfigurationError("AGENT_CONFIGURATION_RESOURCE_UNAVAILABLE");
	}
	if (configuration.modelKey !== null && !catalog.models.some(({ key }) => key === configuration.modelKey))
		throw new AgentConfigurationError("AGENT_CONFIGURATION_RESOURCE_UNAVAILABLE");
}

/**
 * 能力 Profile 折算进 `overrides.tools` 的默认清单是「开箱默认」而不是硬性白名单
 * （ADR-0128：Profile 只决定开箱默认，不构成硬边界）。宿主没有注册某个默认工具
 * （如未开启 memoryMode 时的 `memory`、只有 RPC host-bridge 才注册的
 * `im_send_attachment`）时，按软默认降级——把缺省名并入目录让准入通过；这些名字
 * 本来就不在模型工具面上，降级不会让不可用工具复活。宿主/用户的显式选择仍由
 * {@link validateAgentResourceSelection} 严格校验。
 */
export function withAgentProfileDefaultToolTolerance(
	catalog: AgentConfigurationResourceCatalog,
	profileDefaultToolNames: readonly string[] | undefined,
): AgentConfigurationResourceCatalog {
	if (!profileDefaultToolNames?.length) return catalog;
	const available = new Set(catalog.tools);
	const missingDefaults = [...new Set(profileDefaultToolNames)].filter((name) => !available.has(name));
	if (missingDefaults.length === 0) return catalog;
	return { ...catalog, tools: [...catalog.tools, ...missingDefaults].sort() };
}
