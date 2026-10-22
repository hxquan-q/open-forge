// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ navigate: vi.fn(async () => undefined) }));
vi.mock("./router.js", () => ({ router: navigation }));

// Transform the production graph during collection, before per-test lifecycle timing.
import "./initialize-hosted-routes.js";

beforeEach(() => {
	Reflect.deleteProperty(globalThis, "__openForgeHostedRouteDocument_v1");
	vi.resetModules();
	vi.clearAllMocks();
});

const plugin = {
	id: "audit-plugin",
	enabled: true,
	trustLevel: "official" as const,
	permissions: ["ui.slot.workspace-view"],
	grantedPermissions: ["ui.slot.workspace-view"],
};

it("keeps plugin grants on the initialized document host after consumer and initializer modules reload", async () => {
	const first = await import("./initialize-hosted-routes.js");
	first.initializeHostedRoutes();
	const { PluginRendererCapabilityHost: FirstHost } = await import(
		"./domains/plugins/runtime/plugin-renderer-capability-host.js"
	);
	const old = new FirstHost();
	old.bindSession("old", plugin);
	await old.openWorkspaceView("old", "page");
	vi.resetModules();
	const { PluginRendererCapabilityHost: NextHost } = await import(
		"./domains/plugins/runtime/plugin-renderer-capability-host.js"
	);
	const next = new NextHost();
	expect(() => next.bindSession("new", plugin)).not.toThrow();
	await next.openWorkspaceView("new", "page");
	const reloaded = await import("./initialize-hosted-routes.js");
	expect(() => reloaded.initializeHostedRoutes()).not.toThrow();
	reloaded.initializeHostedRoutes();
	await old.openWorkspaceView("old", "page");
	await next.openWorkspaceView("new", "page");
	expect(navigation.navigate).toHaveBeenLastCalledWith({
		to: "/workspace/$pluginId/$viewId",
		params: { pluginId: "audit-plugin", viewId: "page" },
	});
	next.closeSession("new");
	await expect(next.openWorkspaceView("new", "page")).rejects.toThrow("not active");
});

it("rolls back successful namespace registrations when the provider fails so initialization can retry", async () => {
	const { rendererCapabilityHost } = await import("./shared/capabilities/renderer-capability-host.js");
	const registration = vi.spyOn(rendererCapabilityHost, "registerDomainProviders").mockImplementationOnce(() => {
		throw new Error("provider unavailable");
	});
	const { initializeHostedRoutes } = await import("./initialize-hosted-routes.js");
	expect(initializeHostedRoutes).toThrow("provider unavailable");
	registration.mockRestore();
	expect(initializeHostedRoutes).not.toThrow();
	const { PluginRendererCapabilityHost } = await import(
		"./domains/plugins/runtime/plugin-renderer-capability-host.js"
	);
	const host = new PluginRendererCapabilityHost();
	host.bindSession("retry", plugin);
	await host.openWorkspaceView("retry", "page");
	expect(navigation.navigate).toHaveBeenCalled();
});
