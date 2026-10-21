// Modified by The Open Forge contributors.
import { ipcMain } from "electron";
import type { RendererPaintResult, RendererStartupPhase } from "../shared/app-lifecycle-ipc.js";
import {
	APP_LIFECYCLE_RENDERER_BOOT_PAINTED_CHANNEL,
	APP_LIFECYCLE_RENDERER_CONTENT_PAINTED_CHANNEL,
	APP_LIFECYCLE_RENDERER_STARTUP_PHASE_CHANNEL,
	APP_LIFECYCLE_WHEN_READY_CHANNEL,
} from "../shared/app-lifecycle-ipc.js";

const DEFAULT_BOOT_PAINT_TIMEOUT_MS = 10_000;

function waitForPaint(
	readResult: () => RendererPaintResult | undefined,
	paintedPromise: Promise<RendererPaintResult>,
	timeoutMs: number,
): Promise<RendererPaintResult> {
	const result = readResult();
	if (result !== undefined) return Promise.resolve(result);
	return new Promise<RendererPaintResult>((resolve) => {
		const timeout = setTimeout(() => resolve("timeout"), timeoutMs);
		void paintedPromise.then((reported) => {
			clearTimeout(timeout);
			resolve(reported);
		});
	});
}

export type { RendererPaintResult };

export function logRendererPaintResult(
	log: { info(message: string, data: object): void; warn(message: string, data: object): void },
	phase: "boot" | "content",
	result: RendererPaintResult,
	durationMs: number,
): void {
	const data = { durationMs, result };
	if (result === "painted") log.info(`renderer ${phase} frame visible`, data);
	else if (result === "skipped-hidden") log.info(`renderer ${phase} paint skipped while hidden`, data);
	else log.warn(`renderer ${phase} paint timed out`, data);
}

export interface AppLifecycleController {
	waitForRendererBootPaint(timeoutMs?: number): Promise<RendererPaintResult>;
	waitForRendererContentPaint(timeoutMs?: number): Promise<RendererPaintResult>;
	markReady(): void;
}

export function registerAppLifecycleIpc(
	options: { onPhase?: (phase: RendererStartupPhase) => void } = {},
): AppLifecycleController {
	let isReady = false;
	let bootResult: RendererPaintResult | undefined;
	let contentResult: RendererPaintResult | undefined;
	let resolveReady: (() => void) | undefined;
	let resolveRendererBootPainted: ((result: RendererPaintResult) => void) | undefined;
	let resolveRendererContentPainted: ((result: RendererPaintResult) => void) | undefined;

	const readyPromise = new Promise<void>((resolve) => {
		resolveReady = resolve;
	});
	const rendererBootPaintedPromise = new Promise<RendererPaintResult>((resolve) => {
		resolveRendererBootPainted = resolve;
	});
	const rendererContentPaintedPromise = new Promise<RendererPaintResult>((resolve) => {
		resolveRendererContentPainted = resolve;
	});

	const parseResult = (value: unknown): RendererPaintResult | undefined =>
		value === undefined
			? "painted"
			: value === "painted" || value === "skipped-hidden" || value === "timeout"
				? value
				: undefined;
	const handleRendererBootPainted = (_event: unknown, value?: unknown): void => {
		const result = parseResult(value);
		if (bootResult !== undefined || result === undefined) return;
		bootResult = result;
		resolveRendererBootPainted?.(result);
	};
	const handleRendererContentPainted = (_event: unknown, value?: unknown): void => {
		const result = parseResult(value);
		if (contentResult !== undefined || result === undefined) return;
		contentResult = result;
		resolveRendererContentPainted?.(result);
	};

	ipcMain.on(APP_LIFECYCLE_RENDERER_BOOT_PAINTED_CHANNEL, handleRendererBootPainted);
	ipcMain.on(APP_LIFECYCLE_RENDERER_CONTENT_PAINTED_CHANNEL, handleRendererContentPainted);
	ipcMain.on(APP_LIFECYCLE_RENDERER_STARTUP_PHASE_CHANNEL, (_event, phase: unknown) => {
		if (phase !== "app-ready" && phase !== "renderer-module-loaded" && phase !== "route-content-committed") return;
		try {
			options.onPhase?.(phase);
		} catch {
			/* Observation must not gate startup. */
		}
	});
	ipcMain.handle(APP_LIFECYCLE_WHEN_READY_CHANNEL, async () => {
		await readyPromise;
	});

	return {
		waitForRendererBootPaint(timeoutMs = DEFAULT_BOOT_PAINT_TIMEOUT_MS) {
			return waitForPaint(() => bootResult, rendererBootPaintedPromise, timeoutMs);
		},
		waitForRendererContentPaint(timeoutMs = DEFAULT_BOOT_PAINT_TIMEOUT_MS) {
			return waitForPaint(() => contentResult, rendererContentPaintedPromise, timeoutMs);
		},
		markReady() {
			if (isReady) return;
			isReady = true;
			resolveReady?.();
		},
	};
}
