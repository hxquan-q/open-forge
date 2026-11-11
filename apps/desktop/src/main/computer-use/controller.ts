// Copyright The Open Forge contributors.
import { Value } from "@sinclair/typebox/value";
import { type ComputerUseRequest, readComputerUseInput } from "@vetta/coding-agent/function-extensions";
import type { RuntimeToolResult } from "@vetta/runtime-core/kernel";
import type { ComputerControl, ComputerUseState } from "../../shared/computer-use.js";
import { ComputerControlSchema } from "../../shared/computer-use.js";
import type { ComputerBackend, ComputerDisplay, HiddenWindowLedger } from "./contracts.js";

function failure(code: string): RuntimeToolResult {
	return { isError: true, content: [{ type: "text", text: JSON.stringify({ ok: false, code }) }] };
}

export class ComputerUseController {
	private stateValue: ComputerUseState;
	private readonly initialized: Promise<void>;
	private controls: Promise<unknown> = Promise.resolve();
	private controlCount = 0;
	private epoch = 0;
	private disposed = false;
	private unsafe = false;
	private recoveryFailed = false;
	private shutdown?: Promise<void>;
	private active?: { controller: AbortController; settled: Promise<unknown> };

	constructor(
		private readonly options: {
			supported: boolean;
			backend: ComputerBackend;
			ledger: HiddenWindowLedger;
			display: ComputerDisplay;
			validateSession: (id: string) => Promise<boolean>;
			onChange?: () => void;
		},
	) {
		this.stateValue = {
			revision: 0,
			supported: options.supported,
			enabled: false,
			phase: "disabled",
			windows: [],
			hiddenWindows: [],
			vettaHidden: false,
			topmost: false,
		};
		this.initialized = options.ledger
			.load()
			.then((hiddenWindows) => {
				this.patch({ hiddenWindows });
			})
			.catch(() => {
				this.recoveryFailed = true;
				this.patch({ phase: "error", issue: "recovery_failed" });
			});
	}

	async state(): Promise<ComputerUseState> {
		await this.initialized;
		const display = this.options.display.read();
		return structuredClone({ ...this.stateValue, vettaHidden: display.hidden, topmost: display.topmost });
	}

	control(input: unknown): Promise<ComputerUseState> {
		if (!Value.Check(ComputerControlSchema, input)) return Promise.reject(new Error("invalid_input"));
		if (this.disposed) return Promise.reject(new Error("disposed"));
		const revokes =
			input.action === "pause" ||
			input.action === "takeover" ||
			input.action === "stop" ||
			input.action === "grant" ||
			(input.action === "enable" && !input.enabled);
		if (revokes) {
			this.epoch++;
			this.active?.controller.abort();
			if (this.active) this.patch({ phase: "stopping", issue: undefined });
		}
		const epoch = this.epoch;
		this.controlCount++;
		const operation = this.controls
			.then(async () => {
				await this.initialized;
				if (this.disposed) throw new Error("disposed");
				if (epoch !== this.epoch) return this.state();
				try {
					await this.apply(input);
				} catch (error) {
					this.patch({ phase: "error", issue: error instanceof Error ? error.message : "backend_failed" });
				}
				return this.state();
			})
			.finally(() => {
				this.controlCount--;
			});
		this.controls = operation.catch(() => undefined);
		return operation;
	}

