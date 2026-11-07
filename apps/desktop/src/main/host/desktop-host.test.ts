// Copyright The Open Forge contributors.
import { HOST_PROTOCOL_ERROR_CODES } from "@vetta/host-protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";

let document: Record<string, unknown>;
vi.mock("../agent-settings/settings-document-store.js", () => ({
	readAgentSettingsDocument: () => document,
	updateAgentSettingsDocument: (mutate: (settings: Record<string, unknown>) => void) => mutate(document),
}));
vi.mock("@vetta/coding-agent/profile", () => ({
	DEFAULT_PERSONA_ID: "default",
	PERSONAS: [
		{ id: "default", label: "A", description: "a" },
		{ id: "concise", label: "B", description: "b" },
	],
}));

const sharedRuntime = {
	getQueueState: vi.fn(() => ({
		paused: true,
		entries: [{ id: "q1", behavior: "steer", kind: "message", displayText: "hi" }],
	})),
	queueSessionContextCompaction: vi.fn(async () => ({ status: "queued" as const, id: "c1", pendingCount: 2 })),
	removeQueuedMessage: vi.fn(async () => true),
	reorderQueuedMessages: vi.fn(),
	sendQueuedMessageNow: vi.fn(async () => "promoted" as const),
	resumeQueue: vi.fn(async () => undefined),
	clearQueue: vi.fn(),
	navigateForEdit: vi.fn(async () => ({ text: "draft", cancelled: false })),
	switchBranch: vi.fn(async () => ({ leafId: "e2" })),
	deleteMessage: vi.fn(async () => ({ leafId: null })),
	replaceLastUserMessage: vi.fn(async () => ({ leafId: "e9" })),
	forkSession: vi.fn(async () => ({ path: "C:\\sessions\\fork.jsonl", text: "forked" })),
	invokeSessionExtension: vi.fn(async () => true),
	invokeSessionExtensionSync: vi.fn(() => ({ permissionMode: "default" as const })),
	renameSession: vi.fn(async () => undefined),
	renameSessionById: vi.fn(async () => undefined),
	updateSettings: vi.fn(async () => undefined),
	setExecutionMode: vi.fn(async () => undefined),
	updateGlobalThinkingLevel: vi.fn(),
	getSessionPath: vi.fn((): string | undefined => "/sessions/s1.jsonl"),
	retry: vi.fn(async () => undefined),
};
vi.mock("../runtime.js", () => ({ getSharedRuntime: () => sharedRuntime }));
const interruptDraftRegistry = vi.hoisted(() => ({
	setSessionInterruptDraftNonEmpty: vi.fn(),
}));
vi.mock("../agent-runtime/session-interrupt-draft-registry.js", () => interruptDraftRegistry);
vi.mock("../agent-runtime/session-interrupt-watch-registry.js", () => ({
	clearSessionManualStop: vi.fn(),
	markSessionManualStop: vi.fn(),
	watchSessionForInterruptContinue: vi.fn(),
}));
vi.mock("../conversations/conversation-ownership-guard.js", () => ({
	assertOrdinaryConversationPath: vi.fn(async (sessionPath: string) => sessionPath),
}));
vi.mock("../conversations/session-paths.js", () => ({
	isConversationSubCwd: () => false,
	readSessionCwdFromHeader: vi.fn(async () => undefined),
}));
vi.mock("@vetta/runtime-desktop", () => ({
	assertProjectSupportsExecutionMode: vi.fn(),
}));
vi.mock("../sandbox/capability.js", () => ({
	assertSandboxAvailableForMode: vi.fn(async () => undefined),
}));
const desktopConfig = { defaultExecutionMode: "sandbox" as const, defaultAgentMode: "coding" };
vi.mock("../config/desktop-config-store.js", () => ({
	readDesktopConfig: vi.fn(async () => desktopConfig),
	updateDesktopConfig: vi.fn(async (update: (config: unknown) => unknown) => update(desktopConfig)),
}));
vi.mock("../agent-modes/index.js", () => ({
	DEFAULT_AGENT_MODE: "coding",
	isAgentMode: (mode: string) => mode === "coding" || mode === "chat",
	MODE_PROMPTS: [{ id: "coding", label: "Coding", description: "code it", icon: "lucide:code" }],
}));

