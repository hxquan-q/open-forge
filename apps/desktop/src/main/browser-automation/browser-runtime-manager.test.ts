// Modified by The Open Forge contributors.
import { describe, expect, it, vi } from "vitest";
import type { BrowserProcessResult, BrowserProcessRunner } from "./browser-process-runner.js";
import {
	AGENT_BROWSER_VERSION,
	BrowserRuntimeManager,
	RUNTIME_STATUS_FAILURE_TTL_MS,
	RUNTIME_STATUS_SUCCESS_TTL_MS,
} from "./browser-runtime-manager.js";

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function output(stdout: string, exitCode = 0): BrowserProcessResult {
	return { exitCode, stdout, stderr: "", durationMs: 1, truncated: false };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((settle) => {
		resolve = settle;
	});
	return { promise, resolve };
}

describe("BrowserRuntimeManager", () => {
	it("distinguishes missing, outdated, and ready runtimes", async () => {
		let now = 0;
		const outputs = [output("", 1), output("agent-browser 0.25.4"), output(`agent-browser ${AGENT_BROWSER_VERSION}`)];
		const runner: BrowserProcessRunner = { run: vi.fn(async () => outputs.shift()!) };
		const manager = new BrowserRuntimeManager(runner, logger, { now: () => now });
		expect(await manager.status()).toEqual({ phase: "missing" });
		now += RUNTIME_STATUS_FAILURE_TTL_MS + 1;
		expect(await manager.status()).toEqual({ phase: "outdated", version: "0.25.4" });
		now += RUNTIME_STATUS_SUCCESS_TTL_MS + 1;
		expect(await manager.status()).toEqual({ phase: "ready", version: AGENT_BROWSER_VERSION });
		expect(runner.run).toHaveBeenCalledTimes(3);
	});

	it("serves a determinate status from cache inside the success window", async () => {
		let now = 0;
		const runner: BrowserProcessRunner = {
			run: vi.fn(async () => output(`agent-browser ${AGENT_BROWSER_VERSION}`)),
		};
		const manager = new BrowserRuntimeManager(runner, logger, { now: () => now });
		expect(await manager.status()).toEqual({ phase: "ready", version: AGENT_BROWSER_VERSION });
		now += RUNTIME_STATUS_SUCCESS_TTL_MS - 1;
		expect(await manager.status()).toEqual({ phase: "ready", version: AGENT_BROWSER_VERSION });
		expect(runner.run).toHaveBeenCalledTimes(1);
		now += 1;
		await manager.status();
		expect(runner.run).toHaveBeenCalledTimes(2);
	});

	it("re-probes quickly after an indeterminate failure", async () => {
		let now = 0;
		const runner: BrowserProcessRunner = { run: vi.fn(async () => output("", 1)) };
		const manager = new BrowserRuntimeManager(runner, logger, { now: () => now });
		expect(await manager.status()).toEqual({ phase: "missing" });
		now += RUNTIME_STATUS_FAILURE_TTL_MS - 1;
		expect(await manager.status()).toEqual({ phase: "missing" });
		expect(runner.run).toHaveBeenCalledTimes(1);
		now += 1;
		await manager.status();
		expect(runner.run).toHaveBeenCalledTimes(2);
	});

	it("shares one probe between concurrent callers", async () => {
		const probe = deferred<BrowserProcessResult>();
		const runner: BrowserProcessRunner = { run: vi.fn(() => probe.promise) };
		const manager = new BrowserRuntimeManager(runner, logger, { now: () => 0 });
		const first = manager.status();
		const second = manager.status();
		expect(runner.run).toHaveBeenCalledTimes(1);
		probe.resolve(output(`agent-browser ${AGENT_BROWSER_VERSION}`));
		await expect(Promise.all([first, second])).resolves.toEqual([
			{ phase: "ready", version: AGENT_BROWSER_VERSION },
			{ phase: "ready", version: AGENT_BROWSER_VERSION },
		]);
	});

	it("ends only the aborted caller's wait while the shared probe continues", async () => {
		const probe = deferred<BrowserProcessResult>();
		const runner: BrowserProcessRunner = { run: vi.fn(() => probe.promise) };
		const manager = new BrowserRuntimeManager(runner, logger, { now: () => 0 });
		const controller = new AbortController();
		const aborted = manager.status(controller.signal);
		const survivor = manager.status();
		controller.abort();
		await expect(aborted).rejects.toMatchObject({ name: "AbortError" });
		probe.resolve(output(`agent-browser ${AGENT_BROWSER_VERSION}`));
		await expect(survivor).resolves.toEqual({ phase: "ready", version: AGENT_BROWSER_VERSION });
		expect(runner.run).toHaveBeenCalledTimes(1);
	});

	it("bypasses the cache for a fresh recheck", async () => {
		const runner: BrowserProcessRunner = {
			run: vi.fn(async () => output(`agent-browser ${AGENT_BROWSER_VERSION}`)),
		};
		const manager = new BrowserRuntimeManager(runner, logger, { now: () => 0 });
		await manager.status();
		await manager.status(undefined, { fresh: true });
		expect(runner.run).toHaveBeenCalledTimes(2);
	});

	it("deduplicates concurrent runtime installations", async () => {
		let releaseInstall: (() => void) | undefined;
		const runner: BrowserProcessRunner = {
			run: vi.fn(async (file) => {
				if (file === "npm") {
					await new Promise<void>((resolve) => {
						releaseInstall = resolve;
					});
				}
				return output(file === "npm" ? "installed" : `agent-browser ${AGENT_BROWSER_VERSION}`);
			}),
		};
		const manager = new BrowserRuntimeManager(runner, logger);
		const first = manager.install({ namespace: "plugin-a", step: "runtime" });
		const second = manager.install({ namespace: "plugin-b", step: "runtime" });
		expect(first).toBe(second);
		releaseInstall?.();
		await expect(first).resolves.toMatchObject({ phase: "ready" });
		expect(runner.run).toHaveBeenCalledTimes(2);
	});

	it("ignores a probe that started before installation", async () => {
		const staleProbe = deferred<BrowserProcessResult>();
		let probes = 0;
		const runner: BrowserProcessRunner = {
			run: vi.fn(async (file) => {
				if (file === "npm") return output("installed");
				probes += 1;
				return probes === 1 ? staleProbe.promise : output(`agent-browser ${AGENT_BROWSER_VERSION}`);
			}),
		};
		const manager = new BrowserRuntimeManager(runner, logger, { now: () => 0 });
		const stale = manager.status();
		await expect(manager.install({ namespace: "plugin", step: "runtime" })).resolves.toMatchObject({
			phase: "ready",
		});
		staleProbe.resolve(output("agent-browser 0.25.4"));
		await expect(stale).resolves.toEqual({ phase: "outdated", version: "0.25.4" });
		expect(await manager.status()).toEqual({ phase: "ready", version: AGENT_BROWSER_VERSION });
		expect(runner.run).toHaveBeenCalledTimes(3);
	});

	it("reports browser-missing after runtime install detects no Chrome, then ready after browser install", async () => {
		const runner: BrowserProcessRunner = {
			run: vi.fn(async (file, args) =>
				output(
					file === "npm"
						? "No Chrome installation detected."
						: args[0] === "--version"
							? `agent-browser ${AGENT_BROWSER_VERSION}`
							: "browser installed",
				),
			),
		};
		const manager = new BrowserRuntimeManager(runner, logger);
		expect(await manager.install({ namespace: "browser", step: "runtime" })).toMatchObject({
			phase: "browser-missing",
		});
		expect(await manager.install({ namespace: "browser", step: "browser" })).toMatchObject({ phase: "ready" });
	});

	it("drops cached readiness when an installation fails", async () => {
		const runner: BrowserProcessRunner = {
			run: vi.fn(async (file) =>
				file === "npm" ? output("", 1) : output(`agent-browser ${AGENT_BROWSER_VERSION}`),
			),
		};
		const manager = new BrowserRuntimeManager(runner, logger, { now: () => 0 });
		expect(await manager.status()).toEqual({ phase: "ready", version: AGENT_BROWSER_VERSION });
		await expect(manager.install({ namespace: "plugin", step: "runtime" })).resolves.toMatchObject({
			phase: "error",
		});
		// 失败安装可能已经改动了磁盘；即便仍在成功 TTL 内，下一次查询也必须重新探测。
		expect(await manager.status()).toEqual({ phase: "ready", version: AGENT_BROWSER_VERSION });
		expect(runner.run).toHaveBeenCalledTimes(3);
	});

	it("drops the cached readiness when invalidated", async () => {
		const runner: BrowserProcessRunner = {
			run: vi.fn(async () => output(`agent-browser ${AGENT_BROWSER_VERSION}`)),
		};
		const manager = new BrowserRuntimeManager(runner, logger, { now: () => 0 });
		await manager.status();
		manager.invalidate();
		await manager.status();
		expect(runner.run).toHaveBeenCalledTimes(2);
	});
});
