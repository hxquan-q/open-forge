// Modified by The Open Forge contributors.
import { resolve } from "node:path";
import { buildDesktopCliGuidance } from "@vetta/coding-agent/cli-guidance";
import { createCodingAgentRuntimeSessionSelection } from "@vetta/coding-agent/composition";
import type { AgentConfigurationSelection, ConversationScenario } from "@vetta/coding-agent/profile";
import {
	appliesAgentProfileDefaultTools,
	applyAgentProfileDefaults,
	resolveAgentProfile,
} from "@vetta/coding-agent/profile";
import { loadProjectToolPolicy, resolveToolCatalogPolicy } from "@vetta/coding-agent/projects";
import type {
	CodingAgentPinnedModelContextBinder,
	CodingAgentRuntimeToolRegistration,
} from "@vetta/coding-agent/runtime";
import type { SessionConfig } from "@vetta/runtime-core";
import type { SessionExtensionFunctionSource } from "@vetta/runtime-core/session-extensions";
import { normalizeProjectCwd } from "@vetta/ssh-transport";
import { resolveDesktopBrandName } from "../../shared/desktop-brand.js";
import { getAppLanguage } from "../i18n/index.js";
import { allowProjectRoot, readDesktopConfig } from "../ipc/fs.js";
import { type DesktopAgentMode, LEGACY_SESSION_AGENT_MODE, readSessionAgentMode } from "./session-agent-mode-store.js";
import {
	ensureConversationSubCwd,
	ensureSessionWorkingCwd,
	readSessionCwdFromHeader,
	resolveSessionDirForCwd,
	resolveSessionListCwd,
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
	 * 恢复已有会话时不采纳该值（TASK-0078）：渲染层页头会随用户切换变化，
	 * 按它恢复等于把固化工具面改写成「当前」工作区。
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
	/**
	 * 会话级 Session Extension 函数源（TASK-0123）：缺省用 Composition 共享源；
	 * 团队成员会话经收窄源隐藏无 WebView 后端的 browser_tab。
	 */
	readonly sessionExtensionFunctions?: SessionExtensionFunctionSource;
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
	/**
	 * 本会话固化的能力 Profile。新建时取渲染层传入值，缺省回落 coding；
	 * 恢复时按创建时固化的 agentMode 记录折算，无记录（历史会话）回落 coding
	 * 缺省——不跟随当前工作区，也不做能力收紧（TASK-0078）。
	 */
	capabilityProfile: "work" | "coding";
}

interface ResolvedSessionAgentAxes {
	agentMode: DesktopAgentMode;
	/** 该会话创建时固化的 agentMode 记录；新建会话与无记录的历史会话为 undefined。 */
	frozenAgentMode: DesktopAgentMode | undefined;
}

export interface ResolveDesktopSessionConfigOptions {
	/**
	 * 按会话绑定项目构造本会话注入的运行时工具（如定时任务）。入参是按会话
	 * listCwd 归一后的项目根；恢复既有会话时同样以它为准，前台项目切换不会
	 * 改变后台会话的作用域。
	 */
	readonly createSessionRuntimeTools?: (
		projectCwd: string,
	) => readonly CodingAgentRuntimeToolRegistration[] | undefined;
}

/**
 * 工作模式的唯一来源：
 * - 新建会话优先取渲染层按当前工作区派生的 agentMode，否则回落 desktop-config 默认值；
 * - 恢复已有会话取该会话创建时固化的记录，缺记录时回落常量，绝不回落当前默认值，
 *   否则改默认值会连带改写历史会话的模式。
 * 同时带回「记录是否存在」：能力 Profile 的固化守卫要靠它区分
 * 「会话固化过记录」与「历史会话从无记录」两条恢复路径（TASK-0078）。
 */
async function resolveSessionAgentMode(
	existingSessionPath: string | undefined,
	requestedAgentMode: DesktopAgentMode | undefined,
	defaultAgentMode: DesktopAgentMode,
): Promise<ResolvedSessionAgentAxes> {
	if (existingSessionPath) {
		const frozenAgentMode = await readSessionAgentMode(existingSessionPath);
		return { agentMode: frozenAgentMode ?? LEGACY_SESSION_AGENT_MODE, frozenAgentMode };
	}
	return { agentMode: requestedAgentMode ?? defaultAgentMode, frozenAgentMode: undefined };
}