const goalController = {
	read: vi.fn(async () => null),
	start: vi.fn(async (_sessionId: string, objective: string) => goalStateOf(objective)),
	pause: vi.fn(async () => goalStateOf("pause it", "paused")),
	resume: vi.fn(async () => goalStateOf("resume it", "active")),
	clear: vi.fn(async () => null),
};
const goalStateOf = (objective: string, status = "active") => ({
	goalId: "g1",
	objective,
	status,
	tokensUsed: 12,
	timeUsedSeconds: 34,
	continuationCount: 1,
	createdAt: "2026-11-07T00:00:00.000Z",
	updatedAt: "2026-11-07T00:00:01.000Z",
});
vi.mock("../conversations/desktop-goal-controller.js", () => ({
	DesktopGoalController: class {
		read = goalController.read;
		start = goalController.start;
		pause = goalController.pause;
		resume = goalController.resume;
		clear = goalController.clear;
	},
}));

const { createDesktopHost } = await import("./desktop-host.js");

vi.mock("../models/presets/sync.js", () => ({
	listPresetProviders: vi.fn(async () => ({
		providers: [
			{
				id: "deepseek",
				displayName: "DeepSeek",
				api: "openai",
				baseUrl: "https://api.deepseek.test",
				icon: "deepseek",
				catalogModels: [
					{
						id: "deepseek-chat",
						contextWindow: 65536,
						cost: { input: 0.14, output: 0.28, cacheRead: 0.014, cacheWrite: 0.14 },
					},
				],
			},
		],
		catalogSource: "snapshot",
	})),
	refreshPresetCatalog: vi.fn(async () => ({ ok: true, elapsedMs: 42, modelCount: 7 })),
}));

const rendererConfig: Record<string, unknown> = { providers: {} };
const replaceConfig = vi.fn(async () => undefined);
const getProviderApiKey = vi.fn(async (_providerId: string): Promise<string | undefined> => undefined);
vi.mock("../models/model-settings-host.js", () => ({
	getDesktopModelSettingsService: () => ({
		getRendererConfig: async () => rendererConfig,
		replaceConfig,
		getProviderApiKey,
		getConfig: async () => ({ providers: { deepseek: {} } }),
	}),
}));
vi.mock("@vetta/runtime-node/host", () => ({
	resolveNodeConfigurationValue: (value: string) => `resolved:${value}`,
}));

vi.mock("../models/probe.js", () => ({
	probeModelProvider: vi.fn(async () => ({ ok: true, message: "probe ok" })),
}));
vi.mock("../models/fetch-models.js", () => ({
	fetchProviderModels: vi.fn(async () => ({
		models: [{ id: "m1", name: "M1", contextWindow: 8192, vision: true }],
	})),
}));
vi.mock("../models/test-provider.js", () => ({
	testProviderAvailability: vi.fn(async () => ({
		ok: true,
		latencyMs: 120,
		status: 200,
		modelCount: 3,
	})),
}));
vi.mock("../models/balance/index.js", () => ({
	getProviderBalance: vi.fn(async () => ({
		provider: "deepseek",
		supported: true,
		currency: "CNY",
		available: 12.5,
		isAvailable: true,
	})),
}));
vi.mock("../models/model-settings-service.js", () => ({
	MODELS_CONFIG_PATH: "C:\\vetta-home\\agent\\models.json",
}));

const hasAuth = vi.fn((name: string) => name === "github");
vi.mock("../mcp/mcp-oauth-service.js", () => ({
	getDesktopMcpOAuthService: () => ({ hasAuth }),
}));
vi.mock("../mcp/mcp-tool-catalog.js", () => ({
	listMcpServerTools: vi.fn(async () => ({
		tools: [{ name: "search", description: "Search the web", enabled: true, stale: false }],
		cached: true,
	})),
}));
vi.mock("../mcp/mcp-settings-service.js", () => ({
	MCP_CONFIG_PATH: "C:\\vetta-home\\agent\\mcp.json",
}));

describe("desktop host models preset domain", () => {
	it("returns preset providers with catalog metadata over the host contract", async () => {
		await expect(createDesktopHost().handle({ method: "models.listPresets", params: {} })).resolves.toEqual({
			ok: true,
			result: {
				providers: [
					{
						id: "deepseek",
						displayName: "DeepSeek",
						api: "openai",
						baseUrl: "https://api.deepseek.test",
						icon: "deepseek",
						catalogModels: [
							{
								id: "deepseek-chat",
								contextWindow: 65536,
								cost: { input: 0.14, output: 0.28, cacheRead: 0.014, cacheWrite: 0.14 },
							},
						],
					},
				],
				catalogSource: "snapshot",
			},
		});
	});

	it("returns the manual catalog refresh outcome", async () => {
		await expect(createDesktopHost().handle({ method: "models.refreshPresetCatalog", params: {} })).resolves.toEqual({
			ok: true,
			result: { ok: true, elapsedMs: 42, modelCount: 7 },
		});
	});

	it("rejects unexpected params for the preset methods", async () => {
		const response = await createDesktopHost().handle({
			method: "models.listPresets",
			params: { stale: true },
		});
		expect(response).toMatchObject({ ok: false, error: { code: HOST_PROTOCOL_ERROR_CODES.INVALID_PARAMS } });
	});

	it("flags results that drift from the catalog contract", async () => {
		const { listPresetProviders } = await import("../models/presets/sync.js");
		vi.mocked(listPresetProviders).mockResolvedValueOnce({
			providers: [{ id: 1 as unknown as string }],
		} as Awaited<ReturnType<typeof listPresetProviders>>);
		const response = await createDesktopHost().handle({ method: "models.listPresets", params: {} });
		expect(response).toMatchObject({ ok: false, error: { code: HOST_PROTOCOL_ERROR_CODES.INVALID_RESULT } });
	});
});

