// Modified by The Open Forge contributors.
import type { Message } from "@vetta/ai";
import type { SessionConfig } from "@vetta/runtime-core";
import type { McpRuntimeToolView } from "@vetta/runtime-mcp";
import type {
	SubagentChildHandle,
	SubagentSnapshot,
	SubagentSpawnRequest,
	SubagentTypeDefinition,
} from "@vetta/runtime-subagents";
import type { ConversationScenario } from "../../profiles/index.js";
import type { CodingAgentRuntimeToolRegistration, CodingAgentToolActivation } from "../../runtime-contracts/index.js";

export interface CodingAgentSubagentProfile {
	/** Tool inheritance defaults to the parent's activation when omitted. */
	readonly toolPolicy?: CodingAgentSubagentToolPolicy;
	/** MCP inheritance defaults to the parent view when omitted. */
	readonly mcpPolicy?: CodingAgentSubagentMcpPolicy;
	/** Skills inherit from the parent by default and may be hidden or allow-listed. */
	readonly skillPolicy?: CodingAgentSubagentSkillPolicy;
	/** Parent context defaults to a full point-in-time snapshot. */
	readonly contextPolicy?: CodingAgentSubagentContextPolicy;
	/** Todo is disabled by default unless the definition explicitly enables it. */
	readonly todoPolicy?: CodingAgentSubagentTodoPolicy;
	/** Workspace defaults to the parent's cwd; hosts may provide isolated leases for selected definitions. */
	readonly workspacePolicy?: CodingAgentSubagentWorkspacePolicy;
	readonly systemPromptAddon: string;
	readonly createRuntimeTools?: (cwd: string) => readonly CodingAgentRuntimeToolRegistration[];
	/**
	 * 委任成员标记（REQ-0034）：resident 成员由 spawn 守卫拒绝重复起实例并引导
	 * followup_task；缺省表示普通类型，不参与守卫。
	 */
	readonly delegation?: CodingAgentSubagentDelegationPolicy;
	/** @deprecated Use toolPolicy. Kept while custom registries migrate. */
	readonly activation?: CodingAgentToolActivation;
	/** @deprecated Use mcpPolicy. Kept while custom registries migrate. */
	readonly inheritParentMcp?: boolean;
	/** @deprecated Use contextPolicy. Kept while custom registries migrate. */
	readonly forkParentContext?: boolean;
	/** @deprecated Use todoPolicy. Kept while custom registries migrate. */
	readonly includeTodo?: boolean;
	/** @deprecated Use mcpPolicy.denyNamePrefixes. */
	readonly denyToolNamePrefixes?: readonly string[];
}

export interface CodingAgentSubagentDelegationPolicy {
	/** resident：spawn 一次 durable 会话 + followup_task 排队；oneshot：每任务一次。 */
	readonly lifecycle: "resident" | "oneshot";
}

export type CodingAgentSubagentToolPolicy =
	| { readonly mode: "inherit" }
	| { readonly mode: "activation"; readonly activation: CodingAgentToolActivation };

export type CodingAgentSubagentMcpPolicy =
	| { readonly mode: "inherit"; readonly denyNamePrefixes?: readonly string[] }
	| { readonly mode: "none" };

export type CodingAgentSubagentSkillPolicy =
	| { readonly mode: "inherit" }
	| { readonly mode: "none" }
	| { readonly mode: "allow"; readonly names: readonly string[] };

export type CodingAgentSubagentContextPolicy = { readonly mode: "full" } | { readonly mode: "fresh" };

export type CodingAgentSubagentTodoPolicy = { readonly mode: "enabled" } | { readonly mode: "disabled" };

export type CodingAgentSubagentWorkspacePolicy =
	| { readonly mode: "shared" }
	| { readonly mode: "isolated"; readonly fallback: "error" | "shared" };

export interface CodingAgentSubagentWorkspaceLease {
	readonly cwd: string;
	readonly mode: "shared" | "isolated";
	release(): Promise<void> | void;
}

export interface CodingAgentSubagentWorkspacePort {
	acquire(input: {
		readonly parentCwd: string;
		readonly childId: string;
		readonly taskName: string;
		readonly policy: CodingAgentSubagentWorkspacePolicy;
	}): Promise<CodingAgentSubagentWorkspaceLease>;
}

export interface CodingAgentSubagentChildFactoryContext {
	readonly cwd: string;
	readonly scenario: ConversationScenario;
	readonly readParentSessionId: () => string;
	readonly readParentSessionPath: () => string;
	readonly readModel: () => NonNullable<SessionConfig["model"]>;
	readonly readThinkingLevel: () => NonNullable<SessionConfig["thinkingLevel"]>;
	readonly readInheritedMcpView: () => Promise<McpRuntimeToolView>;
	readonly readParentToolActivation: () => CodingAgentToolActivation | undefined;
	readonly workspacePort?: CodingAgentSubagentWorkspacePort;
}

export interface CodingAgentSubagentChildFactory {
	create(
		request: CodingAgentSubagentChildRequest,
		type: SubagentTypeDefinition<CodingAgentSubagentProfile>,
		forkContext: readonly Message[] | undefined,
		signal?: AbortSignal,
	): Promise<SubagentChildHandle>;
	reopen?(
		snapshot: SubagentSnapshot,
		type: SubagentTypeDefinition<CodingAgentSubagentProfile>,
		forkContext: readonly Message[] | undefined,
		signal?: AbortSignal,
		onTodoItemsChanged?: CodingAgentSubagentTodoItemsListener,
	): Promise<SubagentChildHandle>;
}

export type CodingAgentSubagentTodoItemsListener = (items: readonly { readonly status: string }[]) => void;

/** 产品 Child Factory 输入；通用调度请求不携带 Todo 等 Session Extension 配置。 */
export interface CodingAgentSubagentChildRequest extends SubagentSpawnRequest {
	readonly initialTodos?: readonly string[];
	/** 自定义 Child Factory 用它把产品 Todo Extension 的状态变化回传给组合层。 */
	readonly onTodoItemsChanged?: CodingAgentSubagentTodoItemsListener;
}
