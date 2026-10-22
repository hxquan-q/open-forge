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

const exportMigration = vi.fn(async (_input: unknown) => ({ saved: true, sessionCount: 2, workspaceFileCount: 3 }));
const previewMigration = vi.fn(async (_passphrase: string) => ({ canceled: true }));
const applyMigration = vi.fn(async (_input: unknown) => ({
	sessions: [],
	workspace: { written: 0, skipped: 0, overwritten: 0, failed: [] },
}));

vi.mock("../conversations/project-migration-service.js", () => ({
	exportProjectMigrationArchive: (input: unknown) => exportMigration(input),
	previewProjectMigrationArchive: (passphrase: string) => previewMigration(passphrase),
	applyProjectMigrationArchive: (input: unknown) => applyMigration(input),
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

	it("registers the three project migration channels", () => {
		registerSessionArchiveIpc();
		expect(handlers.has(SESSION_ARCHIVE_CHANNELS.EXPORT_MIGRATION)).toBe(true);
		expect(handlers.has(SESSION_ARCHIVE_CHANNELS.PREVIEW_MIGRATION)).toBe(true);
		expect(handlers.has(SESSION_ARCHIVE_CHANNELS.APPLY_MIGRATION)).toBe(true);
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

describe("project migration IPC", () => {
	it("export-migration bundles listSessionHistory paths and defaults includeWorkspace to true", async () => {
		registerSessionArchiveIpc();
		listSessionHistory.mockResolvedValueOnce([{ path: "C:/s/a.jsonl" }, { path: "C:/s/b.jsonl" }]);
		const result = await handler(SESSION_ARCHIVE_CHANNELS.EXPORT_MIGRATION)(null, {
			cwd: "C:/repo",
			passphrase: "pw",
			defaultFileName: "repo",
		});
		expect(result).toEqual({ saved: true, sessionCount: 2, workspaceFileCount: 3 });
		expect(listSessionHistory).toHaveBeenCalledWith("C:/repo");
		expect(exportMigration).toHaveBeenCalledWith(
			expect.objectContaining({
				cwd: "C:/repo",
				passphrase: "pw",
				includeWorkspace: true,
				defaultFileName: "repo",
				listSessionPaths: expect.any(Function),
			}),
		);
		const call = vi.mocked(exportMigration).mock.calls[0]?.[0] as
			| {
					listSessionPaths: () => Promise<string[]>;
			  }
			| undefined;
		expect(await call?.listSessionPaths()).toEqual(["C:/s/a.jsonl", "C:/s/b.jsonl"]);
	});

	it("export-migration forwards an explicit includeWorkspace=false and rejects a missing cwd", async () => {
		registerSessionArchiveIpc();
		await handler(SESSION_ARCHIVE_CHANNELS.EXPORT_MIGRATION)(null, { cwd: "C:/repo", includeWorkspace: false });
		expect(exportMigration).toHaveBeenLastCalledWith(expect.objectContaining({ includeWorkspace: false }));
		await expect(handler(SESSION_ARCHIVE_CHANNELS.EXPORT_MIGRATION)(null, {})).rejects.toThrow(/cwd is required/);
	});

	it("preview-migration forwards the passphrase only", async () => {
		registerSessionArchiveIpc();
		await handler(SESSION_ARCHIVE_CHANNELS.PREVIEW_MIGRATION)(null, { passphrase: "pw" });
		expect(previewMigration).toHaveBeenCalledWith("pw");
	});

	it("apply-migration validates required fields and forwards options", async () => {
		registerSessionArchiveIpc();
		await handler(SESSION_ARCHIVE_CHANNELS.APPLY_MIGRATION)(null, {
			archivePath: "C:/pkg.ofar",
			passphrase: "pw",
			targetCwd: "C:/target",
			overwriteWorkspace: true,
		});
		expect(applyMigration).toHaveBeenCalledWith(
			expect.objectContaining({
				archivePath: "C:/pkg.ofar",
				passphrase: "pw",
				targetCwd: "C:/target",
				overwriteWorkspace: true,
				listKnownFingerprints: expect.any(Function),
			}),
		);
		await expect(handler(SESSION_ARCHIVE_CHANNELS.APPLY_MIGRATION)(null, { targetCwd: "C:/t" })).rejects.toThrow(
			/archivePath is required/,
		);
		await expect(
			handler(SESSION_ARCHIVE_CHANNELS.APPLY_MIGRATION)(null, { archivePath: "C:/pkg.ofar" }),
		).rejects.toThrow(/targetCwd is required/);
	});
});