describe("desktop host models config domain", () => {
	beforeEach(() => {
		rendererConfig.providers = {};
		replaceConfig.mockClear();
		getProviderApiKey.mockReset();
	});

	it("returns the renderer config with masked or referenced api keys", async () => {
		rendererConfig.providers = {
			deepseek: { apiKey: "***", credentialRef: "vault:abc" },
			openrouter: { apiKey: "env:OPENROUTER_KEY" },
		};
		await expect(createDesktopHost().handle({ method: "models.getConfig", params: {} })).resolves.toEqual({
			ok: true,
			result: {
				providers: {
					deepseek: { apiKey: "***", credentialRef: "vault:abc" },
					openrouter: { apiKey: "env:OPENROUTER_KEY" },
				},
			},
		});
	});

	it("rejects plaintext api keys that escape the mask contract", async () => {
		rendererConfig.providers = { deepseek: { apiKey: "sk-plaintext-secret" } };
		const response = await createDesktopHost().handle({ method: "models.getConfig", params: {} });
		expect(response).toMatchObject({ ok: false, error: { code: HOST_PROTOCOL_ERROR_CODES.INVALID_RESULT } });
	});

	it("passes the submitted config to replaceConfig", async () => {
		const config = { defaultModel: "deepseek/chat", providers: { deepseek: { apiKey: "sk-new" } } };
		await expect(createDesktopHost().handle({ method: "models.setConfig", params: { config } })).resolves.toEqual({
			ok: true,
			result: null,
		});
		expect(replaceConfig).toHaveBeenCalledWith(config);
	});

	it("reports whether a provider key was copied", async () => {
		await expect(
			createDesktopHost().handle({ method: "models.copyApiKey", params: { providerId: "deepseek" } }),
		).resolves.toEqual({ ok: true, result: false });
		getProviderApiKey.mockResolvedValue("vault:abc");
		await expect(
			createDesktopHost().handle({ method: "models.copyApiKey", params: { providerId: "deepseek" } }),
		).resolves.toEqual({ ok: true, result: true });
	});

	it("rejects an empty provider id", async () => {
		const response = await createDesktopHost().handle({ method: "models.copyApiKey", params: { providerId: "" } });
		expect(response).toMatchObject({ ok: false, error: { code: HOST_PROTOCOL_ERROR_CODES.INVALID_PARAMS } });
	});
});

describe("desktop host models probe domain", () => {
	it("passes provider/model through to the probe and returns its verdict", async () => {
		const { probeModelProvider } = await import("../models/probe.js");
		await expect(
			createDesktopHost().handle({ method: "models.probe", params: { provider: "deepseek", model: "chat" } }),
		).resolves.toEqual({ ok: true, result: { ok: true, message: "probe ok" } });
		expect(probeModelProvider).toHaveBeenCalledWith({ provider: "deepseek", model: "chat" });
	});

	it("returns fetched provider models and the balance verdict", async () => {
		await expect(
			createDesktopHost().handle({ method: "models.fetchProviderModels", params: { providerName: "deepseek" } }),
		).resolves.toEqual({
			ok: true,
			result: { models: [{ id: "m1", name: "M1", contextWindow: 8192, vision: true }] },
		});
		await expect(
			createDesktopHost().handle({ method: "models.getBalance", params: { providerName: "deepseek" } }),
		).resolves.toEqual({
			ok: true,
			result: { provider: "deepseek", supported: true, currency: "CNY", available: 12.5, isAvailable: true },
		});
	});

	it("returns the provider availability test result and the config path", async () => {
		await expect(
			createDesktopHost().handle({ method: "models.testProvider", params: { providerName: "deepseek" } }),
		).resolves.toEqual({
			ok: true,
			result: { ok: true, latencyMs: 120, status: 200, modelCount: 3 },
		});
		await expect(createDesktopHost().handle({ method: "models.configPath", params: {} })).resolves.toEqual({
			ok: true,
			result: "C:\\vetta-home\\agent\\models.json",
		});
	});

	it("rejects unknown probe params and empty provider names", async () => {
		const probe = await createDesktopHost().handle({
			method: "models.probe",
			params: { provider: "deepseek" },
		});
		expect(probe).toMatchObject({ ok: false, error: { code: HOST_PROTOCOL_ERROR_CODES.INVALID_PARAMS } });
		const empty = await createDesktopHost().handle({
			method: "models.testProvider",
			params: { providerName: " " },
		});
		expect(empty).toMatchObject({ ok: false, error: { code: HOST_PROTOCOL_ERROR_CODES.INVALID_PARAMS } });
	});
});

