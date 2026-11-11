// Copyright The Open Forge contributors.

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
	let hidden = false;
	const calls: ComputerBackendCommand[] = [];
	const backend: ComputerBackend = {
		invoke: vi.fn(async (command: ComputerBackendCommand): Promise<ComputerBackendResult> => {
			calls.push(command);
			if (command.op === "windows" || command.op === "related")
				return { ok: true, windows: [{ ...target, hidden }] };
			if (command.op === "hide") hidden = true;
			if (command.op === "restore") hidden = false;
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
			yield: vi.fn(() => () => {}),
		},
		validateSession: async (id) => id === "session-1" || id === "session-2",
	});
	const execute = (input: ComputerUseInput, sessionId = "session-1", signal = new AbortController().signal) =>
		service.execute({ input, sessionId }, signal);
	const grant = (permission: "observe" | "background" | "foreground" = "background", sessionId = "session-1") =>
		service.control({ action: "grant", sessionId, targetId: target.id, permission });
	return { service, backend, calls, execute, grant, saved: () => saved };
}

describe("computer use user workflow", () => {
	it("enables, selects a session/window, observes, grants input, hides/restores and stops", async () => {
		const f = fixture();
		expect((await f.service.state()).enabled).toBe(false);
		expect((await f.execute({ action: "observe" })).isError).toBe(true);
		await f.service.control({ action: "enable", enabled: true });
		expect((await f.grant("observe")).phase).toBe("ready");
		const observed = await f.execute({ action: "observe", screenshot: true });
		expect(observed.content).toContainEqual({ type: "image", data: "cG5n", mimeType: "image/png" });
		expect((await f.execute({ action: "fill", element: "ref-1", text: "hello" })).isError).toBe(true);
		await f.grant();
		expect((await f.execute({ action: "fill", element: "ref-1", text: "hello" })).isError).not.toBe(true);
		await f.service.control({ action: "hide-target" });
		expect((await f.service.state()).target?.hidden).toBe(true);
		expect(f.saved()[0]?.showCommand).toBe(3);
		await f.service.control({ action: "restore", targetId: target.id });
		expect((await f.service.state()).sessionId).toBe("session-1");
		expect((await f.service.state()).target?.hidden).toBe(false);
		await f.service.control({ action: "stop" });
		expect((await f.service.state()).sessionId).toBeUndefined();
		expect(f.saved()).toEqual([]);
		expect(f.backend.dispose).toHaveBeenCalledOnce();
	});

	it("never silently sends physical input in background or to a hidden target", async () => {
		const f = fixture();
		await f.service.control({ action: "enable", enabled: true });
		await f.grant();
		expect((await f.execute({ action: "press", keys: "enter" })).isError).toBe(true);
		expect((await f.service.state()).phase).toBe("needs-foreground");
		expect(f.calls.some((c) => c.op === "execute")).toBe(false);
		await f.grant("foreground");
		await f.service.control({ action: "hide-target" });
		expect((await f.execute({ action: "press", keys: "enter" })).isError).toBe(true);
		expect(f.calls.some((c) => c.op === "execute")).toBe(false);
	});

	it("rejects other sessions, invalid sessions and competing ownership", async () => {
		const f = fixture();
		await f.service.control({ action: "enable", enabled: true });
		await f.grant();
		expect((await f.execute({ action: "observe" }, "session-2")).isError).toBe(true);
		expect((await f.grant("background", "session-2")).issue).toBe("desktop_owned");
		await f.service.control({ action: "stop" });
		expect((await f.grant("background", "invented-session")).issue).toBe("invalid_session");
	});

	it("waits for actual cancellation acknowledgement before stopping and restoring", async () => {
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
		const stop = f.service.control({ action: "stop" }).then(() => {
			stopped = true;
		});
		await Promise.resolve();
		expect(stopped).toBe(false);
		expect((await f.service.state()).phase).toBe("stopping");
		expect((await f.execute({ action: "observe" })).isError).toBe(true);
		complete();
		await stop;
		expect((await operation).isError).toBe(true);
		expect((await f.service.state()).phase).toBe("idle");
	});

	it("a stop invalidates an earlier queued grant", async () => {
		const f = fixture();
		await f.service.control({ action: "enable", enabled: true });
		const queued = f.grant();
		const stop = f.service.control({ action: "stop" });
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

	it("hiding after user takeover does not resume AI execution", async () => {
		const f = fixture();
		await f.service.control({ action: "enable", enabled: true });
		await f.grant();
		await f.service.control({ action: "takeover" });
		await f.service.control({ action: "hide-target" });
		expect((await f.service.state()).phase).toBe("user");
		expect((await f.execute({ action: "observe" })).isError).toBe(true);
	});

	it("an unconfirmed stop blocks new grants until the backend acknowledges stopping", async () => {
		const f = fixture();
		await f.service.control({ action: "enable", enabled: true });
		await f.grant();
		vi.mocked(f.backend.invoke).mockRejectedValueOnce(new Error("process failure"));
		vi.mocked(f.backend.interrupt).mockRejectedValue(new Error("stop_failed"));
		expect((await f.execute({ action: "observe" })).isError).toBe(true);
		expect((await f.grant()).phase).toBe("error");
		expect((await f.execute({ action: "observe" })).isError).toBe(true);
		vi.mocked(f.backend.interrupt).mockResolvedValue(undefined);
		expect((await f.service.control({ action: "stop" })).phase).toBe("idle");
	});

	it("retains the recovery record if hiding or restoring fails", async () => {
		const f = fixture();
		await f.service.control({ action: "enable", enabled: true });
		await f.grant();
		vi.mocked(f.backend.invoke)
			.mockResolvedValueOnce({ ok: true, windows: [target] })
			.mockResolvedValueOnce({ ok: false, code: "backend_failed" });
		await f.service.control({ action: "hide-target" });
		expect(f.saved()).toEqual([target]);
		vi.mocked(f.backend.invoke).mockResolvedValueOnce({ ok: false, code: "restore_failed" });
		await f.service.control({ action: "restore-all" });
		expect(f.saved()).toEqual([target]);
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
		await f.grant("foreground");
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

	it("restoring then regranting uses the restored visibility", async () => {
		const f = fixture();
		await f.service.control({ action: "enable", enabled: true });
		await f.grant("foreground");
		await f.service.control({ action: "hide-target" });
		await f.service.control({ action: "restore", targetId: target.id });
		const granted = await f.grant("foreground");
		expect(granted.target?.hidden).toBe(false);
		expect((await f.execute({ action: "press", keys: "enter" })).isError).not.toBe(true);
	});

	it("stop can recover previous-run hidden windows while the feature remains off", async () => {
		const f = fixture({ saved: [target] });
		const stopped = await f.service.control({ action: "stop" });
		expect(stopped.hiddenWindows).toEqual([]);
		expect(stopped.enabled).toBe(false);
		expect(stopped.phase).toBe("disabled");
	});

	it("explicit takeover invalidates backend observation even between tool calls", async () => {
		const f = fixture();
		await f.service.control({ action: "enable", enabled: true });
		await f.grant();
		vi.mocked(f.backend.interrupt).mockClear();
		await f.service.control({ action: "takeover" });
		expect(f.backend.interrupt).toHaveBeenCalledOnce();
		expect((await f.service.state()).phase).toBe("user");
	});

	it("does not load the backend on unsupported platforms", async () => {
		const f = fixture({ supported: false });
		expect((await f.service.control({ action: "enable", enabled: true })).issue).toBe("unsupported_platform");
		expect(f.calls).toEqual([]);
	});
});
