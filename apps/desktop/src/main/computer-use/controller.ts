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
		const { sessionId, phase } = this.stateValue;
		if (!sessionId || sessionId !== request.sessionId) return failure("unauthorized");
		if (phase !== "ready") return failure(phase);
		const input = readComputerUseInput(request.input);
		const physical = input.action !== "observe";
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
			// Observation excludes Vetta from capture and input yields it from the screen;
			// both must show the same surface or coordinates taken from a screenshot click somewhere else.
			const restoreDisplay = physical ? this.options.display.yield() : this.options.display.exclude();
			try {
				controller.signal.throwIfAborted();
				const result = await this.options.backend.invoke({ op: "execute", input }, controller.signal);
				controller.signal.throwIfAborted();
				if (epoch !== this.epoch) throw new DOMException("Cancelled", "AbortError");
				if (!result.ok) {
					// A structured failure proves the backend stayed responsive and released
					// held inputs, so the session stays operable: the model receives the code
					// and can observe again instead of waiting for a human resume.
					this.patch({ phase: "ready", issue: result.code ?? "backend_failed" });
					return failure(result.code ?? "backend_failed");
				}
				this.patch({ phase: "ready", issue: undefined });
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
				// The stop receipt confirms the backend released held inputs. A control
				// revoke (pause/stop/disable) settles the phase itself afterwards; otherwise
				// the model must stay able to observe and retry instead of being paused
				// until a human resume.
				if (epoch === this.epoch)
					this.patch({ phase: "ready", issue: controller.signal.aborted ? undefined : "backend_failed" });
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
			case "grant": {
				await this.quiesce();
				if (!(await this.options.validateSession(command.sessionId))) throw new Error("invalid_session");
				if (this.stateValue.sessionId && this.stateValue.sessionId !== command.sessionId)
					throw new Error("desktop_owned");
				this.patch({ sessionId: command.sessionId, phase: "ready", issue: undefined });
				break;
			}
			case "pause":
				await this.quiesce();
				this.patch({ phase: "paused", issue: undefined });
				break;
			case "resume":
				if (!this.stateValue.sessionId) throw new Error("unauthorized");
				if (this.unsafe || this.stateValue.phase === "error") throw new Error("stop_failed");
				this.patch({ phase: "ready", issue: undefined });
				break;
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
			phase: this.stateValue.enabled ? "idle" : "disabled",
			issue: undefined,
		});
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
		this.patch({ hiddenWindows });
	}
	private patch(patch: Partial<ComputerUseState>): void {
		this.stateValue = { ...this.stateValue, ...patch, revision: this.stateValue.revision + 1 };
		this.options.onChange?.();
	}
}