describe("desktop host mcp domain", () => {
	beforeEach(() => {
		hasAuth.mockClear();
	});

	it("reports oauth state per server and in bulk", async () => {
		await expect(
			createDesktopHost().handle({ method: "mcp.hasAuth", params: { serverName: "github" } }),
		).resolves.toEqual({ ok: true, result: true });
		await expect(
			createDesktopHost().handle({ method: "mcp.hasAuth", params: { serverName: "other" } }),
		).resolves.toEqual({ ok: true, result: false });
		await expect(
			createDesktopHost().handle({ method: "mcp.authStatus", params: { serverNames: ["github", "other"] } }),
		).resolves.toEqual({ ok: true, result: { github: true, other: false } });
	});

	it("returns the tool list and the config path", async () => {
		await expect(
			createDesktopHost().handle({ method: "mcp.listServerTools", params: { serverName: "github" } }),
		).resolves.toEqual({
			ok: true,
			result: {
				tools: [{ name: "search", description: "Search the web", enabled: true, stale: false }],
				cached: true,
			},
		});
		await expect(createDesktopHost().handle({ method: "mcp.configPath", params: {} })).resolves.toEqual({
			ok: true,
			result: "C:\\vetta-home\\agent\\mcp.json",
		});
	});

	it("rejects non-array auth status params", async () => {
		const response = await createDesktopHost().handle({
			method: "mcp.authStatus",
			params: { serverNames: "github" },
		});
		expect(response).toMatchObject({ ok: false, error: { code: HOST_PROTOCOL_ERROR_CODES.INVALID_PARAMS } });
	});
});

describe("desktop host registration and session defaults domain", () => {
	beforeEach(() => {
		document = {};
	});

	it("registers the models, mcp and session host methods", () => {
		expect(createDesktopHost().methods()).toEqual([
			"mcp.authStatus",
			"mcp.configPath",
			"mcp.hasAuth",
			"mcp.listServerTools",
			"models.configPath",
			"models.copyApiKey",
			"models.fetchProviderModels",
			"models.getBalance",
			"models.getConfig",
			"models.listPresets",
			"models.probe",
			"models.refreshPresetCatalog",
			"models.setConfig",
			"models.testProvider",
			"session.autoTitle",
			"session.clearFinishedBackgroundTasks",
			"session.clearGoal",
			"session.clearQueue",
			"session.clearTodos",
			"session.deleteMessage",
			"session.forkSession",
			"session.getAgentModes",
			"session.getGoalState",
			"session.getPersonalization",
			"session.getPersonas",
			"session.getPlanModeState",
			"session.getQueueState",
			"session.getSessionPath",
			"session.getThinkingLevel",
			"session.interruptSubagent",
			"session.killBackgroundTask",
			"session.navigateForEdit",
			"session.nextPromptSuggestions",
			"session.pauseGoal",
			"session.queueContextCompaction",
			"session.removeQueuedMessage",
			"session.rename",
			"session.reorderQueuedMessages",
			"session.replaceLastUserMessage",
			"session.resumeGoal",
			"session.resumeQueue",
			"session.retry",
			"session.sendQueuedMessageNow",
			"session.setExecutionMode",
			"session.setGlobalAgentMode",
			"session.setGlobalExecutionMode",
			"session.setGlobalThinkingLevel",
			"session.setInterruptDraftNonEmpty",
			"session.setPersonalization",
			"session.setPlanModePermissionMode",
			"session.startGoal",
			"session.switchBranch",
			"session.updateSettings",
		]);
	});

	it("returns thinking level and persona defaults", async () => {
		const host = createDesktopHost();
		await expect(host.handle({ method: "session.getThinkingLevel", params: {} })).resolves.toEqual({
			ok: true,
			result: "off",
		});
		document.defaultThinkingLevel = "high";
		await expect(host.handle({ method: "session.getThinkingLevel", params: {} })).resolves.toEqual({
			ok: true,
			result: "high",
		});
		await expect(host.handle({ method: "session.getPersonas", params: {} })).resolves.toEqual({
			ok: true,
			result: [
				{ id: "default", label: "A", description: "a" },
				{ id: "concise", label: "B", description: "b" },
			],
		});
	});

	it("reads and persists personalization, rejecting unknown personas", async () => {
		const host = createDesktopHost();
		await expect(host.handle({ method: "session.getPersonalization", params: {} })).resolves.toEqual({
			ok: true,
			result: { personaId: "default", customPrompt: "" },
		});
		await expect(
			host.handle({ method: "session.setPersonalization", params: { personaId: "concise", customPrompt: "x" } }),
		).resolves.toEqual({ ok: true, result: null });
		expect(document.personalization).toEqual({ personaId: "concise", customPrompt: "x" });
		const response = await host.handle({
			method: "session.setPersonalization",
			params: { personaId: "ghost", customPrompt: "x" },
		});
		expect(response).toMatchObject({ ok: false, error: { code: HOST_PROTOCOL_ERROR_CODES.INVALID_PARAMS } });
	});
});

