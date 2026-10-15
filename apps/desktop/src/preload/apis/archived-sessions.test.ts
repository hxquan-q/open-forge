// Copyright The Open Forge contributors.
import type { IpcRenderer } from "electron";
import { describe, expect, it, vi } from "vitest";
import { ARCHIVED_SESSIONS_CHANGED_CHANNEL } from "../../shared/archived-sessions.js";
import { createArchivedSessionsApi } from "./archived-sessions.js";

describe("archived sessions preload contract", () => {
	it("exposes list, archive, unarchive and forget on their own channels", async () => {
		const invoke = vi.fn(async () => undefined);
		const ipc = { invoke } as unknown as IpcRenderer;
		const archived = createArchivedSessionsApi(ipc).archivedSessions;

		await archived.list();
		await archived.archive({ path: "C:/sessions/a.jsonl", label: "修复登录", cwd: "C:/repo" });
		await archived.unarchive("C:/sessions/a.jsonl");
		await archived.forget(["C:/sessions/a.jsonl", "C:/sessions/b.jsonl"]);

		expect(invoke).toHaveBeenNthCalledWith(1, "vetta:archived-sessions:list");
		expect(invoke).toHaveBeenNthCalledWith(2, "vetta:archived-sessions:archive", {
			path: "C:/sessions/a.jsonl",
			label: "修复登录",
			cwd: "C:/repo",
		});
		expect(invoke).toHaveBeenNthCalledWith(3, "vetta:archived-sessions:unarchive", "C:/sessions/a.jsonl");
		expect(invoke).toHaveBeenNthCalledWith(4, "vetta:archived-sessions:forget", [
			"C:/sessions/a.jsonl",
			"C:/sessions/b.jsonl",
		]);
	});

	it("delivers every snapshot through the changed channel and detaches on unsubscribe", () => {
		const listeners = new Map<string, (event: unknown, snapshot: unknown) => void>();
		const on = vi.fn((channel: string, listener: (event: unknown, snapshot: unknown) => void) => {
			listeners.set(channel, listener);
		});
		const ipc = { invoke: vi.fn(), on, removeListener: vi.fn() } as unknown as IpcRenderer;
		const archived = createArchivedSessionsApi(ipc).archivedSessions;

		const handler = vi.fn();
		const unsubscribe = archived.onChanged(handler);
		const listener = listeners.get(ARCHIVED_SESSIONS_CHANGED_CHANNEL);
		expect(listener).toBeTypeOf("function");

		const snapshot = {
			sessions: [{ path: "C:/sessions/a.jsonl", label: "修复登录", cwd: "C:/repo", archivedAt: 1 }],
		};
		listener?.({}, snapshot);
		expect(handler).toHaveBeenCalledWith(snapshot);

		unsubscribe();
		expect(ipc.removeListener).toHaveBeenCalledWith(ARCHIVED_SESSIONS_CHANGED_CHANNEL, listener);
	});
});
