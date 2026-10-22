// Copyright The Open Forge contributors.
import { describe, expect, it, vi } from "vitest";
import type { DesktopPluginHookInvocation } from "./coding-agent-hook-invocation.js";
import { DesktopPluginHookRegistry } from "./coding-agent-hook-registry.js";
import { createPluginHookRendererDispatcher } from "./plugin-hook-renderer-dispatcher.js";
import { PluginToolRendererHostLifecycle } from "./plugin-tool-renderer-host-lifecycle.js";
import { attachPluginToolRendererHostNavigation } from "./plugin-tool-renderer-host-navigation.js";

function fixture() {
	const registry = new DesktopPluginHookRegistry();
	const host = new PluginToolRendererHostLifecycle();
	host.markReady();
	const pending = new Map<string, (result: unknown) => void>();
	const send = vi.fn();
	const onFailure = vi.fn();
	const invoke = createPluginHookRendererDispatcher({
		host,
		pending,
		send,
		onFailure,
		readRejection: (request) =>
			registry.readInvocationRejection(request.pluginId, request.handlerId, request.activationId),
	});
	const register = (id: string) => {
		registry.register("plugin", {
			id: "hook",
			handlerId: id,
			activationId: id,
			eventName: "SessionStart",
			scope_use: [],
		});
		return registry.acquireSnapshot();
	};
	const request = (id: string): DesktopPluginHookInvocation => ({
		pluginId: "plugin",
		hookId: "hook",
		handlerId: id,
		activationId: id,
		session: { id: "session", cwd: "/fixture", scenario: "cli" },
		event: {
			eventName: "SessionStart",
			source: "startup",
			sessionId: "session",
			cwd: "/fixture",
			model: "fixture",
			permissionMode: "default",
		},
	});
	return { registry, host, pending, send, onFailure, invoke, register, request };
}

describe("plugin hook document dispatch", () => {
	it("finishes pending work on committed navigation, rejects lost generations after ready, and admits the new document", async () => {
		const f = fixture();
		const old = f.register("old");
		const listeners = new Map<string, () => void>();
		const detach = attachPluginToolRendererHostNavigation(
			{ on: (name, listener) => listeners.set(name, listener), removeListener: (name) => listeners.delete(name) },
			f.host,
			() => f.registry.invalidateRendererDocument("document replaced"),
		);
		const result = f.invoke(f.request("old"));
		const rejected = expect(result).rejects.toThrow("loading");
		const late = [...f.pending.values()][0]!;
		listeners.get("did-navigate")!();
		await rejected;
		expect(f.pending.size).toBe(0);
		late({ value: "too late" });
		f.host.markReady();
		await expect(f.invoke(f.request("old"))).rejects.toThrow("document replaced");
		expect(f.send).toHaveBeenCalledTimes(1);
		const next = f.register("new");
		const success = f.invoke(f.request("new"));
		[...f.pending.values()][0]!({ value: "recovered" });
		await expect(success).resolves.toBe("recovered");
		old.release();
		next.release();
		detach();
		expect(f.pending.size).toBe(0);
	});
	it("retains ordinary leased replacements and cleans up cancellation, send failures, replies and hard revocation", async () => {
		const f = fixture();
		const old = f.register("old");
		const next = f.register("new");
		const success = f.invoke(f.request("old"));
		[...f.pending.values()][0]!({ value: "old result" });
		await expect(success).resolves.toBe("old result");
		const controller = new AbortController();
		const cancelled = f.invoke(f.request("new"), controller.signal);
		const rejection = expect(cancelled).rejects.toThrow("aborted");
		controller.abort();
		await rejection;
		expect(f.pending.size).toBe(0);
		await expect(f.invoke(f.request("new"), controller.signal)).rejects.toThrow("aborted");
		f.send.mockImplementationOnce(() => {
			throw new Error("send failed");
		});
		await expect(f.invoke(f.request("new"))).rejects.toThrow("send failed");
		expect(f.pending.size).toBe(0);
		const failure = f.invoke(f.request("new"));
		const failed = expect(failure).rejects.toThrow("handler failed");
		[...f.pending.values()][0]!({ error: "handler failed" });
		await failed;
		expect(f.onFailure).toHaveBeenCalledOnce();
		const revoked = f.invoke(f.request("new"));
		const rejected = expect(revoked).rejects.toThrow("permission revoked");
		f.registry.hardRevoke("plugin", "permission revoked");
		[...f.pending.values()][0]!({ value: "must not escape" });
		await rejected;
		expect(f.pending.size).toBe(0);
		old.release();
		next.release();
	});
});