describe("desktop host session queue domain", () => {
	beforeEach(() => {
		for (const fn of Object.values(sharedRuntime)) fn.mockClear();
	});

	it("returns the queue state snapshot through the shared runtime", async () => {
		await expect(
			createDesktopHost().handle({ method: "session.getQueueState", params: { sessionId: "s1" } }),
		).resolves.toEqual({
			ok: true,
			result: { paused: true, entries: [{ id: "q1", behavior: "steer", kind: "message", displayText: "hi" }] },
		});
		expect(sharedRuntime.getQueueState).toHaveBeenCalledWith("s1");
	});

	it("bridges queue operations and rejects empty identifiers", async () => {
		const host = createDesktopHost();
		await expect(
			host.handle({ method: "session.queueContextCompaction", params: { sessionId: "s1" } }),
		).resolves.toEqual({ ok: true, result: { status: "queued", id: "c1", pendingCount: 2 } });
		await expect(
			host.handle({ method: "session.removeQueuedMessage", params: { sessionId: "s1", itemId: "q1" } }),
		).resolves.toEqual({ ok: true, result: true });
		await expect(
			host.handle({ method: "session.reorderQueuedMessages", params: { sessionId: "s1", itemIds: ["q2", "q1"] } }),
		).resolves.toEqual({ ok: true, result: null });
		expect(sharedRuntime.reorderQueuedMessages).toHaveBeenCalledWith("s1", ["q2", "q1"]);
		await expect(
			host.handle({ method: "session.sendQueuedMessageNow", params: { sessionId: "s1", itemId: "q1" } }),
		).resolves.toEqual({ ok: true, result: "promoted" });
		const empty = await host.handle({ method: "session.clearQueue", params: { sessionId: "" } });
		expect(empty).toMatchObject({ ok: false, error: { code: HOST_PROTOCOL_ERROR_CODES.INVALID_PARAMS } });
	});
});

describe("desktop host session history domain", () => {
	beforeEach(() => {
		for (const fn of Object.values(sharedRuntime)) fn.mockClear();
	});

	it("bridges history write commands through the shared runtime", async () => {
		const host = createDesktopHost();
		await expect(
			host.handle({ method: "session.navigateForEdit", params: { sessionId: "s1", entryId: "e1" } }),
		).resolves.toEqual({ ok: true, result: { text: "draft", cancelled: false } });
		await expect(
			host.handle({ method: "session.switchBranch", params: { sessionId: "s1", entryId: "e2" } }),
		).resolves.toEqual({ ok: true, result: { leafId: "e2" } });
		await expect(
			host.handle({ method: "session.deleteMessage", params: { sessionId: "s1", entryId: "e3" } }),
		).resolves.toEqual({ ok: true, result: { leafId: null } });
		await expect(
			host.handle({ method: "session.replaceLastUserMessage", params: { sessionId: "s1", entryId: "e4" } }),
		).resolves.toEqual({ ok: true, result: { leafId: "e9" } });
		await expect(
			host.handle({ method: "session.forkSession", params: { sessionId: "s1", entryId: "e5" } }),
		).resolves.toEqual({ ok: true, result: { path: "C:\\sessions\\fork.jsonl", text: "forked" } });
		expect(sharedRuntime.navigateForEdit).toHaveBeenCalledWith("s1", "e1");
		expect(sharedRuntime.switchBranch).toHaveBeenCalledWith("s1", "e2");
		expect(sharedRuntime.deleteMessage).toHaveBeenCalledWith("s1", "e3");
		expect(sharedRuntime.replaceLastUserMessage).toHaveBeenCalledWith("s1", "e4");
		expect(sharedRuntime.forkSession).toHaveBeenCalledWith("s1", "e5");
	});

	it("rejects empty identifiers with INVALID_PARAMS", async () => {
		const host = createDesktopHost();
		const emptySession = await host.handle({
			method: "session.switchBranch",
			params: { sessionId: "", entryId: "e1" },
		});
		expect(emptySession).toMatchObject({ ok: false, error: { code: HOST_PROTOCOL_ERROR_CODES.INVALID_PARAMS } });
		const emptyEntry = await host.handle({ method: "session.forkSession", params: { sessionId: "s1", entryId: "" } });
		expect(emptyEntry).toMatchObject({ ok: false, error: { code: HOST_PROTOCOL_ERROR_CODES.INVALID_PARAMS } });
	});
});

