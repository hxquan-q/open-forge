import type { Message } from "@vetta/ai";
import type { SessionConfig, SessionExecutionMode } from "@vetta/runtime-core";
import type { SessionExtensionFunctionSource } from "@vetta/runtime-core/session-extensions";
import type { MemoryPolicyConfiguration } from "@vetta/runtime-memory";
import { parseMemoryPolicyConfiguration } from "@vetta/runtime-memory";
import {
	type AgentConfigurationSelection,
	parseAgentConfigurationSelection,
} from "../../agent-configuration/configuration-schema.js";
import type { CodingAgentKnowledgeWriteOperations } from "../../features/knowledge/contracts.js";
import type {
	AgentPluginContinuationInvoker,
	AgentPluginRuntimeConfig,
	AgentPluginSystemPromptInvoker,
	AgentPluginToolInvoker,
	AgentPluginTurnHandlerLeaseProvider,
} from "../../model-context/plugin-runtime.js";
import { type ConversationScenario, isConversationScenario } from "../../profiles/index.js";
import type {
	CodingAgentPinnedModelContextBinder,
	CodingAgentRuntimeToolRegistration,
	CodingAgentSessionToolRegistration,
} from "../../runtime-contracts/index.js";

export type CodingAgentInitialTodoLockSource = "scene";

export interface CodingAgentRuntimeSessionOptions {
	readonly sessionId: string;
	readonly scenario?: ConversationScenario;
	readonly cwd?: string;
	readonly model?: NonNullable<SessionConfig["model"]>;
	readonly thinkingLevel?: NonNullable<SessionConfig["thinkingLevel"]>;
	readonly agentMode?: string;
	readonly agentConfiguration?: AgentConfigurationSelection;
	/**
	 * 宿主把能力 Profile 默认工具清单折算进 `agentConfiguration.overrides.tools` 时，
	 * 同一份清单的证据（BUG-0014）。准入校验对其中宿主未注册的名字按软默认降级，
	 * 而不是让整个会话创建以 AGENT_CONFIGURATION_RESOURCE_UNAVAILABLE 失败；
	 * 显式（用户 / Agent Profile）选择不受影响，仍严格校验。
	 */
	readonly profileDefaultToolNames?: readonly string[];
	readonly executionMode?: SessionExecutionMode;
	readonly env?: Readonly<Record<string, string>>;
	readonly enableBackgroundTasks?: boolean;
	readonly includeAgentSkills?: boolean;
	/** Disable Runtime-host retries when an outer durable task scheduler owns retry policy. */
	readonly automaticRetry?: boolean;
	readonly agentPlugins?: AgentPluginRuntimeConfig;
	readonly invokePluginTool?: AgentPluginToolInvoker;
	readonly invokePluginContinuation?: AgentPluginContinuationInvoker;
	readonly invokePluginSystemPrompt?: AgentPluginSystemPromptInvoker;
	readonly pluginTurnHandlerLeaseProvider?: AgentPluginTurnHandlerLeaseProvider;
	/** Session 私有的 typed function 来源；优先于 Composition 默认来源。 */
	readonly sessionExtensionFunctions?: SessionExtensionFunctionSource;
	readonly sandboxHostPath?: string;
	readonly linuxBubblewrapPath?: string;
	readonly macosSandboxExecPath?: string;
	readonly parentSessionPath?: string;
	readonly parentEntryId?: string;
	readonly memoryMode?: boolean;
	readonly memoryFile?: string;
	readonly memoryCharLimit?: number;
	/**
	 * 新结构化记忆策略（ADR-0149，TASK-0369）：与 legacy memoryMode 正交；
	 * 值为宿主已解析的 MemoryPolicyConfiguration，首次进入边界时校验。
	 */
	readonly memoryPolicy?: MemoryPolicyConfiguration;
	/** 子 Session 内部 Profile 使用；根宿主无需设置。 */
	readonly systemPromptAddon?: string;
	/** Host-owned system instructions shared byte-for-byte before a cache boundary. */
	readonly systemPromptCachePrefixAddon?: string;
	/** Host-owned trusted instructions that must remain outside the shared cache prefix. */
	readonly systemPromptVolatileAddon?: string;
	/** Host-owned immutable model prefix captured once per Turn. */
	readonly bindPinnedModelContext?: CodingAgentPinnedModelContextBinder;
	/** Provider cache partition independent from this isolated Session identity. */
	readonly promptCacheKey?: string;
	/** Workflow 子 Session 的父分支只读快照。 */
	readonly forkContextMessages?: readonly Message[];
	/** Workflow 子 Session 的初始 Todo。 */
	readonly initialTodos?: readonly string[];
	/** 产品组合创建初始 Todo 后施加的锁；不会暴露可写 TodoStore 给宿主。 */
	readonly initialTodoLockSource?: CodingAgentInitialTodoLockSource;
	/** 产品会话自己的 Knowledge Writer；普通会话继续使用 Composition 默认实现。 */
	readonly knowledgePageWriter?: CodingAgentKnowledgeWriteOperations;
	/** 由产品宿主校验并适配的 Session 私有工具；同名定义覆盖进程级 Extension 工具。 */
	readonly sessionTools?: readonly CodingAgentSessionToolRegistration[];
	/** 仅由产品宿主为单个 Session 注入的中立 Runtime Tool 注册。 */
	readonly sessionRuntimeTools?: readonly CodingAgentRuntimeToolRegistration[];
}

