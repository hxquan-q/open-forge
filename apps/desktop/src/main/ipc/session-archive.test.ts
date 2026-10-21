// Copyright The Open Forge contributors.
import { describe, expect, it, vi } from "vitest";

const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock("electron", () => ({
	ipcMain: {
		handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
			handlers.set(channel, handler);
		},
	},
}));

vi.mock("../conversations/session-archive-service.js", () => ({
	SESSION_ARCHIVE_EXTENSION: "ofar",
	exportSessionArchiveWithDialog: vi.fn(async () => ({ saved: false })),
	exportProjectSessionsArchiveWithDialog: vi.fn(async () => ({ saved: true, path: "/out/p.ofar", sessionCount: 2 })),
	importSessionArchiveWithDialog: vi.fn(async () => ({ canceled: true, decisions: [] })),
	fingerprintConversationFile: vi.fn(async () => "fp"),
}));

const listSessionHistory = vi.fn(async (_cwd: string) => [{ path: "C:/s/a.jsonl" }, { path: "C:/s/b.jsonl" }]);

vi.mock("../conversations/session-query-service.js", () => ({
	listSessionHistory: (cwd: string) => listSessionHistory(cwd),
}));

const { SESSION_ARCHIVE_CHANNELS, registerSessionArchiveIpc } = await import("./session-archive.js");
const { exportProjectSessionsArchiveWithDialog, exportSessionArchiveWithDialog } = await import(
	"../conversations/session-archive-service.js"
);

function handler(channel: string): (...args: unknown[]) => unknown {
	const registered = handlers.get(channel);
	expect(registered).toBeTypeOf("function");
	return registered as (...args: unknown[]) => unknown;
}

describe("session archive IPC", () => {
	it("registers export, export-project and import channels", () => {
		registerSessionArchiveIpc();
		expect(handlers.has(SESSION_ARCHIVE_CHANNELS.EXPORT)).toBe(true);
		expect(handlers.has(SESSION_ARCHIVE_CHANNELS.EXPORT_PROJECT)).toBe(true);
		expect(handlers.has(SESSION_ARCHIVE_CHANNELS.IMPORT)).toBe(true);
	});

	it("bundles every session the project lists into one archive export", async () => {
		listSessionHistory.mockResolvedValueOnce([{ path: "C:/s/a.jsonl" }, { path: "C:/s/b.jsonl" }]);
		const result = await handler(SESSION_ARCHIVE_CHANNELS.EXPORT_PROJECT)(null, {
			cwd: "C:/repo",
			passphrase: "pw",
			defaultFileName: "my-repo",
		});
		expect(result).toEqual({ saved: true, path: "/out/p.ofar", sessionCount: 2 });
		expect(listSessionHistory).toHaveBeenCalledWith("C:/repo");
		expect(exportProjectSessionsArchiveWithDialog).toHaveBeenCalledWith({
			sessionPaths: ["C:/s/a.jsonl", "C:/s/b.jsonl"],
			passphrase: "pw",
			defaultFileName: "my-repo",
		});
	});

	it("answers no-sessions without touching the export service", async () => {
		vi.mocked(exportProjectSessionsArchiveWithDialog).mockClear();
		listSessionHistory.mockResolvedValueOnce([]);
		const result = await handler(SESSION_ARCHIVE_CHANNELS.EXPORT_PROJECT)(null, { cwd: "C:/empty" });
		expect(result).toEqual({ saved: false, reason: "no-sessions" });
		expect(exportProjectSessionsArchiveWithDialog).not.toHaveBeenCalled();
	});

	it("rejects a missing or blank cwd and still guards the single-session export input", async () => {
		await expect(handler(SESSION_ARCHIVE_CHANNELS.EXPORT_PROJECT)(null, {})).rejects.toThrow(/cwd is required/);
		await expect(handler(SESSION_ARCHIVE_CHANNELS.EXPORT_PROJECT)(null, { cwd: "   " })).rejects.toThrow(
			/cwd is required/,
		);
		await expect(handler(SESSION_ARCHIVE_CHANNELS.EXPORT)(null, {})).rejects.toThrow(/sessionPath is required/);
	});

	it("keeps forwarding the single-session export contract unchanged", async () => {
		await handler(SESSION_ARCHIVE_CHANNELS.EXPORT)(null, {
			sessionPath: "C:/s/a.jsonl",
			passphrase: "pw",
			defaultFileName: "a",
		});
		expect(exportSessionArchiveWithDialog).toHaveBeenCalledWith({
			sessionPath: "C:/s/a.jsonl",
			passphrase: "pw",
			defaultFileName: "a",
		});
	});
});