describe("desktop host session goal domain", () => {
	beforeEach(() => {
		for (const fn of Object.values(sharedRuntime)) fn.mockClear();
		for (const fn of Object.values(goalController)) fn.mockClear();
	});

	it("bridges goal commands through DesktopGoalController and clearTodos via the runtime", async () => {
		const host = createDesktopHost();
		await expect(host.handle({ method: "session.getGoalState", params: { sessionId: "s1" } })).resolves.toEqual({
			ok: true,
			result: null,
		});
		await expect(
			host.handle({ method: "session.startGoal", params: { sessionId: "s1", objective: "ship it" } }),
		).resolves.toEqual({
			ok: true,
			result: {
				goalId: "g1",
				objective: "ship it",
				status: "active",
				tokensUsed: 12,
				timeUsedSeconds: 34,
				continuationCount: 1,
				createdAt: "2026-11-07T00:00:00.000Z",
				updatedAt: "2026-11-07T00:00:01.000Z",
			},
		});
		await expect(
			host.handle({ method: "session.pauseGoal", params: { sessionId: "s1", goalId: "g1" } }),
		).resolves.toMatchObject({ ok: true, result: { status: "paused" } });
		await expect(
			host.handle({ method: "session.resumeGoal", params: { sessionId: "s1", goalId: "g1" } }),
		).resolves.toMatchObject({ ok: true, result: { status: "active" } });
		await expect(
			host.handle({ method: "session.clearGoal", params: { sessionId: "s1", goalId: "g1" } }),
		).resolves.toEqual({ ok: true, result: null });
		await expect(host.handle({ method: "session.clearTodos", params: { sessionId: "s1" } })).resolves.toEqual({
			ok: true,
			result: true,
		});
		expect(goalController.read).toHaveBeenCalledWith("s1");
		expect(goalController.start).toHaveBeenCalledWith("s1", "ship it");
		expect(goalController.pause).toHaveBeenCalledWith("s1", "g1");
		expect(goalController.resume).toHaveBeenCalledWith("s1", "g1");
		expect(goalController.clear).toHaveBeenCalledWith("s1", "g1");
		expect(sharedRuntime.invokeSessionExtension).toHaveBeenCalled();
	});

	it("rejects empty identifiers and objectives with INVALID_PARAMS", async () => {
		const host = createDesktopHost();
		const emptyGoalId = await host.handle({
			method: "session.pauseGoal",
			params: { sessionId: "s1", goalId: "" },
		});
		expect(emptyGoalId).toMatchObject({ ok: false, error: { code: HOST_PROTOCOL_ERROR_CODES.INVALID_PARAMS } });
		const emptyObjective = await host.handle({
			method: "session.startGoal",
			params: { sessionId: "s1", objective: "" },
		});
		expect(emptyObjective).toMatchObject({ ok: false, error: { code: HOST_PROTOCOL_ERROR_CODES.INVALID_PARAMS } });
	});
});

