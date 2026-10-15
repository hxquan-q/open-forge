import type { RuntimeConfigurationSnapshotSource } from "@vetta/runtime-core/configuration";
import type { AsyncExecutionGate, BackgroundCommandService, CodingToolRegistration } from "@vetta/runtime-tools";
import type { ConversationScenario } from "../../profiles/index.js";

export interface CodingAgentToolEnvironmentContext {
	readonly cwd: string;
	readonly agentDir?: string;
	readonly scenario: ConversationScenario;
	readonly configurationSource?: RuntimeConfigurationSnapshotSource;
	/**
	 * 当前会话真实可调用的技能名。二进制读提示据此决定「能不能点名某个技能」；
	 * 缺省表示宿主无法确认，提示侧一律按「没有可用技能」处理（绝不自造技能名）。
	 */
	readonly availableSkillNames?: () => ReadonlySet<string> | undefined;
}

/** 平台提供的文件、命令等基础 Tool；产品 Tool、选择、排序和结果策略由 Coding Agent 决定。 */
export interface CodingAgentToolEnvironment {
	readonly registrations: readonly CodingToolRegistration[];
	readonly backgroundService?: BackgroundCommandService;
	readonly createSpecializedToolRegistrations?: (
		context: CodingAgentSpecializedToolRegistrationContext,
	) => readonly CodingToolRegistration[] | Promise<readonly CodingToolRegistration[]>;
	dispose(): void;
}

export interface CodingAgentSpecializedToolRegistrationContext extends CodingAgentToolEnvironmentContext {
	readonly ocrExecutionGate: AsyncExecutionGate;
}

export type CodingAgentToolEnvironmentFactory = (
	context: CodingAgentToolEnvironmentContext,
) => CodingAgentToolEnvironment | Promise<CodingAgentToolEnvironment>;
