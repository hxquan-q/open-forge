// Copyright The Open Forge contributors.
import { randomUUID } from "node:crypto";
import type { DesktopPluginHookInvocation, DesktopPluginHookInvoker } from "./coding-agent-hook-invocation.js";
import type { PluginToolRendererHostLifecycle } from "./plugin-tool-renderer-host-lifecycle.js";

interface HookDispatcherDependencies {
	readonly host: PluginToolRendererHostLifecycle;
	readonly pending: Map<string, (result: unknown) => void>;
	readRejection(request: DesktopPluginHookInvocation): string | undefined;
	send(request: DesktopPluginHookInvocation & { readonly requestId: string }): void;
	onFailure(request: DesktopPluginHookInvocation, message: string): void;
}

/** A request owns its IPC callback, abort listener and document lease together. */
export function createPluginHookRendererDispatcher(dependencies: HookDispatcherDependencies): DesktopPluginHookInvoker {
	return (request, signal) => {
		const rejection = dependencies.readRejection(request);
		if (rejection) return Promise.reject(new Error(rejection));
		return new Promise<unknown>((resolve, reject) => {
			const requestId = randomUUID();
			let settled = false;
			let release: (() => void) | undefined;
			const cleanup = (): boolean => {
				if (settled) return false;
				settled = true;
				dependencies.pending.delete(requestId);
				signal?.removeEventListener("abort", onAbort);
				release?.();
				return true;
			};
			const fail = (error: Error): void => {
				if (cleanup()) reject(error);
			};
			const onAbort = (): void => fail(new Error("Plugin hook invocation was aborted"));
			if (signal?.aborted) {
				onAbort();
				return;
			}
			const lease = dependencies.host.acquire(fail);
			if (!lease.ok) {
				fail(lease.error);
				return;
			}
			release = () => lease.release();
			signal?.addEventListener("abort", onAbort, { once: true });
			dependencies.pending.set(requestId, (result) => {
				if (settled) return;
				if (typeof result === "object" && result !== null && "error" in result) {
					const message = String(result.error ?? "Plugin hook failed");
					dependencies.onFailure(request, message);
					fail(new Error(message));
					return;
				}
				const currentRejection = dependencies.readRejection(request);
				if (currentRejection) {
					fail(new Error(currentRejection));
					return;
				}
				if (cleanup())
					resolve(typeof result === "object" && result !== null && "value" in result ? result.value : undefined);
			});
			try {
				dependencies.send({ ...request, requestId });
			} catch (error) {
				fail(error instanceof Error ? error : new Error(String(error)));
			}
		});
	};
}
