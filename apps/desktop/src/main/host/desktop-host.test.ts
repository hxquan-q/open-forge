// Copyright The Open Forge contributors.
import { HOST_PROTOCOL_ERROR_CODES } from "@vetta/host-protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";

let document: Record<string, unknown>;
vi.mock("../agent-settings/settings-document-store.js", () => ({
	readAgentSettingsDocument: () => document,
	updateAgentSettingsDocument: (mutate: (settings: Record<string, unknown>) => void) => mutate(document),
}));
vi.mock("../constants.js", () => ({
	DEFAULT_SERVER_URL: "https://server.example.test",
	DEFAULT_SITE_URL: "https://site.example.test",
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

describe("desktop host settings domain", () => {
	beforeEach(() => {
		document = {};
	});

	it("registers exactly the settings, models and mcp host methods", () => {
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
			"settings.getModelTransport",
			"settings.getServerUrl",
			"settings.getSessionInterruptContinue",
			"settings.getSiteUrl",
			"settings.setModelTransport",
			"settings.setSessionInterruptContinue",
		]);
	});

	it("returns server and site urls from build constants", async () => {
		const host = createDesktopHost();
		await expect(host.handle({ method: "settings.getServerUrl", params: {} })).resolves.toEqual({
			ok: true,
			result: "https://server.example.test",
		});
		await expect(host.handle({ method: "settings.getSiteUrl", params: {} })).resolves.toEqual({
			ok: true,
			result: "https://site.example.test",
		});
	});

	it("reads and persists model transport", async () => {
		const host = createDesktopHost();
		await expect(host.handle({ method: "settings.getModelTransport", params: {} })).resolves.toEqual({
			ok: true,
			result: "sse",
		});
		await expect(
			host.handle({ method: "settings.setModelTransport", params: { transport: "websocket" } }),
		).resolves.toEqual({ ok: true, result: "websocket" });
		expect(document.transport).toBe("websocket");
	});

	it("rejects invalid model transport without writing", async () => {
		const response = await createDesktopHost().handle({
			method: "settings.setModelTransport",
			params: { transport: "socket" },
		});
		expect(response).toMatchObject({ ok: false, error: { code: HOST_PROTOCOL_ERROR_CODES.INVALID_PARAMS } });
		expect(document).toEqual({});
	});

	it("keeps session interrupt defaults and normalization for corrupt persisted data", async () => {
		const host = createDesktopHost();
		await expect(host.handle({ method: "settings.getSessionInterruptContinue", params: {} })).resolves.toEqual({
			ok: true,
			result: { mode: "notify", maxAttempts: 1 },
		});
		document.sessionInterruptContinue = { mode: "bogus", maxAttempts: 3.7 };
		await expect(host.handle({ method: "settings.getSessionInterruptContinue", params: {} })).resolves.toEqual({
			ok: true,
			result: { mode: "notify", maxAttempts: 3 },
		});
	});

	it("writes session interrupt mode, preserving other fields and pinning maxAttempts to 1", async () => {
		document.sessionInterruptContinue = { mode: "notify", maxAttempts: 5, extra: true };
		await expect(
			createDesktopHost().handle({ method: "settings.setSessionInterruptContinue", params: { mode: "auto" } }),
		).resolves.toEqual({ ok: true, result: null });
		expect(document.sessionInterruptContinue).toEqual({ mode: "auto", maxAttempts: 1, extra: true });
	});

	it("rejects invalid session interrupt mode without writing", async () => {
		const response = await createDesktopHost().handle({
			method: "settings.setSessionInterruptContinue",
			params: { mode: "always" },
		});
		expect(response).toMatchObject({ ok: false, error: { code: HOST_PROTOCOL_ERROR_CODES.INVALID_PARAMS } });
		expect(document).toEqual({});
	});
});

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