/**
 * 能力 Profile（ADR-0128）的来源与固化守卫（TASK-0078），优先级从高到低：
 * 1. 恢复会话且存在创建时固化的 agentMode 记录：按记录折算，**不采纳请求值**——
 *    渲染层曾把「当前」页头派生的 Profile 随 resume 下发，一旦采纳就会把 coding
 *    会话静默改写成 work 工具子集；
 * 2. 其余（新建会话、无记录的历史会话）：显式请求值优先（团队 Runtime 据此声明
 *    coding 裁决）；未传时维持 `resolveAgentProfile(undefined)` 的 coding 缺省——
 *    debug/remote-control 等未传方不做能力收紧，也不会被 agentMode 的默认值
 *    （work）连带收窄工具面。
 * 无记录的历史会话按 coding 恢复而不是 LEGACY 常量折算的 work：Profile 轴自己的
 * 合同是「缺省回落 coding，避免静默改变既有会话」，与 agentMode 轴的提示词回落
 * 各自独立、互不影响。
 */
function resolveSessionCapabilityProfile(
	requestedCapabilityProfile: DesktopCodingAgentSessionConfig["capabilityProfile"],
	frozenAgentMode: DesktopAgentMode | undefined,
): "work" | "coding" {
	if (frozenAgentMode !== undefined) return frozenAgentMode === "work" ? "work" : "coding";
	const requested =
		requestedCapabilityProfile === "work" || requestedCapabilityProfile === "coding"
			? requestedCapabilityProfile
			: undefined;
	return requested ?? "coding";
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
	options?: ResolveDesktopSessionConfigOptions,
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
	// 指引正文里的产品名随当前品牌档位（默认小爱ai / Allstr ai，self 档 Open Forge）。
	const cliGuidance = buildDesktopCliGuidance(resolveDesktopBrandName(getAppLanguage()));
	const appendSystemPrompt =
		isConversation && desktopConfig.experimental?.vettaCli === true
			? config?.appendSystemPrompt
				? `${config.appendSystemPrompt}\n\n${cliGuidance}`
				: cliGuidance
			: config?.appendSystemPrompt;
	const { agentMode, frozenAgentMode } = await resolveSessionAgentMode(
		config?.sessionPath,
		config?.agentMode,
		desktopConfig.defaultAgentMode ?? "work",
	);
	const capabilityProfile = resolveSessionCapabilityProfile(config?.capabilityProfile, frozenAgentMode);
	// 能力收敛（ADR-0128 + TASK-0021）：Profile 默认折算 → 项目策略只能再收紧。
	// BUG-0014：默认清单折算成显式 `overrides.tools` 时，agent 侧准入会按可用目录
	// 逐名核对，Desktop 没注册的默认项（memory / im_send_attachment 等）会让整个
	// session.create 以 AGENT_CONFIGURATION_RESOURCE_UNAVAILABLE 失败。把同一份
	// 清单作为软默认证据随会话下发，agent 侧据此降级而不是判创建失败。
	const agentProfile = resolveAgentProfile(capabilityProfile);
	const resolvedAgentConfiguration = await applyProjectToolPolicy(
		effectiveCwd,
		applyAgentProfileDefaults(agentProfile, config?.agentConfiguration),
	);
	const profileDefaultToolNames = appliesAgentProfileDefaultTools(agentProfile, config?.agentConfiguration)
		? (agentProfile.defaultToolNames ?? undefined)
		: undefined;
	// 会话绑定项目的工具注入：作用域在配置解析期按生效 cwd 固化一次。
	const projectScopeCwd = normalizeProjectCwd(resolveSessionListCwd(effectiveCwd), resolve);
	const injectedRuntimeTools = [
		...(config?.sessionRuntimeTools ?? []),
		...(options?.createSessionRuntimeTools?.(projectScopeCwd) ?? []),
	];
	const sessionRuntimeTools = injectedRuntimeTools.length > 0 ? injectedRuntimeTools : undefined;
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
		sessionExtensionFunctions: _sessionExtensionFunctions,
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
					...(profileDefaultToolNames ? { profileDefaultToolNames } : {}),
					sessionRuntimeTools,
					sessionExtensionFunctions: config?.sessionExtensionFunctions,
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
		capabilityProfile,
	};
}