	async execute(request: ComputerUseRequest, signal: AbortSignal): Promise<RuntimeToolResult> {
		await this.initialized;
		if (signal.aborted) return failure("cancelled");
		if (this.disposed || !this.stateValue.enabled) return failure("disabled");
		if (this.controlCount || this.active) return failure("busy");
		if (this.unsafe) return failure("stop_failed");
		const { target, sessionId, permission, phase } = this.stateValue;
		if (!target || sessionId !== request.sessionId || !permission) return failure("unauthorized");
		if (phase !== "ready") return failure(phase);
		const input = readComputerUseInput(request.input);
		if (input.action !== "observe" && permission === "observe") return failure("observation_only");
		const physical = input.action === "press" || input.action === "click" || input.action === "scroll";
		if (physical && (permission !== "foreground" || target.hidden)) {
			this.patch({ phase: "needs-foreground", issue: "needs_foreground" });
			return failure("needs_foreground");
		}
		const epoch = this.epoch;
		const controller = new AbortController();
		const abort = () => {
			controller.abort();
			if (this.active?.controller === controller) this.patch({ phase: "stopping", issue: undefined });
		};
		signal.addEventListener("abort", abort, { once: true });
		if (signal.aborted) controller.abort();
		this.patch({ phase: "running", issue: undefined });
		const operation = (async (): Promise<RuntimeToolResult> => {
			const restoreDisplay = physical ? this.options.display.yield() : () => {};
			try {
				controller.signal.throwIfAborted();
				if (target.hidden) await this.hideFamily(target, controller.signal);
				controller.signal.throwIfAborted();
				const result = await this.options.backend.invoke(
					{ op: "execute", target, input, foreground: physical, hiddenWindows: this.stateValue.hiddenWindows },
					controller.signal,
				);
				controller.signal.throwIfAborted();
				if (epoch !== this.epoch) throw new DOMException("Cancelled", "AbortError");
				if (!result.ok) {
					this.patch({
						phase:
							result.code === "needs_foreground"
								? "needs-foreground"
								: result.code === "user_takeover"
									? "user"
									: "paused",
						issue: result.code ?? "backend_failed",
					});
					return failure(result.code ?? "backend_failed");
				}
				this.patch({ phase: "ready" });
				return {
					content: [
						{ type: "text", text: result.text ?? "ok" },
						...(result.image
							? [{ type: "image" as const, data: result.image.data, mimeType: result.image.mimeType }]
							: []),
					],
				};
			} catch {
				try {
					await this.options.backend.interrupt();
				} catch {
					this.unsafe = true;
					this.patch({ phase: "error", issue: "stop_failed" });
					return failure("stop_failed");
				}
				this.patch({ phase: "paused", issue: controller.signal.aborted ? "cancelled" : "backend_failed" });
				return failure(controller.signal.aborted ? "cancelled" : "backend_failed");
			} finally {
				restoreDisplay();
				signal.removeEventListener("abort", abort);
			}
		})();
		this.active = { controller, settled: operation };
		try {
			return await operation;
		} finally {
			this.active = undefined;
		}
	}

	dispose(): Promise<void> {
		if (this.shutdown) return this.shutdown;
		this.disposed = true;
		this.epoch++;
		this.active?.controller.abort();
		this.shutdown = (async () => {
			await this.controls;
			await this.initialized;
			try {
				await this.quiesce();
				await this.restoreAll();
			} finally {
				await this.options.backend.dispose();
			}
		})();
		return this.shutdown;
	}

	private async apply(command: ComputerControl): Promise<void> {
		if (command.action === "display") {
			this.options.display.update(command);
			this.patch({});
			return;
		}
		if (!this.options.supported) throw new Error("unsupported_platform");
		if (this.recoveryFailed) throw new Error("recovery_failed");
		if (command.action === "stop") {
			await this.stop();
			return;
		}
		if (command.action === "enable") {
			if (command.enabled && this.stateValue.enabled) {
				if (this.unsafe) throw new Error("stop_failed");
				return;
			}
			if (!command.enabled) {
				await this.stop();
			}
			this.patch({ enabled: command.enabled, phase: command.enabled ? "idle" : "disabled", issue: undefined });
			if (command.enabled) await this.refresh();
			return;
		}
		if (command.action === "restore-all") {
			await this.quiesce();
			await this.restoreAll();
			return;
		}
		if (command.action === "restore") {
			await this.quiesce();
			await this.restore(command.targetId);
			return;
		}
		if (!this.stateValue.enabled) throw new Error("disabled");
		switch (command.action) {
			case "refresh":
				if (this.active) await this.quiesce();
				await this.refresh();
				break;
			case "grant": {
				await this.quiesce();
				if (!(await this.options.validateSession(command.sessionId))) throw new Error("invalid_session");
				const target = this.stateValue.windows.find((w) => w.id === command.targetId);
				if (!target) throw new Error("stale_target");
				if (this.stateValue.sessionId && this.stateValue.sessionId !== command.sessionId)
					throw new Error("desktop_owned");
				this.patch({
					sessionId: command.sessionId,
					target,
					permission: command.permission,
					phase: "ready",
					issue: undefined,
				});
				break;
			}
			case "pause":
			case "takeover":
				await this.quiesce();
				this.patch({ phase: command.action === "pause" ? "paused" : "user", issue: undefined });
				break;
			case "resume":
				if (!this.stateValue.target || !this.stateValue.sessionId) throw new Error("unauthorized");
				if (this.unsafe || this.stateValue.phase === "error") throw new Error("stop_failed");
				this.patch({ phase: "ready", issue: undefined });
				break;
			case "hide-target": {
				const phase = this.stateValue.phase === "running" ? "paused" : this.stateValue.phase;
				await this.quiesce();
				const target = this.stateValue.target;
				if (!target) throw new Error("stale_target");
				if (target.hidden) break;
				await this.hideFamily(target);
				this.patch({ target: { ...target, hidden: true }, phase });
				await this.refresh();
				break;
			}
		}
	}