describe("desktop host session title domain", () => {
	beforeEach(() => {
		for (const fn of Object.values(sharedRuntime)) fn.mockClear();
	});

	it("renames through the ownership guard and shared runtime", async () => {
		await expect(
			createDesktopHost().handle({
				method: "session.rename",
				params: { sessionPath: "/sessions/s1.jsonl", name: "New" },
			}),
		).resolves.toEqual({ ok: true, result: null });
		expect(sharedRuntime.renameSession).toHaveBeenCalledWith("/sessions/s1.jsonl", "New");
	});

	it("short-circuits empty inputs and passes generated titles back", async () => {
		const host = createDesktopHost();
		await expect(
			host.handle({ method: "session.autoTitle", params: { sessionId: "s1", userText: "  ", assistantText: "" } }),
		).resolves.toEqual({ ok: true, result: null });
		expect(sharedRuntime.invokeSessionExtension).not.toHaveBeenCalled();
		sharedRuntime.invokeSessionExtension.mockResolvedValueOnce("Generated" as never);
		await expect(
			host.handle({ method: "session.autoTitle", params: { sessionId: "s1", userText: "hi", assistantText: "yo" } }),
		).resolves.toEqual({ ok: true, result: "Generated" });
		expect(sharedRuntime.renameSessionById).toHaveBeenCalledWith("s1", "Generated");
		await expect(
			host.handle({ method: "session.nextPromptSuggestions", params: { sessionId: "s1", conversation: "  " } }),
		).resolves.toEqual({ ok: true, result: [] });
		sharedRuntime.invokeSessionExtension.mockResolvedValueOnce(["try this"] as never);
		await expect(
			host.handle({ method: "session.nextPromptSuggestions", params: { sessionId: "s1", conversation: "hello" } }),
		).resolves.toEqual({ ok: true, result: ["try this"] });
	});

	it("rejects empty identifiers with INVALID_PARAMS", async () => {
		const host = createDesktopHost();
		const emptyPath = await host.handle({ method: "session.rename", params: { sessionPath: "", name: "n" } });
		expect(emptyPath).toMatchObject({ ok: false, error: { code: HOST_PROTOCOL_ERROR_CODES.INVALID_PARAMS } });
		const emptyName = await host.handle({ method: "session.rename", params: { sessionPath: "/s.jsonl", name: "" } });
		expect(emptyName).toMatchObject({ ok: false, error: { code: HOST_PROTOCOL_ERROR_CODES.INVALID_PARAMS } });
	});
});

describe("desktop host session plan-mode domain", () => {
	beforeEach(() => {
		for (const fn of Object.values(sharedRuntime)) fn.mockClear();
	});

	it("bridges sync plan-mode reads and writes through the shared runtime", async () => {
		const host = createDesktopHost();
		await expect(host.handle({ method: "session.getPlanModeState", params: { sessionId: "s1" } })).resolves.toEqual({
			ok: true,
			result: { permissionMode: "default" },
		});
		sharedRuntime.invokeSessionExtensionSync.mockReturnValueOnce({
			permissionMode: "plan",
			plan: { content: "do it", status: "pending-review", updatedAt: "2026-11-07T00:00:00.000Z" },
		} as never);
		await expect(
			host.handle({
				method: "session.setPlanModePermissionMode",
				params: { sessionId: "s1", permissionMode: "plan" },
			}),
		).resolves.toEqual({
			ok: true,
			result: {
				permissionMode: "plan",
				plan: { content: "do it", status: "pending-review", updatedAt: "2026-11-07T00:00:00.000Z" },
			},
		});
		expect(sharedRuntime.invokeSessionExtensionSync).toHaveBeenNthCalledWith(1, "s1", expect.anything(), undefined);
		expect(sharedRuntime.invokeSessionExtensionSync).toHaveBeenNthCalledWith(2, "s1", expect.anything(), {
			permissionMode: "plan",
		});
	});

	it("rejects empty sessionId and unknown permission modes with INVALID_PARAMS", async () => {
		const host = createDesktopHost();
		const emptySession = await host.handle({ method: "session.getPlanModeState", params: { sessionId: "" } });
		expect(emptySession).toMatchObject({ ok: false, error: { code: HOST_PROTOCOL_ERROR_CODES.INVALID_PARAMS } });
		const badMode = await host.handle({
			method: "session.setPlanModePermissionMode",
			params: { sessionId: "s1", permissionMode: "yolo" },
		});
		expect(badMode).toMatchObject({ ok: false, error: { code: HOST_PROTOCOL_ERROR_CODES.INVALID_PARAMS } });
	});
});

