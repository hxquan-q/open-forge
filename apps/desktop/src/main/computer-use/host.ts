// Copyright The Open Forge contributors.

import { release } from "node:os";
import { join } from "node:path";
import { getVettaHomePath } from "@vetta/action-rpc";
import type { ComputerUseRequest } from "@vetta/coding-agent/function-extensions";
import { type Disposable, DisposableStore, MutableDisposable, toDisposable } from "@vetta/toolkit";
import { app, BrowserWindow } from "electron";
import { COMPUTER_USE_CHANNELS, type ComputerControl, type ComputerUseState } from "../../shared/computer-use.js";
import { getApplicationCacheService } from "../cache/application-cache-service.js";
import { getAppLogger } from "../logger.js";
import { peekSharedRuntime } from "../runtime.js";
import { getTray, setComputerUseTrayActions } from "../tray-manager.js";
import { getMainWindow, showMainWindow } from "../window-manager.js";
import { resolveComputerUseBackendRoot } from "./backend-root.js";
import { BundledComputerBackend, verifyBackendResources } from "./bundled-backend.js";
import { ComputerUseController } from "./controller.js";
import { ComputerWindowDisplay, captureExclusionSupported } from "./display.js";
import { createHiddenWindowLedger } from "./hidden-window-ledger.js";
import { bindComputerUseShortcuts, computerUseShortcutsAvailable } from "./shortcuts.js";

const supported = process.platform === "win32" && process.arch === "x64";
const resources = new DisposableStore();
const shortcutBinding = resources.add(new MutableDisposable<Disposable>());
let shortcutActions: Parameters<typeof bindComputerUseShortcuts>[0] | undefined;
let closing = false;
let controller: ComputerUseController | undefined;
let initialized = false;

export function getComputerUseController(): ComputerUseController {
	if (controller) return controller;
	const cache = getApplicationCacheService().namespace("computer-use");
	const root = resolveComputerUseBackendRoot({
		isPackaged: app.isPackaged,
		resourcesPath: process.resourcesPath,
		cwd: process.cwd(),
	});
	controller = new ComputerUseController({
		supported,
		onChange: () => {
			void getComputerUseState()
				.then((state) => {
					const win = getMainWindow();
					if (win && !win.isDestroyed()) win.webContents.send(COMPUTER_USE_CHANNELS.changed, state);
				})
				.catch((error: unknown) => getAppLogger("computer-use").warn("state broadcast failed", error));
		},
		backend: new BundledComputerBackend({
			root,
			cache: cache.rootDir,
			verify: async () => {
				await cache.ensure();
				await verifyBackendResources(root);
			},
		}),
		ledger: createHiddenWindowLedger(join(getVettaHomePath(), "computer-use", "hidden-windows.json")),
		display: new ComputerWindowDisplay({
			main: getMainWindow,
			all: () => BrowserWindow.getAllWindows(),
			show: showMainWindow,
			canHide: () => Boolean(getTray()) || computerUseShortcutsAvailable(),
			canExclude: () => captureExclusionSupported(release()),
		}),
		validateSession: async (id) => {
			try {
				return Boolean(peekSharedRuntime()?.getSessionView(id));
			} catch {
				return false;
			}
		},
	});
	return controller;
}

export async function getComputerUseState(): Promise<ComputerUseState> {
	const state = await getComputerUseController().state();
	if (!closing && shortcutActions) {
		const needed = state.enabled || state.vettaHidden || state.hiddenWindows.length > 0;
		if (needed && !shortcutBinding.value)
			shortcutBinding.value = toDisposable(bindComputerUseShortcuts(shortcutActions));
		if (!needed) shortcutBinding.clear();
	}
	let sessionName: string | undefined;
	if (state.sessionId) {
		try {
			sessionName = peekSharedRuntime()?.readSessionName(state.sessionId);
		} catch {
			/* Recovery controls outlive sessions that have already closed. */
		}
	}
	return { ...state, sessionName, shortcutsAvailable: computerUseShortcutsAvailable() };
}

export async function controlComputerUse(command: ComputerControl): Promise<ComputerUseState> {
	await getComputerUseController().control(command);
	return getComputerUseState();
}

export function invokeComputerUse(request: ComputerUseRequest, signal: AbortSignal) {
	return getComputerUseController().execute(request, signal);
}

export function initializeComputerUseControls(): void {
	if (initialized || !supported) return;
	initialized = true;
	const act = (command: ComputerControl) => {
		void controlComputerUse(command)
			.then((state) => {
				if (state.issue) showMainWindow();
			})
			.catch((error: unknown) => {
				getAppLogger("computer-use").warn("control failed", error);
				showMainWindow();
			});
	};
	setComputerUseTrayActions({ stop: () => act({ action: "stop" }), restore: () => act({ action: "restore-all" }) });
	resources.add(toDisposable(() => setComputerUseTrayActions(undefined)));
	shortcutActions = {
		"computer-use-stop": () => act({ action: "stop" }),
		"computer-use-recall": () => act({ action: "display", hidden: false }),
	};
}

export async function disposeComputerUse(): Promise<void> {
	closing = true;
	resources.dispose();
	await controller?.dispose();
}