	private async quiesce(): Promise<void> {
		if (this.active) {
			this.active.controller.abort();
			await this.active.settled;
			if (this.unsafe) throw new Error("stop_failed");
		}
		await this.options.backend.interrupt();
		this.unsafe = false;
	}
	private async stop(): Promise<void> {
		await this.quiesce();
		try {
			await this.restoreAll();
		} finally {
			await this.options.backend.dispose();
		}
		this.patch({
			sessionId: undefined,
			target: undefined,
			permission: undefined,
			phase: this.stateValue.enabled ? "idle" : "disabled",
			issue: undefined,
		});
	}
	private async refresh(): Promise<void> {
		const result = await this.options.backend.invoke({ op: "windows" });
		if (!result.ok || !result.windows) throw new Error(result.code ?? "backend_failed");
		const windows = new Map(this.stateValue.hiddenWindows.map((window) => [window.id, { ...window, hidden: true }]));
		for (const window of result.windows) windows.set(window.id, window);
		this.patch({
			windows: [...windows.values()],
			...(!this.stateValue.sessionId ? { phase: "idle" as const, issue: undefined } : {}),
		});
	}
	private async hideFamily(target: NonNullable<ComputerUseState["target"]>, signal?: AbortSignal): Promise<void> {
		const related = await this.options.backend.invoke({ op: "related", target }, signal);
		if (!related.ok || !related.windows) throw new Error(related.code ?? "backend_failed");
		const visible = related.windows.filter((window) => !window.hidden);
		const records = new Map(this.stateValue.hiddenWindows.map((window) => [window.id, window]));
		for (const window of visible) if (!records.has(window.id)) records.set(window.id, window);
		if (!visible.length) return;
		const hiddenWindows = [...records.values()];
		await this.options.ledger.save(hiddenWindows);
		this.patch({ hiddenWindows });
		for (const window of visible.reverse()) {
			signal?.throwIfAborted();
			const hidden = await this.options.backend.invoke({ op: "hide", target: window }, signal);
			if (!hidden.ok && hidden.code !== "stale_target") throw new Error(hidden.code ?? "backend_failed");
		}
	}
	private async restoreAll(): Promise<void> {
		let failed = false;
		for (const window of [...this.stateValue.hiddenWindows]) {
			try {
				await this.restore(window.id);
			} catch {
				failed = true;
			}
		}
		if (failed) throw new Error("restore_failed");
	}
	private async restore(id: string): Promise<void> {
		const window = this.stateValue.hiddenWindows.find((w) => w.id === id);
		if (!window) return;
		const result = await this.options.backend.invoke({ op: "restore", target: window });
		if (!result.ok && result.code !== "stale_target") throw new Error(result.code ?? "restore_failed");
		const hiddenWindows = this.stateValue.hiddenWindows.filter((w) => w.id !== id);
		await this.options.ledger.save(hiddenWindows);
		this.patch({
			hiddenWindows,
			windows: result.ok
				? this.stateValue.windows.map((w) => (w.id === id ? { ...w, hidden: false } : w))
				: this.stateValue.windows.filter((w) => w.id !== id),
			...(this.stateValue.target?.id === id
				? result.ok
					? { target: { ...window, hidden: false } }
					: {
							target: undefined,
							sessionId: undefined,
							permission: undefined,
							phase: this.stateValue.enabled ? ("idle" as const) : ("disabled" as const),
						}
				: {}),
		});
	}
	private patch(patch: Partial<ComputerUseState>): void {
		this.stateValue = { ...this.stateValue, ...patch, revision: this.stateValue.revision + 1 };
		this.options.onChange?.();
	}
}
