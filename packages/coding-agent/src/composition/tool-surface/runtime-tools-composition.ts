// Modified by The Open Forge contributors.
import type { RuntimeObservationPublisher } from "@vetta/runtime-core";
import {
	type AgentFeatureDefinition,
	type CompiledRuntimeSnapshot,
	createDefaultRuntimeCapabilityDefinition,
	FeatureCompiler,
	type ModelCallContributionContext,
	RandomIdGenerator,
	type RuntimeCapabilityDefinition,
} from "@vetta/runtime-core/kernel";
import {
	type BackgroundCommandService,
	type CodingToolCatalogRefresher,
	type CodingToolRegistration,
	type CodingToolRegistry,
	type CodingToolResultPolicy,
	createCodingToolsFeature,
	InMemoryCodingToolRegistry,
	PRESERVE_CODING_TOOL_RESULT_POLICY,
} from "@vetta/runtime-tools";
import {
	createTaskOutputToolRegistration,
	createTaskStopToolRegistration,
} from "../../features/background-tasks/index.js";
import { createCurrentTimeToolRegistration } from "../../features/current-time/index.js";
import {
	type CodingAgentRuntimeToolRegistration,
	type CodingAgentToolActivation,
	selectCodingAgentToolRegistrations,
} from "../../runtime-contracts/index.js";
import { CODING_AGENT_MODEL_TOOL_ORDER } from "../../tool-policy/model-tool-order.js";
import { declareCodingAgentPlatformTools } from "../../tool-policy/platform-tool-declarations.js";
import type { CodingAgentSpecializedToolRegistrationContext, CodingAgentToolEnvironment } from "../contracts/index.js";

export interface CodingToolsRuntimeCompositionOptions {
	readonly cwd: string;
	readonly environment: CodingAgentToolEnvironment;
	readonly activation?: CodingAgentToolActivation;
	readonly resolveActivation?: (
		context: ModelCallContributionContext,
	) => Promise<CodingAgentToolActivation> | CodingAgentToolActivation;
	readonly refreshCatalog?: CodingToolCatalogRefresher;
	readonly filterRegistration?: (
		registration: CodingAgentRuntimeToolRegistration,
		context: ModelCallContributionContext,
	) => Promise<boolean> | boolean;
	readonly additionalRegistrations?: readonly CodingAgentRuntimeToolRegistration[];
	readonly resultPolicy?: CodingToolResultPolicy;
	readonly tokenBudget?: number;
	readonly reservedOutputTokens?: number;
	readonly observationPublisher?: RuntimeObservationPublisher;
	/**
	 * 模型请求面的工具准入（与执行面的审批拦截器构成双重检查）。
	 * 缺省保持放行：per-call 风险等级在模型面仍可见，真正的逐次审批在执行面。
	 */
	readonly authorizeTool?: (toolName: string, input: unknown) => Promise<boolean> | boolean;
}

export interface CodingToolsRuntimeComposition {
	readonly cwd: string;
	readonly backgroundService?: BackgroundCommandService;
	readonly createSpecializedToolRegistrations?: (
		context: CodingAgentSpecializedToolRegistrationContext,
	) => readonly CodingToolRegistration[] | Promise<readonly CodingToolRegistration[]>;
	readonly registry: CodingToolRegistry;
	/** 注册表实际生效的默认结果策略；插件/扩展运行时复用同一实例。 */
	readonly resultPolicy: CodingToolResultPolicy;
	readonly registerTool: (registration: CodingAgentRuntimeToolRegistration) => void;
	readonly unregisterTool: (toolName: string) => boolean;
	readonly readToolDeclaration: (toolName: string) => CodingAgentRuntimeToolRegistration | undefined;
	readonly feature: AgentFeatureDefinition;
	readonly capabilities: RuntimeCapabilityDefinition;
	readonly compiler: FeatureCompiler;
	readonly compile: (signal?: AbortSignal) => Promise<CompiledRuntimeSnapshot>;
	readonly dispose: () => void;
}

