// Modified by The Open Forge contributors.
import { VETTA_CLI_GUIDANCE } from "@vetta/coding-agent/cli-guidance";
import { createCodingAgentRuntimeSessionSelection } from "@vetta/coding-agent/composition";
import type { AgentConfigurationSelection, ConversationScenario } from "@vetta/coding-agent/profile";
import { applyAgentProfileDefaults, resolveAgentProfile } from "@vetta/coding-agent/profile";
import { loadProjectToolPolicy, resolveToolCatalogPolicy } from "@vetta/coding-agent/projects";
import type {
	CodingAgentPinnedModelContextBinder,
	CodingAgentRuntimeToolRegistration,
} from "@vetta/coding-agent/runtime";
import type { SessionConfig } from "@vetta/runtime-core";
import { allowProjectRoot, readDesktopConfig } from "../ipc/fs.js";
import { type DesktopAgentMode, LEGACY_SESSION_AGENT_MODE, readSessionAgentMode } from "./session-agent-mode-store.js";
import {
	ensureConversationSubCwd,
	ensureSessionWorkingCwd,
	readSessionCwdFromHeader,
	resolveSessionDirForCwd,
} from "./session-paths.js";

export type DesktopConversationSource = "interactive" | "debug";
export type DesktopSessionKind = "conversation" | "other";

/** Desktop 的 Coding Agent 产品输入；产品字段不会进入 Runtime Core 的 SessionConfig。 */
export interface DesktopCodingAgentSessionConfig extends SessionConfig {
	readonly scenario?: ConversationScenario;
	readonly agentMode?: DesktopAgentMode;
	/**
	 * 本会话绑定的 Agent Profile 身份（新建时由渲染层传入）。这里只是身份：
	 * 人格与能力白名单由 desktop-conversation-service 查表折算成 agentConfiguration
	 * 与 systemPromptVolatileAddon 后再进来，渲染层无从自述能力。
	 */
	readonly agentProfileId?: string;
	/**
	 * 能力 Profile（ADR-0128）：新建时由渲染层按当前 WorkspaceMode 派生传入，
	 * 固化本会话的工具/Memory 默认；显式 agentConfiguration 选择优先于默认。
	 */
	readonly capabilityProfile?: "work" | "coding";
	readonly appendSystemPrompt?: string;
	readonly systemPromptCachePrefixAddon?: string;
	readonly systemPromptVolatileAddon?: string;
	readonly enableBackgroundTasks?: boolean;
	readonly includeAgentSkills?: boolean;
	readonly automaticRetry?: boolean;
	readonly agentConfiguration?: AgentConfigurationSelection;
	readonly sessionRuntimeTools?: readonly CodingAgentRuntimeToolRegistration[];
	readonly bindPinnedModelContext?: CodingAgentPinnedModelContextBinder;
	readonly promptCacheKey?: string;
}

export interface ResolvedDesktopSessionConfig {
	config: SessionConfig;
	cwd: string;
	scenario: ConversationScenario;
	includeAgentSkills: boolean;
	/** 本会话固化的工作模式；创建后由调用方落盘，会话内不可变。 */
	agentMode: DesktopAgentMode;
}

/**
 * 工作模式的唯一来源：
 * - 新建会话取 desktop-config 的 defaultAgentMode（新会话默认值）；
 * - 恢复已有会话取该会话创建时固化的记录，缺记录时回落常量，绝不回落当前默认值，
 *   否则改默认值会连带改写历史会话的模式。
 */
async function resolveSessionAgentMode(
	existingSessionPath: string | undefined,
	defaultAgentMode: DesktopAgentMode,
): Promise<DesktopAgentMode> {
	if (!existingSessionPath) return defaultAgentMode;
	return (await readSessionAgentMode(existingSessionPath)) ?? LEGACY_SESSION_AGENT_MODE;
}

/**
 * 项目工具策略（`.vetta/policies/tools.json`）只能收紧：从已折算的工具集合里
 * 剔除 deny 名单（TASK-0021）。策略损坏时 fail closed——直接抛错终止创建，
 * 不带病放宽；无策略文件时原样返回。
 */
