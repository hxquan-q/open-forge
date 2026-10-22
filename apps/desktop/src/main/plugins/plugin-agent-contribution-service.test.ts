// Modified by The Open Forge contributors.
import { describe, expect, it, vi } from "vitest";
import type { InstalledPlugin } from "../../preload/api-types/plugins.js";
import { DesktopPluginAgentHandlerRegistry } from "./coding-agent-handler-registry.js";
import { DesktopPluginHookRegistry } from "./coding-agent-hook-registry.js";
import { PluginAgentContributionService } from "./plugin-agent-contribution-service.js";

function plugin(overrides: Partial<InstalledPlugin> = {}): InstalledPlugin {
	return {
		id: "demo",
		name: "Demo",
		version: "1.0.0",
		activeVersion: "1.0.0",
		pluginApiVersion: "^2.0.0",
		moduleFederation: { remoteName: "agent_contribution_test", expose: "./plugin" },
		entryUrl: "vetta-plugin://demo/index.js",
		styleUrls: [],
		permissions: ["agent.hooks.register", "agent.hookHandler.execute", "agent.tools.register"],
		grantedPermissions: ["agent.hooks.register", "agent.hookHandler.execute", "agent.tools.register"],
		allowedNetworkHosts: [],
		allowedBrowserHosts: [],
		declaredCommands: [],
		grantedCommandNames: [],
		defaultLocale: "zh",
		locales: {},
		enabled: true,
		required: false,
		installedAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		source: "archive",
		trustLevel: "local",
		rootPath: "C:/plugins/demo",
		...overrides,
	};
}

function createService(
	installed: InstalledPlugin,
	onRuntimeLoaded?: (plugin: InstalledPlugin, activationId: string) => void,
) {
	const hooks = {
		register: vi.fn(),
		unregister: vi.fn(() => true),
		clear: vi.fn(),
		count: vi.fn(() => 0),
	} as unknown as DesktopPluginHookRegistry;
	return new PluginAgentContributionService({
		listPlugins: () => [installed],
		isDevLinked: () => false,
		resolveFilePath: (_pluginId, relativePath) => relativePath,
		logger: { debug: vi.fn(), warn: vi.fn() },
		hooks,
		handlers: new DesktopPluginAgentHandlerRegistry(),
		onRuntimeLoaded,
	});
}

describe("PluginAgentContributionService", () => {
	it("discards staged handlers when their renderer document is lost and permits a new activation", () => {
		const hooks = new DesktopPluginHookRegistry();
		const service = new PluginAgentContributionService({
			listPlugins: () => [plugin()],
			isDevLinked: () => false,
			resolveFilePath: (_id, path) => path,
			logger: { debug: vi.fn(), warn: vi.fn() },
			hooks,
			handlers: new DesktopPluginAgentHandlerRegistry(),
		});
		const register = (activationId: string) =>
			service.registerHook("demo", {
				id: "hook",
				eventName: "SessionStart",
				handlerId: activationId,
				activationId,
				scope_use: ["cli"],
			});
		service.beginLoad("demo", "old");
		register("old");
		service.invalidateHookRendererDocument("document lost");
		expect(() => service.commitLoad("demo", "old")).toThrow();
		expect(hooks.snapshot()).toEqual([]);
		register("old");
		expect(hooks.snapshot()).toEqual([]);
		service.beginLoad("demo", "new");
		register("new");
		service.commitLoad("demo", "new");
		const lease = hooks.acquireSnapshot();
		expect(hooks.readInvocationRejection("demo", "new", "new")).toBeUndefined();
		lease.release();
	});

	it("applies the contribution mode gate before hook invocation", () => {
		const service = createService(plugin());
		service.registerModeGate("demo");
		expect(service.canInvokeHook("demo")).toBe(false);

		service.setContributionMode("demo", true);
		expect(service.canInvokeHook("demo")).toBe(true);
	});

	it("never gates hook invocation on any agent mode notion", () => {
		// 工作模式不参与 hook 过滤（ADR-0071），服务不持有「当前模式」这个可过滤的状态。
		const service = createService(plugin());

		expect(service.canInvokeHook("demo")).toBe(true);
		expect("setAgentMode" in service).toBe(false);
	});

	it("rejects tool registration when the permission is not granted", () => {
		const service = createService(plugin({ grantedPermissions: [] }));

		expect(() =>
			service.registerTool("demo", {
				id: "tool",
				name: "demo_tool",
				description: "Demo tool",
				parameters: { type: "object" },
				handlerId: "handler",
			}),
		).toThrow("Plugin permission denied: agent.tools.register");
	});

	it("reports a runtime load only after the activation commits", () => {
		const onRuntimeLoaded = vi.fn();
		const service = createService(plugin(), onRuntimeLoaded);

		service.beginLoad("demo", "activation-1");
		expect(onRuntimeLoaded).not.toHaveBeenCalled();
		service.commitLoad("demo", "activation-1");

		expect(onRuntimeLoaded).toHaveBeenCalledWith(expect.objectContaining({ id: "demo" }), "activation-1");
	});
});
