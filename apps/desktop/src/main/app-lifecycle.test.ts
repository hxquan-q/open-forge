// Copyright The Open Forge contributors.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	APP_LIFECYCLE_RENDERER_BOOT_PAINTED_CHANNEL,
	APP_LIFECYCLE_RENDERER_CONTENT_PAINTED_CHANNEL,
	APP_LIFECYCLE_RENDERER_STARTUP_PHASE_CHANNEL,
} from "../shared/app-lifecycle-ipc.js";

const ipc = vi.hoisted(() => ({
	listeners: new Map<string, (event: unknown, result?: unknown) => void>(),
}));
vi.mock("electron", () => ({
	ipcMain: {
		on: (channel: string, callback: (event: unknown, result?: unknown) => void) =>
			ipc.listeners.set(channel, callback),
		handle: vi.fn(),
	},
}));

import { logRendererPaintResult, registerAppLifecycleIpc } from "./app-lifecycle.js";

beforeEach(() => {
	ipc.listeners.clear();
	vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

it("does not count a hidden renderer's skipped frame as a visible paint", async () => {
	const lifecycle = registerAppLifecycleIpc();
	const boot = lifecycle.waitForRendererBootPaint();
	ipc.listeners.get(APP_LIFECYCLE_RENDERER_BOOT_PAINTED_CHANNEL)?.({}, "skipped-hidden");
	await expect(boot).resolves.toBe("skipped-hidden");
	const content = lifecycle.waitForRendererContentPaint();
	ipc.listeners.get(APP_LIFECYCLE_RENDERER_CONTENT_PAINTED_CHANNEL)?.({}, "skipped-hidden");
	await expect(content).resolves.toBe("skipped-hidden");
});

it("keeps a bounded wait and accepts a later real paint for subsequent observers", async () => {
	const lifecycle = registerAppLifecycleIpc();
	const first = lifecycle.waitForRendererContentPaint(100);
	await vi.advanceTimersByTimeAsync(100);
	await expect(first).resolves.toBe("timeout");
	ipc.listeners.get(APP_LIFECYCLE_RENDERER_CONTENT_PAINTED_CHANNEL)?.({});
	await expect(lifecycle.waitForRendererContentPaint()).resolves.toBe("painted");
	expect(vi.getTimerCount()).toBe(0);
});

it("ignores malformed paint signals and keeps legacy no-argument reports compatible", async () => {
	const lifecycle = registerAppLifecycleIpc();
	const result = lifecycle.waitForRendererBootPaint(100);
	ipc.listeners.get(APP_LIFECYCLE_RENDERER_BOOT_PAINTED_CHANNEL)?.({}, "not-a-paint");
	let settled = false;
	void result.then(() => {
		settled = true;
	});
	await vi.advanceTimersByTimeAsync(0);
	expect(settled).toBe(false);
	ipc.listeners.get(APP_LIFECYCLE_RENDERER_BOOT_PAINTED_CHANNEL)?.({});
	await expect(result).resolves.toBe("painted");
});

it("records a wait timeout separately from a successful paint", async () => {
	const lifecycle = registerAppLifecycleIpc();
	const log = { info: vi.fn(), warn: vi.fn() };
	const waiting = lifecycle
		.waitForRendererContentPaint(100)
		.then((result) => logRendererPaintResult(log, "content", result, 100));
	await vi.advanceTimersByTimeAsync(100);
	await waiting;
	expect(log.info).not.toHaveBeenCalled();
	expect(log.warn).toHaveBeenCalledWith("renderer content paint timed out", { durationMs: 100, result: "timeout" });
	ipc.listeners.get(APP_LIFECYCLE_RENDERER_CONTENT_PAINTED_CHANNEL)?.({}, "painted");
	logRendererPaintResult(log, "content", await lifecycle.waitForRendererContentPaint(), 120);
	expect(log.info).toHaveBeenCalledWith("renderer content frame visible", { durationMs: 120, result: "painted" });
	logRendererPaintResult(log, "boot", "skipped-hidden", 1);
	expect(log.info).toHaveBeenLastCalledWith("renderer boot paint skipped while hidden", {
		durationMs: 1,
		result: "skipped-hidden",
	});
});

it("only observes known startup stages and tolerates observation failure", () => {
	const onPhase = vi.fn((_phase: string) => {
		throw new Error("observation offline");
	});
	registerAppLifecycleIpc({ onPhase });
	const report = ipc.listeners.get(APP_LIFECYCLE_RENDERER_STARTUP_PHASE_CHANNEL);
	expect(() => report?.({}, "app-ready")).not.toThrow();
	report?.({}, "renderer-module-loaded");
	report?.({}, "route-content-committed");
	report?.({}, { arbitrary: "untrusted" });
	expect(onPhase.mock.calls.map(([phase]) => phase)).toEqual([
		"app-ready",
		"renderer-module-loaded",
		"route-content-committed",
	]);
});