async function applyProjectToolPolicy(
	projectRoot: string,
	selection: AgentConfigurationSelection,
): Promise<AgentConfigurationSelection> {
	const policy = await loadProjectToolPolicy(projectRoot);
	if (!policy) return selection;
	const selectedTools = selection.overrides.tools;
	const resolved = resolveToolCatalogPolicy({
		profileDefaultToolNames: selectedTools ?? null,
		explicitToolNames: selectedTools === null ? undefined : selectedTools,
		projectDeniedToolNames: policy.denyTools,
	});
	if (resolved.toolNames === undefined) return selection;
	return { ...selection, overrides: { ...selection.overrides, tools: [...resolved.toolNames] } };
}

export async function resolveDesktopSessionConfig(
	config: DesktopCodingAgentSessionConfig | undefined,
	kind: DesktopSessionKind,
	source: DesktopConversationSource,
): Promise<ResolvedDesktopSessionConfig> {
	const requestedCwd = config?.cwd ?? process.cwd();
	allowProjectRoot(requestedCwd);
	const injectedSessionDir = config?.sessionDir ?? resolveSessionDirForCwd(requestedCwd);
	const cwdFromExistingHeader = config?.sessionPath ? await readSessionCwdFromHeader(config.sessionPath) : undefined;
	const effectiveCwd = cwdFromExistingHeader ?? (await ensureConversationSubCwd(requestedCwd)) ?? requestedCwd;
	await ensureSessionWorkingCwd(effectiveCwd);
	if (effectiveCwd !== requestedCwd) {
		allowProjectRoot(effectiveCwd);
	}

	const isConversation = kind === "conversation";
	const scenario: ConversationScenario = config?.scenario ?? (isConversation ? "conversation" : "project");
	const desktopConfig = await readDesktopConfig();
	const enableBackgroundTasks = source === "interactive" && scenario !== "batch";
	const includeAgentSkills = desktopConfig.experimental?.agentSkills !== false;
	const appendSystemPrompt =
		isConversation && desktopConfig.experimental?.vettaCli === true
			? config?.appendSystemPrompt
				? `${config.appendSystemPrompt}\n\n${VETTA_CLI_GUIDANCE}`
				: VETTA_CLI_GUIDANCE
			: config?.appendSystemPrompt;
	const agentMode = await resolveSessionAgentMode(config?.sessionPath, desktopConfig.defaultAgentMode ?? "work");
	// 能力收敛（ADR-0128 + TASK-0021）：Profile 默认折算 → 项目策略只能再收紧。
	const resolvedAgentConfiguration = await applyProjectToolPolicy(
		effectiveCwd,
		applyAgentProfileDefaults(resolveAgentProfile(config?.capabilityProfile), config?.agentConfiguration),
	);
	const {
		scenario: _scenario,
		agentMode: _agentMode,
		agentProfileId: _agentProfileId,
		capabilityProfile: _capabilityProfile,
		appendSystemPrompt: _appendSystemPrompt,
		systemPromptCachePrefixAddon: _systemPromptCachePrefixAddon,
		systemPromptVolatileAddon: _systemPromptVolatileAddon,
		enableBackgroundTasks: _enableBackgroundTasks,
		includeAgentSkills: _includeAgentSkills,
		automaticRetry: _automaticRetry,
		bindPinnedModelContext: _bindPinnedModelContext,
		promptCacheKey: _promptCacheKey,
		agentConfiguration: _agentConfiguration,
		sessionRuntimeTools: _sessionRuntimeTools,
		...runtimeConfig
	} = config ?? {};
	return {
		config: {
			...runtimeConfig,
			agent: createCodingAgentRuntimeSessionSelection(
				{
					sessionId: config?.sessionId,
					scenario,
					agentMode,
					systemPromptAddon: appendSystemPrompt,
					systemPromptCachePrefixAddon: config?.systemPromptCachePrefixAddon,
					systemPromptVolatileAddon: config?.systemPromptVolatileAddon,
					enableBackgroundTasks,
					includeAgentSkills,
					automaticRetry: config?.automaticRetry,
					agentConfiguration: resolvedAgentConfiguration,
					sessionRuntimeTools: config?.sessionRuntimeTools,
					bindPinnedModelContext: config?.bindPinnedModelContext,
					promptCacheKey: config?.promptCacheKey,
				},
				config?.agent,
			),
			cwd: effectiveCwd,
			sessionDir: injectedSessionDir ?? config?.sessionDir,
		},
		cwd: effectiveCwd,
		scenario,
		includeAgentSkills,
		agentMode,
	};
}
