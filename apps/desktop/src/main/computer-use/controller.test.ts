// Copyright The Open Forge contributors.
// Modified by The Open Forge contributors.

import type { ComputerUseInput } from "@vetta/coding-agent/function-extensions";
import { describe, expect, it, vi } from "vitest";
import type { ComputerWindow } from "../../shared/computer-use.js";
import type { ComputerBackend, ComputerBackendCommand, ComputerBackendResult } from "./contracts.js";
import { ComputerUseController } from "./controller.js";

const target: ComputerWindow = {
	id: "window-1",
	hwnd: "123",
	pid: 77,
	started: "123456",
	instance: "42",
	className: "Editor",
	exe: "C:/editor.exe",
	title: "Example document",
	hidden: false,
	showCommand: 3,
};
function fixture(options: { supported?: boolean; saved?: readonly ComputerWindow[] } = {}) {
	let saved = [...(options.saved ?? [])];
	const calls: ComputerBackendCommand[] = [];
	const backend: ComputerBackend = {
		invoke: vi.fn(async (command: ComputerBackendCommand): Promise<ComputerBackendResult> => {
			calls.push(command);
			return {
				ok: true,
				text: "Changed document",
				...(command.op === "execute" && command.input.action === "observe"
					? { image: { data: "cG5n", mimeType: "image/png" as const } }
					: {}),
			};
		}),
		interrupt: vi.fn(async () => {}),
		dispose: vi.fn(async () => {}),
	};
	let display = { hidden: false, topmost: false };
	const yields = vi.fn(() => () => {});
	const excludes = vi.fn(() => () => {});
	const service = new ComputerUseController({
		supported: options.supported ?? true,
		backend,
		ledger: {
			load: async () => saved,
			save: async (windows) => {
				saved = [...windows];
			},
		},
		display: {
			read: () => display,
			update: (patch) => {
				display = { ...display, ...patch };
			},
			yield: yields,
			exclude: excludes,
		},
		validateSession: async (id) => id === "session-1" || id === "session-2",
	});
	const execute = (input: ComputerUseInput, sessionId = "session-1", signal = new AbortController().signal) =>
		service.execute({ input, sessionId }, signal);
	const grant = (sessionId = "session-1") => service.control({ action: "grant", sessionId });
	return { service, backend, calls, execute, grant, saved: () => saved, yields, excludes };
}

