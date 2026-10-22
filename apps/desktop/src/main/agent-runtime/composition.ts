// Modified by The Open Forge contributors.
import { join } from "node:path";
import {
	CODING_AGENT_COMPACTION_PREFIRE_OBSERVATION,
	CODING_AGENT_LIFECYCLE_ISSUE_OBSERVATION,
	CODING_AGENT_PLUGIN_CONFIGURATION_OBSERVATION,
	CODING_AGENT_SESSION_ASSISTANCE_OBSERVATION,
	CODING_AGENT_SESSION_INITIALIZATION_OBSERVATION,
	CODING_AGENT_SUBAGENT_ISSUE_OBSERVATION,
	type CodingAgentRuntimeSessionOptions,
	createCodingAgentMemoryRolloverRuntime,
	publishCodingAgentExecutionRuntimeDefinition,
} from "@vetta/coding-agent/composition";
import { getAgentDir } from "@vetta/coding-agent/config";
import {
	createCodingAgentMcpRuntimeToolSource,
	createCodingAgentPluginMcpRuntime,
	createCodingAgentSharedModelController,
} from "@vetta/coding-agent/host-services";
import {
	createExplicitMemoryToolRegistrations,
	createMemoryEvidenceContextProvider,
	type ExplicitMemoryServices,
} from "@vetta/coding-agent/memory";
import { AGENT_CONFIGURATION_OBSERVATION } from "@vetta/coding-agent/session-extensions";
import {
	CatalogRoutedRuntimeHostSessionBackend,
	CatalogRoutedRuntimeSessionAccessResolver,
	CompositeRuntimeSessionCatalog,
	CompositeRuntimeSessionFileHistoryReader,
	RUNTIME_AGENT_LIFECYCLE_OBSERVATION,
	RUNTIME_HOST_LIFECYCLE_OBSERVATION,
	RUNTIME_TURN_RETRY_LIFECYCLE_OBSERVATION,
	type RuntimeAgentRuntime,
	RuntimeHost,
	type RuntimeHostSessionBackendRouteDecision,
	RuntimeObservationHub,
	type RuntimeObservationPublisher,
} from "@vetta/runtime-core";
import type { AgentFeatureDefinition } from "@vetta/runtime-core/kernel";
import {
	createDesktopHistoricalSessionFormat,
	createDesktopResultArtifactRuntime,
	createDesktopRuntimeHostPlatformServices,
	createRuntimeSessionCompactionLogger,
	DesktopHistoricalSessionImportBackend,
	DesktopRuntimeBackendPool,
	type DesktopRuntimeComposition,
	DesktopRuntimeSessionCatalog,
	isSessionPathInDirectory,
	logRuntimeSessionError,
	PathFilteredRuntimeSessionCatalog,
	setDesktopSshConnectionResolver,
} from "@vetta/runtime-desktop";
import { scanLocalSources } from "@vetta/runtime-knowledge";
import type { MemoryScope } from "@vetta/runtime-memory";
import { FileConversationRuntimeSessionFileHistoryReader } from "@vetta/runtime-node/conversation";
import { profileDatasetFile } from "@vetta/runtime-node/dataset";
import {
	createLoopbackSessionAffinityStream,
	createNodeKnowledgeRuntime,
	NodeTextFileStorage,
} from "@vetta/runtime-node/host";
import { loadVettaCredentials } from "@vetta/runtime-node/mcp";
import { acquireMemoryStoreLease, LexicalMemoryIndex, SqliteMemoryErasure } from "@vetta/runtime-node/memory";
import { getModePrompt } from "../agent-modes/index.js";
import { createDesktopAgentObservability } from "../agent-observability/composition.js";
import { recordRuntimeCompaction } from "../app-monitor/app-monitor-service.js";
import { getApplicationCacheService } from "../cache/application-cache-service.js";
import {
	DEFAULT_CONVERSATION_CWD,
	DEFAULT_IM_CONVERSATION_SESSION_DIR,
	readDesktopConfig,
} from "../config/desktop-config-store.js";
import { DEFAULT_SERVER_URL } from "../constants.js";
import { resolveDesktopRuntimeSessionRoots } from "../conversations/session-catalog-roots.js";
import { resolveSessionListCwd } from "../conversations/session-paths.js";
import { getKnowledgeRoot } from "../knowledge/knowledge-layout.js";
import { getAppLogger } from "../logger.js";
import { getDesktopMcpAppRegistry } from "../mcp/mcp-app-runtime.js";
import { getDesktopMcpTaskCoordinator } from "../mcp/mcp-task-runtime.js";
import { createDesktopPluginHookAdapterFactory } from "../plugins/coding-agent-hook-adapter.js";
import { pluginAgentContributionService } from "../plugins/plugin-catalog.js";
import { getDesktopCodingAgentPluginRuntimeSource } from "../plugins/plugin-runtime-service.js";
import { resolveMemoryIdentity } from "../projects/memory-identity.js";
import { loadMemoryIdentityRegistry, saveMemoryIdentityRegistry } from "../projects/memory-identity-storage.js";
import { getDesktopRuntimeConfigurationService } from "../runtime-configuration/runtime-configuration-composition.js";
import { getAvailableLinuxBubblewrapPath, getAvailableMacosSandboxExecPath } from "../sandbox/capability.js";
import { resolveWindowsSandboxHostBinary } from "../sandbox/windows-binary-resolver.js";
import { getSshConnection } from "../ssh/ssh-runtime.js";
import { createCodingAgentObservationLogPort } from "./coding-agent-observation-log-port.js";
import {
	createDesktopCodingAgentFunctionSource,
	setDesktopCodingAgentFunctionSource,
} from "./function-extension-source.js";
import { getOrCreateSharedModelRuntime, readDesktopMcpDebug } from "./host-services.js";
import { DesktopMcpResourceManager } from "./mcp-resource-manager.js";
import type { DesktopMcpResourceScope } from "./mcp-resource-scope.js";
import { createDesktopMcpSupervisor } from "./mcp-supervisor.js";
import { getDesktopProviderObservationRuntime } from "./provider-observation.js";
import { createDesktopPromptRuntimeSources } from "./resource-runtime.js";
import { createRuntimeLifecycleLogPort } from "./runtime-lifecycle-log-port.js";
import { createRuntimeRetryLogPort } from "./runtime-retry-log-port.js";
import { createSessionInitializationLogPort } from "./session-initialization-log-port.js";