/** RuntimeHost 创建前可用的 Coding Agent 产品配置；Session id 可由后端按路径解析。 */
export type CodingAgentRuntimeSessionConfiguration = Omit<CodingAgentRuntimeSessionOptions, "sessionId"> & {
	readonly sessionId?: string;
};

/** Coding Agent Definition 边界的 Session payload 校验。 */
export function requireCodingAgentRuntimeSessionOptions(value: unknown): CodingAgentRuntimeSessionOptions {
	const configuration = parseCodingAgentRuntimeSessionConfiguration(value);
	const sessionId = requireNonEmptyString(configuration.sessionId, "sessionId");
	return { ...configuration, sessionId };
}

/** 平台组合在 Runtime 解析持久化身份前校验产品配置。 */
export function parseCodingAgentRuntimeSessionConfiguration(value: unknown): CodingAgentRuntimeSessionConfiguration {
	if (!isRecord(value)) {
		throw new Error("Coding Agent Runtime Session requires an object configuration");
	}
	if (value.sessionId !== undefined) requireNonEmptyString(value.sessionId, "sessionId");
	const agentConfiguration =
		value.agentConfiguration === undefined ? undefined : parseAgentConfigurationSelection(value.agentConfiguration);
	assertOptionalStringFields(value, [
		"cwd",
		"scenario",
		"thinkingLevel",
		"agentMode",
		"executionMode",
		"sandboxHostPath",
		"linuxBubblewrapPath",
		"macosSandboxExecPath",
		"parentSessionPath",
		"parentEntryId",
		"memoryFile",
		"systemPromptAddon",
		"systemPromptCachePrefixAddon",
		"systemPromptVolatileAddon",
		"promptCacheKey",
		"initialTodoLockSource",
	]);
	if (value.scenario !== undefined && !isConversationScenario(value.scenario)) {
		throw new Error("Coding Agent Runtime Session field scenario is invalid");
	}
	assertOptionalBooleanFields(value, ["automaticRetry", "enableBackgroundTasks", "includeAgentSkills", "memoryMode"]);
	assertOptionalNumberFields(value, ["memoryCharLimit"]);
	assertOptionalArrayFields(value, [
		"profileDefaultToolNames",
		"forkContextMessages",
		"initialTodos",
		"sessionTools",
		"sessionRuntimeTools",
	]);
	assertOptionalFunctionFields(value, [
		"invokePluginTool",
		"invokePluginContinuation",
		"invokePluginSystemPrompt",
		"bindPinnedModelContext",
	]);
	assertOptionalRecordFields(value, [
		"model",
		"agentPlugins",
		"pluginTurnHandlerLeaseProvider",
		"sessionExtensionFunctions",
		"knowledgePageWriter",
		"memoryPolicy",
	]);
	const memoryPolicy =
		value.memoryPolicy === undefined ? undefined : parseMemoryPolicyConfiguration(value.memoryPolicy);
	if (value.env !== undefined) {
		if (!isRecord(value.env) || Object.values(value.env).some((item) => typeof item !== "string")) {
			throw new Error("Coding Agent Runtime Session field env must contain only string values");
		}
	}
	return {
		...value,
		...(agentConfiguration ? { agentConfiguration } : {}),
		...(memoryPolicy ? { memoryPolicy } : {}),
	} as CodingAgentRuntimeSessionConfiguration;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, field: string): string {
	if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
		throw new Error(`Coding Agent Runtime Session field ${field} must be a non-empty trimmed string`);
	}
	return value;
}

function assertOptionalStringFields(value: Record<string, unknown>, fields: readonly string[]): void {
	for (const field of fields) {
		if (value[field] !== undefined && typeof value[field] !== "string") {
			throw new Error(`Coding Agent Runtime Session field ${field} must be a string`);
		}
	}
}

function assertOptionalBooleanFields(value: Record<string, unknown>, fields: readonly string[]): void {
	for (const field of fields) {
		if (value[field] !== undefined && typeof value[field] !== "boolean") {
			throw new Error(`Coding Agent Runtime Session field ${field} must be a boolean`);
		}
	}
}

function assertOptionalNumberFields(value: Record<string, unknown>, fields: readonly string[]): void {
	for (const field of fields) {
		if (value[field] !== undefined && typeof value[field] !== "number") {
			throw new Error(`Coding Agent Runtime Session field ${field} must be a number`);
		}
	}
}

function assertOptionalArrayFields(value: Record<string, unknown>, fields: readonly string[]): void {
	for (const field of fields) {
		if (value[field] !== undefined && !Array.isArray(value[field])) {
			throw new Error(`Coding Agent Runtime Session field ${field} must be an array`);
		}
	}
}

function assertOptionalFunctionFields(value: Record<string, unknown>, fields: readonly string[]): void {
	for (const field of fields) {
		if (value[field] !== undefined && typeof value[field] !== "function") {
			throw new Error(`Coding Agent Runtime Session field ${field} must be a function`);
		}
	}
}

function assertOptionalRecordFields(value: Record<string, unknown>, fields: readonly string[]): void {
	for (const field of fields) {
		if (value[field] !== undefined && !isRecord(value[field])) {
			throw new Error(`Coding Agent Runtime Session field ${field} must be an object`);
		}
	}
}