describe("computer use user workflow", () => {
	it("enables, authorizes a session and opens an app through global desktop input", async () => {
		const f = fixture();
		expect((await f.service.state()).enabled).toBe(false);
		expect((await f.execute({ action: "observe" })).isError).toBe(true);
		await f.service.control({ action: "enable", enabled: true });
		expect((await f.grant()).phase).toBe("ready");
		const observed = await f.execute({ action: "observe" });
		expect(observed.content).toContainEqual({ type: "image", data: "cG5n", mimeType: "image/png" });
		await f.execute({ action: "press", keys: "win+r" });
		await f.execute({ action: "type", text: "wsl.exe" });
		await f.execute({ action: "press", keys: "enter" });
		await f.execute({ action: "observe" });
		await f.execute({ action: "type", text: 'cd Vetta && claude "你好"' });
		const actions = f.calls.flatMap((command) => (command.op === "execute" ? [command.input.action] : []));
		expect(actions).toEqual(["observe", "press", "type", "press", "observe", "type"]);
		await f.service.control({ action: "pause" });
		expect((await f.execute({ action: "press", keys: "enter" })).isError).toBe(true);
		expect((await f.execute({ action: "observe" })).isError).toBe(true);
		await f.service.control({ action: "resume" });
		expect((await f.execute({ action: "press", keys: "enter" })).isError).not.toBe(true);
		await f.service.control({ action: "stop" });
		expect((await f.service.state()).sessionId).toBeUndefined();
		expect(f.backend.dispose).toHaveBeenCalledOnce();
	});

	it.each(["restore", "dispose", "interrupt"] as const)("disabling fails closed on %s failure", async (step) => {
		const f = fixture({ saved: [target] });
		await f.service.control({ action: "enable", enabled: true });
		await f.grant();
		const issue = step === "restore" ? "restore_failed" : step === "dispose" ? "dispose_failed" : "stop_failed";
		if (step === "restore") vi.mocked(f.backend.invoke).mockRejectedValueOnce(new Error(issue));
		else vi.mocked(f.backend[step]).mockRejectedValueOnce(new Error(issue));

		const disabled = await f.service.control({ action: "enable", enabled: false });
		expect(disabled.enabled).toBe(false);
		expect(disabled.sessionId).toBeUndefined();
		expect(disabled.phase).toBe("disabled");
		expect(disabled.issue).toBe(issue);
		expect(f.saved()).toEqual(step === "dispose" ? [] : [target]);
		if (step !== "interrupt") expect(f.backend.dispose).toHaveBeenCalledOnce();

		const callsAfterDisable = [...f.calls];
		for (const command of [
			{ action: "grant", sessionId: "session-1" },
			{ action: "resume" },
			{ action: "enable", enabled: true },
			{ action: "grant", sessionId: "session-2" },
		] as const) {
			const state = await f.service.control(command);
			expect(state.enabled).toBe(false);
			expect(state.sessionId).toBeUndefined();
			expect(state.phase).not.toBe("ready");
			for (const sessionId of ["session-1", "session-2"]) {
				expect((await f.execute({ action: "observe" }, sessionId)).isError).toBe(true);
				expect((await f.execute({ action: "press", keys: "enter" }, sessionId)).isError).toBe(true);
			}
		}
		expect(f.calls).toEqual(callsAfterDisable);
	});

	it("disables successfully and requires a new grant after re-enabling", async () => {
		const f = fixture({ saved: [target] });
		await f.service.control({ action: "enable", enabled: true });
		await f.grant();
		const disabled = await f.service.control({ action: "enable", enabled: false });
		expect(disabled).toMatchObject({ enabled: false, phase: "disabled", hiddenWindows: [] });
		expect(disabled.sessionId).toBeUndefined();
		expect(disabled.issue).toBeUndefined();
		expect(f.saved()).toEqual([]);
		expect(f.backend.dispose).toHaveBeenCalledOnce();
		expect((await f.grant()).phase).not.toBe("ready");
		expect((await f.execute({ action: "observe" })).isError).toBe(true);
		const enabled = await f.service.control({ action: "enable", enabled: true });
		expect(enabled.phase).toBe("idle");
		expect(enabled.sessionId).toBeUndefined();
		expect((await f.execute({ action: "observe" })).isError).toBe(true);
		expect((await f.grant()).phase).toBe("ready");
		expect((await f.execute({ action: "observe" })).isError).not.toBe(true);
	});

	it("a grant cannot clear an error state even when the backend can acknowledge stopping", async () => {
		const f = fixture();
		await f.service.control({ action: "enable", enabled: true });
		expect((await f.grant("invalid-session")).phase).toBe("error");
		expect((await f.grant()).phase).toBe("error");
		expect((await f.service.state()).sessionId).toBeUndefined();
		expect((await f.execute({ action: "observe" })).isError).toBe(true);
	});

	it("operates globally without a selected window or permission tier", async () => {
		const f = fixture();
		await f.service.control({ action: "enable", enabled: true });
		await f.grant();
		for (const input of [
			{ action: "press", keys: "win+r" },
			{ action: "type", text: "wsl.exe" },
			{ action: "click", revision: "screen-1", x: 12, y: 24 },
			{ action: "scroll", revision: "screen-1", x: 12, y: 24, amount: 1 },
		] as const) {
			expect((await f.execute(input)).isError).not.toBe(true);
		}
		const executeCommands = f.calls.filter((command) => command.op === "execute");
		expect(executeCommands.map((command) => command.input.action)).toEqual(["press", "type", "click", "scroll"]);
		expect(executeCommands.every((command) => !("target" in command))).toBe(true);
	});

	it("rejects other sessions, invalid sessions and competing ownership", async () => {
		const f = fixture();
		await f.service.control({ action: "enable", enabled: true });
		await f.grant();
		expect((await f.execute({ action: "observe" }, "session-2")).isError).toBe(true);
		expect((await f.grant("session-2")).issue).toBe("desktop_owned");
		await f.service.control({ action: "stop" });
		expect((await f.grant("invented-session")).issue).toBe("invalid_session");
	});

	it("keeps the observed surface and the physical input surface identical", async () => {
		const f = fixture();
		await f.service.control({ action: "enable", enabled: true });
		await f.grant();
		await f.execute({ action: "observe" });
		expect(f.excludes).toHaveBeenCalledOnce();
		expect(f.yields).not.toHaveBeenCalled();
		await f.execute({ action: "press", keys: "enter" });
		expect(f.yields).toHaveBeenCalledOnce();
		await f.execute({ action: "click", revision: "screen-1", x: 12, y: 24 });
		expect(f.yields).toHaveBeenCalledTimes(2);
		expect(f.excludes).toHaveBeenCalledOnce();
	});

	it("an action failure keeps the session operable so the model can recover by observing", async () => {
		const f = fixture();
		await f.service.control({ action: "enable", enabled: true });
		await f.grant();
		await f.execute({ action: "observe" });
		for (const code of ["stale_reference", "invalid_input", "backend_failed"] as const) {
			vi.mocked(f.backend.invoke).mockResolvedValueOnce({ ok: false, code });
			expect((await f.execute({ action: "click", revision: "outdated", x: 1, y: 1 })).isError).toBe(true);
			expect((await f.service.state()).phase).toBe("ready");
			expect((await f.service.state()).issue).toBe(code);
			expect((await f.execute({ action: "observe" })).isError).not.toBe(true);
			expect((await f.service.state()).issue).toBeUndefined();
		}
	});

	it("a transport failure with a confirmed stop receipt still lets the model continue", async () => {
		const f = fixture();
		await f.service.control({ action: "enable", enabled: true });
		await f.grant();
		await f.execute({ action: "observe" });
		vi.mocked(f.backend.invoke).mockRejectedValueOnce(new Error("protocol"));
		expect((await f.execute({ action: "press", keys: "enter" })).isError).toBe(true);
		expect((await f.service.state()).phase).toBe("ready");
		expect((await f.execute({ action: "observe" })).isError).not.toBe(true);
	});

	it("an agent-side cancellation returns the session to ready without a human resume", async () => {
		const f = fixture();
		await f.service.control({ action: "enable", enabled: true });
		await f.grant();
		let started!: () => void;
		const entered = new Promise<void>((resolve) => {
			started = resolve;
		});
		vi.mocked(f.backend.invoke).mockImplementationOnce(async (_command, signal) => {
			started();
			await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve(), { once: true }));
			throw new DOMException("cancelled", "AbortError");
		});
		const agent = new AbortController();
		const operation = f.execute({ action: "observe" }, "session-1", agent.signal);
		await entered;
		agent.abort();
		expect((await operation).isError).toBe(true);
		expect((await f.service.state()).phase).toBe("ready");
		expect((await f.execute({ action: "observe" })).isError).not.toBe(true);
	});

	it.each(["stop", "disable"] as const)("%s waits for cancellation acknowledgement", async (action) => {
		const f = fixture();
		await f.service.control({ action: "enable", enabled: true });
		await f.grant();
		let complete!: () => void;
		const acknowledged = new Promise<void>((resolve) => {
			complete = resolve;
		});
		let started!: () => void;
		const entered = new Promise<void>((resolve) => {
			started = resolve;
		});
		vi.mocked(f.backend.invoke).mockImplementationOnce(async (_command, signal) => {
			started();
			await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve(), { once: true }));
			await acknowledged;
			throw new DOMException("cancelled", "AbortError");
		});
		const operation = f.execute({ action: "observe" });
		await entered;
		let stopped = false;
		const stop = f.service
			.control(action === "stop" ? { action: "stop" } : { action: "enable", enabled: false })
			.then(() => {
				stopped = true;
			});
		await Promise.resolve();
		expect(stopped).toBe(false);
		expect((await f.service.state()).phase).toBe("stopping");
		expect((await f.execute({ action: "observe" })).isError).toBe(true);
		complete();
		await stop;
		expect((await operation).isError).toBe(true);
		expect((await f.service.state()).phase).toBe(action === "stop" ? "idle" : "disabled");
		expect((await f.service.state()).sessionId).toBeUndefined();
		expect(f.backend.dispose).toHaveBeenCalledOnce();
	});

	it.each(["stop", "disable"] as const)("%s invalidates an earlier queued grant", async (action) => {
		const f = fixture();
		await f.service.control({ action: "enable", enabled: true });
		const queued = f.grant();
		const stop = f.service.control(action === "stop" ? { action: "stop" } : { action: "enable", enabled: false });
		await Promise.all([queued, stop]);
		expect((await f.service.state()).sessionId).toBeUndefined();
	});

	it("recovers persisted windows without granting access or changing Vetta visibility", async () => {
		const f = fixture({ saved: [target] });
		expect((await f.service.state()).hiddenWindows).toHaveLength(1);
		await f.service.control({ action: "display", hidden: true, topmost: true });
		expect((await f.service.state()).vettaHidden).toBe(true);
		await f.service.control({ action: "restore-all" });
		expect(f.saved()).toEqual([]);
		expect((await f.service.state()).enabled).toBe(false);
		expect((await f.service.state()).vettaHidden).toBe(true);
	});

	it("an unconfirmed stop blocks new grants until the backend acknowledges stopping", async () => {
		const f = fixture();
		await f.service.control({ action: "enable", enabled: true });
		await f.grant();
		vi.mocked(f.backend.invoke).mockRejectedValueOnce(new Error("process failure"));
		vi.mocked(f.backend.interrupt).mockRejectedValue(new Error("stop_failed"));
		expect((await f.execute({ action: "observe" })).isError).toBe(true);
		vi.mocked(f.backend.interrupt).mockResolvedValue(undefined);
		expect((await f.grant()).phase).toBe("error");
		expect((await f.execute({ action: "observe" })).isError).toBe(true);
		expect((await f.service.control({ action: "stop" })).phase).toBe("idle");
	});

	it("retains legacy hidden-window recovery records until restoration succeeds", async () => {
		const f = fixture({ saved: [target] });
		vi.mocked(f.backend.invoke).mockResolvedValueOnce({ ok: false, code: "restore_failed" });
		await f.service.control({ action: "restore-all" });
		expect(f.saved()).toEqual([target]);
		vi.mocked(f.backend.invoke).mockResolvedValueOnce({ ok: true });
		await f.service.control({ action: "restore-all" });
		expect(f.saved()).toEqual([]);
	});

	it("enable and resume cannot bypass an unconfirmed stop", async () => {
		const f = fixture();
		await f.service.control({ action: "enable", enabled: true });
		await f.grant();
		vi.mocked(f.backend.invoke).mockRejectedValueOnce(new Error("failed"));
		vi.mocked(f.backend.interrupt).mockRejectedValue(new Error("stop_failed"));
		await f.execute({ action: "observe" });
		await f.service.control({ action: "enable", enabled: true });
		await f.service.control({ action: "resume" });
		expect((await f.execute({ action: "observe" })).isError).toBe(true);
	});

	it("normal completion after cancellation still requires an input-release acknowledgement", async () => {
		const f = fixture();
		await f.service.control({ action: "enable", enabled: true });
		await f.grant();
		let entered!: () => void;
		const started = new Promise<void>((resolve) => {
			entered = resolve;
		});
		vi.mocked(f.backend.invoke).mockImplementationOnce(async (_command, signal) => {
			entered();
			await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve(), { once: true }));
			return { ok: true };
		});
		vi.mocked(f.backend.interrupt).mockRejectedValue(new Error("stop_failed"));
		const action = f.execute({ action: "press", keys: "enter" });
		await started;
		const paused = await f.service.control({ action: "pause" });
		await action;
		expect(paused.phase).toBe("error");
		expect(paused.issue).toBe("stop_failed");
	});

	it("stop can recover previous-run hidden windows while the feature remains off", async () => {
		const f = fixture({ saved: [target] });
		const stopped = await f.service.control({ action: "stop" });
		expect(stopped.hiddenWindows).toEqual([]);
		expect(stopped.enabled).toBe(false);
		expect(stopped.phase).toBe("disabled");
	});

	it("does not load the backend on unsupported platforms", async () => {
		const f = fixture({ supported: false });
		expect((await f.service.control({ action: "enable", enabled: true })).issue).toBe("unsupported_platform");
		expect(f.calls).toEqual([]);
	});
});