const log = getAppLogger("runtime");

export function createDesktopRuntimeComposition(): DesktopRuntimeComposition {
	// 远程项目的工具环境要按 hostId 取 SSH 连接，而主机配置属于应用层，
	// runtime-desktop 不能反向依赖它，所以在这里把实现注册进去。
	setDesktopSshConnectionResolver(getSshConnection);
	const observability = createDesktopAgentObservability(getAgentDir(), log);
	const observationHub = new RuntimeObservationHub({
		onIssue: (issue) => log.warn("[runtime-observation] application hub issue", issue),
	});
	observationHub.attach(observability.port, { id: "desktop.agent-observability" });
	observationHub.attach(createSessionInitializationLogPort(log), {
		id: "desktop.session-initialization-log",
		domains: [CODING_AGENT_SESSION_INITIALIZATION_OBSERVATION.domain],
	});
	observationHub.attach(createRuntimeLifecycleLogPort(log), {
		id: "desktop.runtime-lifecycle-log",
		domains: [
			RUNTIME_AGENT_LIFECYCLE_OBSERVATION.domain,
			RUNTIME_HOST_LIFECYCLE_OBSERVATION.domain,
			AGENT_CONFIGURATION_OBSERVATION.domain,
		],
	});
	observationHub.attach(createRuntimeRetryLogPort(log), {
		id: "desktop.runtime-retry-log",
		domains: [RUNTIME_TURN_RETRY_LIFECYCLE_OBSERVATION.domain],
	});
	observationHub.attach(createCodingAgentObservationLogPort(log), {
		id: "desktop.coding-agent-observation-log",
		domains: [
			CODING_AGENT_COMPACTION_PREFIRE_OBSERVATION.domain,
			CODING_AGENT_LIFECYCLE_ISSUE_OBSERVATION.domain,
			CODING_AGENT_PLUGIN_CONFIGURATION_OBSERVATION.domain,
			CODING_AGENT_SESSION_ASSISTANCE_OBSERVATION.domain,
			CODING_AGENT_SUBAGENT_ISSUE_OBSERVATION.domain,
		],
	});
	const platformServices = createDesktopRuntimeHostPlatformServices();
	const modelRuntime = getOrCreateSharedModelRuntime();
	const mcpTaskCoordinator = getDesktopMcpTaskCoordinator();
	const mcpAppHost = getDesktopMcpAppRegistry();
	const providerObservationRuntime = getDesktopProviderObservationRuntime();
	const runtimeConfiguration = getDesktopRuntimeConfigurationService();
	const modelStream = createLoopbackSessionAffinityStream(providerObservationRuntime?.streamFn);
	const getDefaultExecutionMode = async () => (await readDesktopConfig()).defaultExecutionMode;
	const sandboxHostPath = resolveWindowsSandboxHostBinary()?.path;
	const linuxBubblewrapPath = getAvailableLinuxBubblewrapPath();
	const macosSandboxExecPath = getAvailableMacosSandboxExecPath();
	const sessionExtensionFunctions = createDesktopCodingAgentFunctionSource({
		invokeArtifact: async (request, signal) => {
			const { getDesktopCanvasArtifactService } = await import("../artifacts/canvas-artifact-desktop.js");
			return getDesktopCanvasArtifactService().invokeTool(request, signal);
		},
	});
	setDesktopCodingAgentFunctionSource(sessionExtensionFunctions);
	const historicalFormat = createDesktopHistoricalSessionFormat();
	const defaultResultArtifacts = createDesktopResultArtifactRuntime(getAgentDir());
	const conversationCatalog = new DesktopRuntimeSessionCatalog({
		resolveRoots: resolveDesktopRuntimeSessionRoots,
		artifactCleaner: defaultResultArtifacts.sessionArtifactCleaner,
	});
	const imConversationCatalog = new PathFilteredRuntimeSessionCatalog(conversationCatalog, (sessionPath) =>
		isSessionPathInDirectory(sessionPath, DEFAULT_IM_CONVERSATION_SESSION_DIR),
	);
	const desktopRuntimeCatalog = new PathFilteredRuntimeSessionCatalog(
		conversationCatalog,
		(sessionPath) => !isSessionPathInDirectory(sessionPath, DEFAULT_IM_CONVERSATION_SESSION_DIR),
	);
	const createRuntimeBackendPool = (
		agentRuntime: RuntimeAgentRuntime,
		observationPublisher: RuntimeObservationPublisher,
	) => {
		const createManagedMcpSource = async (resourceScope: DesktopMcpResourceScope, cwd: string, agentDir: string) => {
			const resultArtifacts = createDesktopResultArtifactRuntime(agentDir);
			return await createCodingAgentMcpRuntimeToolSource({
				supervisor: createDesktopMcpSupervisor({
					projectRoot: cwd,
					agentDir,
					debug: readDesktopMcpDebug(cwd, agentDir),
					resourceScope,
					catalogCacheDirectory: getApplicationCacheService().namespace("mcp-tool-catalog").rootDir,
				}),
				resultPolicy: resultArtifacts.mcpToolResultPolicy,
				taskCoordinator: mcpTaskCoordinator,
				appHost: mcpAppHost,
			});
		};
		// 应用级连接只依赖 agentDir 与登录态，跨工作区复用；工作区连接仍按 cwd 隔离。
		const mcpResources = new DesktopMcpResourceManager({
			createApplicationSource: (agentDir) =>
				createManagedMcpSource("application", DEFAULT_CONVERSATION_CWD, agentDir),
			createWorkspaceSource: ({ cwd, agentDir }) => createManagedMcpSource("workspace", cwd, agentDir),
			resolveApplicationRevision: (agentDir) => {
				const credentials = loadVettaCredentials(agentDir);
				return credentials ? `authenticated:${credentials.baseUrl}` : "anonymous";
			},
		});
		const runtimeBackendPool = new DesktopRuntimeBackendPool({
			observationPublisher,
			compositionDefaults: {
				tracer: observability.tracer,
				tracing: { captureContent: false, detail: "standard" },
				agentRuntime: { runtime: agentRuntime },
				modelRegistry: modelRuntime,
				resolveCompactionSettings: () => runtimeConfiguration.readCompactionSettings(),
				createPromptRuntimeSources: createDesktopPromptRuntimeSources,
				createPluginRuntime: () => getDesktopCodingAgentPluginRuntimeSource(),
				// 工作模式注册表归 desktop 所有（ADR-0071 修订）：coding-agent 只保留 core.mode
				// 槽位，正文由这里按会话固化的 agentMode 解析注入。
				resolveModePrompt: getModePrompt,
				sessionExtensionFunctions,
				knowledgeRuntime:
					process.env.VETTA_KNOWLEDGE_DISABLED === "1"
						? undefined
						: createNodeKnowledgeRuntime(getKnowledgeRoot()),
				// 本地研究来源枚举只认显式传入的目录，不回落默认 knowledge home。
				researchScope: { scanSources: scanLocalSources },
				// 数据集剖析只读用户显式选择的文件；不修改源文件、不联网。
				datasetProfile: { profileDataset: profileDatasetFile },
				createMemoryRolloverRuntime: (options) => {
					const memoryFile = options.memoryFile ?? join(options.cwd, "MEMORY.md");
					return createCodingAgentMemoryRolloverRuntime({
						cwd: options.cwd,
						memoryFile,
						memoryCharLimit: options.memoryCharLimit,
						memoryStorage: new NodeTextFileStorage(memoryFile),
						journalStorage: new NodeTextFileStorage(join(options.cwd, "JOURNAL.md")),
					});
				},
				// 新结构化记忆（TASK-0375）：memoryPolicy 活跃时装配；策略关闭时返回
				// undefined，旧 memoryMode 路径不受影响（ADR-0149）。
				createExplicitMemoryRuntime: (sessionOptions) => createDesktopExplicitMemoryRuntime(sessionOptions),
				observationHub: {
					onIssue: (issue) => log.warn("[runtime-observation] coding agent hub issue", issue),
				},
				streamFn: modelStream,
				createPluginMcpRuntime: ({ cwd, agentDir }) => {
					const resolvedAgentDir = agentDir ?? getAgentDir();
					const resultArtifacts = createDesktopResultArtifactRuntime(resolvedAgentDir);
					return createCodingAgentPluginMcpRuntime({
						supervisor: createDesktopMcpSupervisor({
							projectRoot: cwd,
							agentDir: resolvedAgentDir,
							debug: readDesktopMcpDebug(cwd, resolvedAgentDir),
							dynamicOnly: true,
							catalogCacheDirectory: getApplicationCacheService().namespace("mcp-tool-catalog").rootDir,
						}),
						debug: readDesktopMcpDebug(cwd, resolvedAgentDir),
						resultPolicy: resultArtifacts.mcpToolResultPolicy,
						taskCoordinator: mcpTaskCoordinator,
						appHost: mcpAppHost,
					});
				},
			},
			createSessionHookAdapterFactories: ({ scenario }, { isPluginEnabled }) => [
				createDesktopPluginHookAdapterFactory({
					scenario,
					canInvoke: (pluginId) =>
						isPluginEnabled(pluginId) && pluginAgentContributionService.canInvokeHook(pluginId),
				}),
			],
			createCodingToolResultPolicy: ({ agentDir }) =>
				createDesktopResultArtifactRuntime(agentDir ?? getAgentDir()).codingToolResultPolicy,
			createMcpRuntimeSource: ({ cwd, agentDir }) =>
				mcpResources.acquire({ cwd, agentDir: agentDir ?? getAgentDir() }),
			resolveMcpRuntimeScope: ({ cwd, agentDir }) => ({
				cwd: resolveSessionListCwd(cwd),
				agentDir,
			}),
		});
		return { mcpResources, runtimeBackendPool };
	};
	const compactionLogger = createRuntimeSessionCompactionLogger(log);
	const runtime = new RuntimeHost({
		...platformServices,
		getDefaultExecutionMode,
		linuxBubblewrapPath,
		macosSandboxExecPath,
		sandboxHostPath,
		serverUrl: DEFAULT_SERVER_URL,
		observationPort: {
			record: (record) => observationHub.record(record),
			flush: () => observationHub.flush(),
			close: async () => {
				await observationHub.close();
				await observability.close();
			},
		},
		createSessionBackend: ({ agents, observationPublisher }) => {
			publishCodingAgentExecutionRuntimeDefinition(agents);
			const { mcpResources, runtimeBackendPool } = createRuntimeBackendPool(agents, observationPublisher);
			void mcpResources.prewarmApplication(getAgentDir()).catch((error: unknown) => {
				log.warn("[agent-runtime] application MCP prewarm failed", error);
			});
			const historicalSessionImportBackend = new DesktopHistoricalSessionImportBackend(runtimeBackendPool);
			return new CatalogRoutedRuntimeHostSessionBackend({
				defaultBackend: runtimeBackendPool,
				defaultRouteId: "runtime",
				routes: [
					{
						id: "historical-session-import",
						catalog: historicalFormat.sessionCatalog,
						backend: historicalSessionImportBackend,
					},
					{ id: "runtime", catalog: desktopRuntimeCatalog, backend: runtimeBackendPool },
				],
				onRoute: logSessionRoute,
				dispose: async () => {
					try {
						await runtimeBackendPool.dispose();
					} finally {
						await mcpResources.dispose();
					}
				},
			});
		},
		sessionCatalog: new CompositeRuntimeSessionCatalog(
			[historicalFormat.sessionCatalog, conversationCatalog],
			platformServices.pathServices.normalize,
		),
		sessionFileHistoryReader: new CompositeRuntimeSessionFileHistoryReader([
			historicalFormat.sessionFileHistoryReader,
			new FileConversationRuntimeSessionFileHistoryReader(),
		]),
		sessionAccessResolver: new CatalogRoutedRuntimeSessionAccessResolver([
			{
				catalog: historicalFormat.sessionCatalog,
				access: {
					readHistory: true,
					resume: true,
					rename: true,
					delete: true,
				},
			},
			{
				catalog: imConversationCatalog,
				access: {
					readHistory: true,
					resume: false,
					rename: true,
					delete: true,
				},
			},
			{
				catalog: desktopRuntimeCatalog,
				access: {
					readHistory: true,
					resume: true,
					rename: true,
					delete: true,
				},
			},
		]),
		sharedModelController: createCodingAgentSharedModelController(modelRuntime),
		sessionErrorObserver: (event) => logRuntimeSessionError(event, log),
		// 先计数后日志：relay 对整个回调只兜一次底，监控计数放前面，日志实现
		// 抛错也不会让计数丢失（该回调本身已是旁路，抛错由 RuntimeHost 隔离）。
		sessionCompactionObserver: (event) => {
			recordRuntimeCompaction(event);
			compactionLogger(event);
		},
	});
	return { runtime };
}