describe("desktop host session execution domain", () => {
	beforeEach(() => {
		for (const fn of Object.values(sharedRuntime)) fn.mockClear();
	});

	it("bridges settings patches and agent mode catalog", async () => {
		const host = createDesktopHost();
		await expect(
			host.handle({
				method: "session.updateSettings",
				params: { sessionId: "s1", patch: { thinkingLevel: "high", modelKey: "deepseek/chat" } },
			}),
		).resolves.toEqual({ ok: true, result: null });
		expect(sharedRuntime.updateSettings).toHaveBeenCalledWith("s1", {
			thinkingLevel: "high",
			modelKey: "deepseek/chat",
		});
		await expect(host.handle({ method: "session.getAgentModes", params: {} })).resolves.toEqual({
			ok: true,
			result: [{ id: "coding", label: "Coding", description: "code it", icon: "lucide:code" }],
		});
	});

	it("orchestrates execution mode switches and persists global settings", async () => {
		const host = createDesktopHost();
		await expect(
			host.handle({ method: "session.setExecutionMode", params: { sessionId: "s1", mode: "sandbox" } }),
		).resolves.toEqual({ ok: true, result: null });
		expect(sharedRuntime.setExecutionMode).toHaveBeenCalledWith("s1", "sandbox");
		const sandbox = await import("@vetta/runtime-desktop");
		expect(sandbox.assertProjectSupportsExecutionMode).toHaveBeenCalledWith(undefined, "sandbox");
		const capability = await import("../sandbox/capability.js");
		expect(capability.assertSandboxAvailableForMode).toHaveBeenCalled();
		await expect(
			host.handle({ method: "session.setGlobalExecutionMode", params: { mode: "full-access" } }),
		).resolves.toEqual({ ok: true, result: null });
		const configStore = await import("../config/desktop-config-store.js");
		expect(configStore.updateDesktopConfig).toHaveBeenCalled();
		await expect(host.handle({ method: "session.setGlobalAgentMode", params: { mode: "chat" } })).resolves.toEqual({
			ok: true,
			result: null,
		});
		await expect(
			host.handle({ method: "session.setGlobalThinkingLevel", params: { level: "high" } }),
		).resolves.toEqual({ ok: true, result: null });
		expect(sharedRuntime.updateGlobalThinkingLevel).toHaveBeenCalledWith("high");
	});

	it("rejects invalid execution modes with INVALID_PARAMS", async () => {
		const host = createDesktopHost();
		const badMode = await host.handle({
			method: "session.setGlobalExecutionMode",
			params: { mode: "turbo" },
		});
		expect(badMode).toMatchObject({ ok: false, error: { code: HOST_PROTOCOL_ERROR_CODES.INVALID_PARAMS } });
	});
});

describe("desktop host session runtime-ops domain", () => {
	beforeEach(() => {
		for (const fn of Object.values(sharedRuntime)) fn.mockClear();
		interruptDraftRegistry.setSessionInterruptDraftNonEmpty.mockClear();
	});

	it("clears manual-stop before retry and mirrors the interrupt draft flag", async () => {
		const host = createDesktopHost();
		await expect(host.handle({ method: "session.retry", params: { sessionId: "s1" } })).resolves.toEqual({
			ok: true,
			result: null,
		});
		expect(sharedRuntime.retry).toHaveBeenCalledWith("s1");
		await expect(
			host.handle({ method: "session.setInterruptDraftNonEmpty", params: { sessionId: "s1", nonEmpty: true } }),
		).resolves.toEqual({ ok: true, result: null });
		expect(interruptDraftRegistry.setSessionInterruptDraftNonEmpty).toHaveBeenCalledWith("s1", true);
	});

	it("returns the session path and bridges background task operations", async () => {
		const host = createDesktopHost();
		await expect(host.handle({ method: "session.getSessionPath", params: { sessionId: "s1" } })).resolves.toEqual({
			ok: true,
			result: "/sessions/s1.jsonl",
		});
		sharedRuntime.getSessionPath.mockReturnValueOnce(undefined);
		await expect(host.handle({ method: "session.getSessionPath", params: { sessionId: "gone" } })).resolves.toEqual({
			ok: true,
			result: null,
		});
		sharedRuntime.invokeSessionExtension.mockResolvedValueOnce(3 as never);
		await expect(
			host.handle({ method: "session.clearFinishedBackgroundTasks", params: { sessionId: "s1" } }),
		).resolves.toEqual({ ok: true, result: 3 });
		await expect(
			host.handle({ method: "session.killBackgroundTask", params: { sessionId: "s1", taskId: "t1" } }),
		).resolves.toEqual({ ok: true, result: true });
		sharedRuntime.invokeSessionExtension.mockResolvedValueOnce({ id: "snap" } as never);
		await expect(
			host.handle({ method: "session.interruptSubagent", params: { sessionId: "s1", target: "writer" } }),
		).resolves.toEqual({ ok: true, result: true });
		sharedRuntime.invokeSessionExtension.mockResolvedValueOnce(null as never);
		await expect(
			host.handle({ method: "session.interruptSubagent", params: { sessionId: "s1", target: "writer" } }),
		).resolves.toEqual({ ok: true, result: false });
	});

	it("rejects empty identifiers and non-boolean draft flags with INVALID_PARAMS", async () => {
		const host = createDesktopHost();
		const emptyId = await host.handle({ method: "session.retry", params: { sessionId: "" } });
		expect(emptyId).toMatchObject({ ok: false, error: { code: HOST_PROTOCOL_ERROR_CODES.INVALID_PARAMS } });
		const badFlag = await host.handle({
			method: "session.setInterruptDraftNonEmpty",
			params: { sessionId: "s1", nonEmpty: "yes" },
		});
		expect(badFlag).toMatchObject({ ok: false, error: { code: HOST_PROTOCOL_ERROR_CODES.INVALID_PARAMS } });
	});
});