export function createCodingToolsRuntimeComposition(
	options: CodingToolsRuntimeCompositionOptions,
): CodingToolsRuntimeComposition {
	const cwd = options.cwd;
	const backgroundService = options.environment.backgroundService;
	const builtInRegistrations: CodingAgentRuntimeToolRegistration[] = [
		createCurrentTimeToolRegistration(),
		...(backgroundService
			? [
					createTaskOutputToolRegistration({ backgroundService }),
					createTaskStopToolRegistration({ backgroundService }),
				]
			: []),
	];
	const codingAgentRegistrations = [...builtInRegistrations, ...(options.additionalRegistrations ?? [])].map(
		withCodingAgentModelOrder,
	);
	const platformRegistrations = declareCodingAgentPlatformTools(
		options.environment.registrations.filter(({ tool }) => !CODING_AGENT_OWNED_BASE_TOOL_NAMES.has(tool.name)),
	).map(withCodingAgentModelOrder);
	const declarationsByName = new Map<string, CodingAgentRuntimeToolRegistration>(
		[...platformRegistrations, ...codingAgentRegistrations].map((registration) => [
			registration.tool.name,
			registration,
		]),
	);
	const effectiveResultPolicy = options.resultPolicy ?? PRESERVE_CODING_TOOL_RESULT_POLICY;
	const registry = new InMemoryCodingToolRegistry(
		[
			...platformRegistrations.map((registration) => toRuntimeToolRegistration(registration)),
			...codingAgentRegistrations.map((registration) => toRuntimeToolRegistration(registration)),
		],
		{
			resultPolicy: effectiveResultPolicy,
			observationPublisher: options.observationPublisher,
		},
	);
	const feature = createCodingToolsFeature({
		catalog: registry,
		selectRegistrations: async (registrations, context) => {
			const activation = options.resolveActivation
				? await options.resolveActivation(context)
				: (options.activation ??
					(backgroundService
						? { mode: "scope", scope: "cli", capabilities: new Set(["bg-tasks"]) }
						: { mode: "scope", scope: "cli" }));
			const selectedNames = new Set(
				selectCodingAgentToolRegistrations([...declarationsByName.values()], activation).map(
					({ tool }) => tool.name,
				),
			);
			return registrations.filter(({ tool }) => selectedNames.has(tool.name));
		},
		refreshCatalog: options.refreshCatalog,
		filterRegistration: options.filterRegistration
			? (registration, context) => {
					const declaration = declarationsByName.get(registration.tool.name);
					return declaration ? options.filterRegistration!(declaration, context) : false;
				}
			: undefined,
	});
	const capabilities: RuntimeCapabilityDefinition = createDefaultRuntimeCapabilityDefinition({
		features: [feature],
		toolPolicy: {
			async authorize(request, signal) {
				signal.throwIfAborted();
				if (!options.authorizeTool) return true;
				return options.authorizeTool(request.toolName, request.input);
			},
		},
		tokenBudget: options.tokenBudget ?? 8_000,
		reservedOutputTokens: options.reservedOutputTokens ?? 1_000,
		observationPublisher: options.observationPublisher,
	});
	const compiler = new FeatureCompiler({ idGenerator: new RandomIdGenerator() });

	return {
		cwd,
		backgroundService,
		createSpecializedToolRegistrations: options.environment.createSpecializedToolRegistrations,
		registry,
		/** 注册表实际生效的默认策略，供插件/扩展运行时复用同一实例，避免二次构造。 */
		resultPolicy: effectiveResultPolicy,
		registerTool: (registration) => {
			if (declarationsByName.has(registration.tool.name)) {
				throw new Error(`Duplicate Coding Agent tool declaration: ${registration.tool.name}`);
			}
			declarationsByName.set(registration.tool.name, registration);
			try {
				registry.register(toRuntimeToolRegistration(registration));
			} catch (error) {
				declarationsByName.delete(registration.tool.name);
				throw error;
			}
		},
		unregisterTool: (toolName) => {
			const removed = registry.unregister(toolName);
			if (removed) declarationsByName.delete(toolName);
			return removed;
		},
		readToolDeclaration: (toolName) => declarationsByName.get(toolName),
		feature,
		capabilities,
		compiler,
		compile: (signal = new AbortController().signal) => compiler.compile(capabilities, signal),
		dispose: () => options.environment.dispose(),
	};
}

const CODING_AGENT_BASE_TOOL_ORDER: Readonly<Record<string, number>> = {
	current_time: CODING_AGENT_MODEL_TOOL_ORDER.currentTime,
	read: CODING_AGENT_MODEL_TOOL_ORDER.read,
	edit: CODING_AGENT_MODEL_TOOL_ORDER.edit,
	bash: CODING_AGENT_MODEL_TOOL_ORDER.command,
	shell: CODING_AGENT_MODEL_TOOL_ORDER.command,
	task_output: CODING_AGENT_MODEL_TOOL_ORDER.taskOutput,
	task_stop: CODING_AGENT_MODEL_TOOL_ORDER.taskStop,
	ls: CODING_AGENT_MODEL_TOOL_ORDER.ls,
	glob: CODING_AGENT_MODEL_TOOL_ORDER.glob,
	grep: CODING_AGENT_MODEL_TOOL_ORDER.grep,
	find: CODING_AGENT_MODEL_TOOL_ORDER.find,
	tree: CODING_AGENT_MODEL_TOOL_ORDER.directoryTree,
	write: CODING_AGENT_MODEL_TOOL_ORDER.write,
};

const CODING_AGENT_OWNED_BASE_TOOL_NAMES = new Set<string>(["current_time", "task_output", "task_stop"]);

function withCodingAgentModelOrder<T extends CodingAgentRuntimeToolRegistration>(registration: T): T {
	const modelOrder = CODING_AGENT_BASE_TOOL_ORDER[registration.tool.name];
	return modelOrder === undefined ? registration : withModelOrder(registration, modelOrder);
}

function withModelOrder<T extends CodingAgentRuntimeToolRegistration>(registration: T, modelOrder: number): T {
	return {
		...registration,
		modelOrder,
		tool: { ...registration.tool, modelOrder },
	} as T;
}

/** 产品策略字段在进入通用 Runtime Tool Catalog 前必须被剥离。 */
function toRuntimeToolRegistration(registration: CodingAgentRuntimeToolRegistration): CodingToolRegistration {
	const {
		scopeUse: _scopeUse,
		requires: _requires,
		category: _category,
		availabilityPolicy: _availabilityPolicy,
		resultProjection,
		...runtimeRegistration
	} = registration;
	return resultProjection === "preserve"
		? { ...runtimeRegistration, resultPolicy: PRESERVE_CODING_TOOL_RESULT_POLICY }
		: runtimeRegistration;
}