function logSessionRoute(decision: RuntimeHostSessionBackendRouteDecision): void {
	if (decision.source === "default") {
		log.info(`[agent-runtime] session-route route=${decision.routeId ?? "unknown"} reason=new-session-default`);
		return;
	}
	const reason =
		decision.routeId === "historical-session-import"
			? "historical-session-import"
			: decision.routeId === "runtime"
				? "conversation-v2-catalog"
				: "unknown-catalog";
	log.info(`[agent-runtime] session-route route=${decision.routeId ?? "unknown"} reason=${reason}`);
}

/**
 * 新结构化记忆 Runtime 装配（TASK-0375）：memoryPolicy 活跃时创建
 * 「显式工具组 + 证据上下文」Feature。资源生命周期都在 prepare/dispose：
 * - store lease 按会话持有（owner = session id），dispose 时释放；
 * - 词法索引与遗忘屏障共享同一数据库路径（WAL）；
 * - 初始化失败在 prepare 中抛错（会话创建如实失败），不静默降级。
 * - 身份注册表同步读写（原子写）；目录无 Git 时按普通目录解析。
 */
function createDesktopExplicitMemoryRuntime(
	sessionOptions: CodingAgentRuntimeSessionOptions,
): AgentFeatureDefinition | undefined {
	const policy = sessionOptions.memoryPolicy;
	if (policy === undefined || policy.mode === "off") {
		return undefined;
	}
	const agentDir = getAgentDir();
	const memoryDir = join(agentDir, "memory", "profile-default");
	const registryPath = join(memoryDir, "identity-registry.json");
	const principal = { principalId: "desktop-profile-default" };
	const registry = loadMemoryIdentityRegistry({ filePath: registryPath, principal });
	const resolved = resolveMemoryIdentity({
		registry,
		cwd: sessionOptions.cwd ?? process.cwd(),
		ensureWorkspaceView: false,
	});
	saveMemoryIdentityRegistry({ filePath: registryPath, registry: resolved.registry });
	const databasePath = join(memoryDir, "memory.sqlite");
	const allowedScopes: MemoryScope[] = resolved.allowedScopes.map((entry) => ({
		name: entry.name,
		identity:
			entry.projectId === undefined
				? { principalId: entry.principalId }
				: { principalId: entry.principalId, projectId: entry.projectId },
	}));
	const projectScope = allowedScopes.find((scope) => scope.name === "project") ?? allowedScopes[0];
	const sessionOwner = `session:${sessionOptions.sessionId}`;

	return {
		id: "coding-agent.persistent-memory",
		async prepare(context) {
			context.signal.throwIfAborted();
			const lease = await acquireMemoryStoreLease({
				databasePath,
				allowedScopes,
				owner: sessionOwner,
			});
			let index: LexicalMemoryIndex | undefined;
			let erasure: SqliteMemoryErasure | undefined;
			try {
				index = await LexicalMemoryIndex.open({ databasePath });
				erasure = await SqliteMemoryErasure.open({ databasePath });
				const services: ExplicitMemoryServices = {
					write: (scope, command) => lease.store.write(scope, command),
					read: (scope, selector) => lease.store.read(scope, selector),
					listRevisions: (memoryId, scope) => lease.store.listRevisions(memoryId, scope),
					listSources: (memoryId, scope) => lease.store.listSources(memoryId, scope),
					search: (scope, query, selector, limit) =>
						Promise.resolve(index?.search(scope, query, selector, limit) ?? { entries: [], degraded: false }),
					forget: async (memoryId) => {
						const outcome = erasure?.forgetMemoryFamily({ memoryId });
						return { erasureEpoch: outcome?.erasureEpoch ?? 0 };
					},
				};
				const registrations = createExplicitMemoryToolRegistrations({
					services,
					scopeContext: {
						allowed: allowedScopes.map((scope) => ({
							name: scope.name === "user" ? ("user" as const) : ("project" as const),
							scope,
						})),
					},
				});
				const provider = createMemoryEvidenceContextProvider({
					scope: projectScope,
					reader: {
						readEvidence: async (scope) => {
							const entries = await lease.store.read(scope, { asOf: new Date().toISOString() });
							return [...entries]
								.sort((left, right) => (right.pinned === true ? 1 : 0) - (left.pinned === true ? 1 : 0))
								.sort((left, right) => (right.recordedAt > left.recordedAt ? 1 : -1));
						},
					},
				});
				const tools = registrations.map((registration) => registration.tool);
				return {
					async contribute(contributionContext) {
						contributionContext.signal.throwIfAborted();
						return { tools, contextProviders: [provider] };
					},
					async dispose() {
						index?.close();
						erasure?.close();
						await lease.release();
					},
				};
			} catch (error) {
				index?.close();
				erasure?.close();
				await lease.release();
				throw error;
			}
		},
	};
}
