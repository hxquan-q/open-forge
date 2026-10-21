import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codingAgentSessionShardPath } from "@vetta/coding-agent/bootstrap";
import { ENV_AGENT_DIR } from "@vetta/coding-agent/config";
import { decodeSessionArchive } from "@vetta/runtime-storage/conversation";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONVERSATION_CWD } from "../config/desktop-config-store.js";
import { onConversationListChanged } from "./conversation-list-events.js";
import { resolveSessionImportDir } from "./session-paths.js";

const openDialogResult = vi.fn(
	async (): Promise<{ canceled: boolean; filePaths: string[] }> => ({
		canceled: true,
		filePaths: [],
	}),
);
const saveDialogResult = vi.fn(
	async (): Promise<{ canceled: boolean; filePath?: string }> => ({
		canceled: true,
	}),
);

vi.mock("electron", () => ({
	app: { getVersion: () => "0.1.1" },
	dialog: {
		showSaveDialog: () => saveDialogResult(),
		showOpenDialog: () => openDialogResult(),
	},
}));

vi.mock("../i18n/index.js", () => ({
	mainT: (key: string) => key,
}));

vi.mock("../logger.js", () => ({
	getAppLogger: () => ({ warn: () => undefined, info: () => undefined }),
}));

const {
	exportProjectSessionsArchiveToBytes,
	exportProjectSessionsArchiveWithDialog,
	exportSessionArchiveToBytes,
	fingerprintConversationFile,
	importSessionArchiveFromBytes,
	importSessionArchiveWithDialog,
} = await import("./session-archive-service.js");

describe("desktop session archive service", () => {
	const roots: string[] = [];

	afterEach(async () => {
		await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
	});

	it("Given an exported session archive, When imported twice, Then the second import skips by fingerprint", async () => {
		const root = await mkdtemp(join(tmpdir(), "session-archive-svc-"));
		roots.push(root);
		const sessionPath = join(root, "demo.jsonl");
		const content = [
			JSON.stringify({
				type: "session",
				version: 3,
				id: "sess-1",
				timestamp: "2026-01-01T00:00:00.000Z",
				cwd: root,
			}),
			JSON.stringify({
				type: "message",
				id: "m1",
				parentId: null,
				timestamp: "2026-01-01T00:00:01.000Z",
				message: { role: "user", content: "hi", timestamp: "2026-01-01T00:00:01.000Z" },
			}),
		].join("\n");
		await writeFile(sessionPath, `${content}\n`, "utf8");

		const bytes = await exportSessionArchiveToBytes({
			sessionPath,
			passphrase: "pw",
			appVersion: "0.1.1",
		});
		const fingerprint = await fingerprintConversationFile(await readFile(sessionPath, "utf8"));

		const first = await importSessionArchiveFromBytes(bytes, "pw", {
			listKnownFingerprints: async () => new Map(),
			resolveImportDirectory: async () => root,
		});
		expect(first[0]?.conflict.action).toBe("create-copy");
		expect(first[0]?.writtenPath).toBeTruthy();

		const second = await importSessionArchiveFromBytes(bytes, "pw", {
			listKnownFingerprints: async () =>
				new Map([[fingerprint, { sessionPath: first[0]!.writtenPath!, mtimeMs: 1 }]]),
			resolveImportDirectory: async () => root,
		});
		expect(second[0]?.conflict.action).toBe("skip-idempotent");
		expect(second[0]?.writtenPath).toBe(first[0]?.writtenPath);
	});

	it("BUG-0032 回归：项目 cwd 的导入副本落在 coding-agent 分片目录", async () => {
		const agentDir = await mkdtemp(join(tmpdir(), "session-archive-agent-"));
		const projectCwd = await mkdtemp(join(tmpdir(), "session-archive-cwd-"));
		roots.push(agentDir, projectCwd);
		const previous = process.env[ENV_AGENT_DIR];
		process.env[ENV_AGENT_DIR] = agentDir;
		try {
			const sessionPath = join(projectCwd, "demo.jsonl");
			await writeFile(
				sessionPath,
				`${JSON.stringify({
					type: "session",
					version: 3,
					id: "sess-proj",
					timestamp: "2026-01-01T00:00:00.000Z",
					cwd: projectCwd,
				})}\n`,
				"utf8",
			);
			const bytes = await exportSessionArchiveToBytes({ sessionPath, passphrase: "", appVersion: "0.1.1" });

			const decisions = await importSessionArchiveFromBytes(bytes, "", {
				listKnownFingerprints: async () => new Map(),
				resolveImportDirectory: async (cwdHint) => resolveSessionImportDir(cwdHint),
			});

			const shard = codingAgentSessionShardPath(projectCwd, agentDir);
			expect(decisions[0]?.conflict.action).toBe("create-copy");
			expect(decisions[0]?.writtenPath).toBeTruthy();
			expect(decisions[0]!.writtenPath!.startsWith(shard)).toBe(true);
			const entries = await readdir(shard);
			expect(entries.some((name) => name.endsWith(".jsonl"))).toBe(true);
		} finally {
			if (previous === undefined) delete process.env[ENV_AGENT_DIR];
			else process.env[ENV_AGENT_DIR] = previous;
		}
	});

	it("BUG-0032 回归：完整导入链路（含打开对话框）把项目会话副本写进分片目录并可被指纹索引命中", async () => {
		const agentDir = await mkdtemp(join(tmpdir(), "session-archive-dlg-agent-"));
		const projectCwd = await mkdtemp(join(tmpdir(), "session-archive-dlg-cwd-"));
		const workDir = await mkdtemp(join(tmpdir(), "session-archive-dlg-work-"));
		roots.push(agentDir, projectCwd, workDir);
		const previous = process.env[ENV_AGENT_DIR];
		process.env[ENV_AGENT_DIR] = agentDir;
		try {
			const sessionPath = join(workDir, "demo.jsonl");
			await writeFile(
				sessionPath,
				`${JSON.stringify({
					type: "session",
					version: 3,
					id: "sess-dlg",
					timestamp: "2026-01-01T00:00:00.000Z",
					cwd: projectCwd,
				})}\n`,
				"utf8",
			);
			const bytes = await exportSessionArchiveToBytes({ sessionPath, passphrase: "pw", appVersion: "0.1.1" });
			const archivePath = join(workDir, "demo.ofar");
			await writeFile(archivePath, bytes);
			openDialogResult.mockResolvedValueOnce({ canceled: false, filePaths: [archivePath] });

			const result = await importSessionArchiveWithDialog("pw", {
				listKnownFingerprints: async () => new Map(),
				resolveImportDirectory: async (cwdHint) => resolveSessionImportDir(cwdHint),
			});

			expect(result.canceled).toBe(false);
			expect(result.decisions[0]?.conflict.action).toBe("create-copy");
			const shard = codingAgentSessionShardPath(projectCwd, agentDir);
			expect(result.decisions[0]!.writtenPath!.startsWith(shard)).toBe(true);
		} finally {
			if (previous === undefined) delete process.env[ENV_AGENT_DIR];
			else process.env[ENV_AGENT_DIR] = previous;
		}
	});

	async function writeSessionFile(root: string, fileName: string, sessionId: string, cwd: string): Promise<string> {
		const sessionPath = join(root, fileName);
		const content = [
			JSON.stringify({ type: "session", version: 3, id: sessionId, timestamp: "2026-01-01T00:00:00.000Z", cwd }),
			JSON.stringify({
				type: "message",
				id: `m-${sessionId}`,
				parentId: null,
				timestamp: "2026-01-01T00:00:01.000Z",
				message: { role: "user", content: `hi ${sessionId}`, timestamp: "2026-01-01T00:00:01.000Z" },
			}),
		].join("\n");
		await writeFile(sessionPath, `${content}\n`, "utf8");
		return sessionPath;
	}

	it("Given a project with several sessions, When exported as one archive, Then every session round-trips with its records", async () => {
		const root = await mkdtemp(join(tmpdir(), "session-archive-proj-"));
		roots.push(root);
		const a = await writeSessionFile(root, "a.jsonl", "sess-a", root);
		const b = await writeSessionFile(root, "b.jsonl", "sess-b", root);

		const bytes = await exportProjectSessionsArchiveToBytes({
			sessionPaths: [a, b],
			passphrase: "pw",
			appVersion: "0.1.1",
		});

		const decoded = await decodeSessionArchive(bytes, "pw");
		expect(decoded.metadata.sessionCount).toBe(2);
		expect(decoded.sessions.map((session) => session.sessionId).sort()).toEqual(["sess-a", "sess-b"]);
		const sessionA = decoded.sessions.find((session) => session.sessionId === "sess-a");
		expect(sessionA?.cwd).toBe(root);
		const userRecord = sessionA?.records.find((record) => (record as { type?: string }).type === "message") as {
			message?: { content?: string };
		};
		expect(userRecord?.message?.content).toBe("hi sess-a");
	});

	it("Given no sessions, When a project export is requested, Then it refuses without opening a save dialog", async () => {
		await expect(exportProjectSessionsArchiveToBytes({ sessionPaths: [], passphrase: "" })).rejects.toThrow(
			/no sessions to export/,
		);
		saveDialogResult.mockClear();
		const result = await exportProjectSessionsArchiveWithDialog({ sessionPaths: [], passphrase: "" });
		expect(result).toEqual({ saved: false, reason: "no-sessions" });
		expect(saveDialogResult).not.toHaveBeenCalled();
	});

	it("Given one unreadable session file, When a project export is requested, Then the whole export fails naming the file", async () => {
		const root = await mkdtemp(join(tmpdir(), "session-archive-broken-"));
		roots.push(root);
		const ok = await writeSessionFile(root, "ok.jsonl", "sess-ok", root);

		await expect(
			exportProjectSessionsArchiveToBytes({ sessionPaths: [ok, join(root, "missing.jsonl")], passphrase: "" }),
		).rejects.toThrow(/missing\.jsonl/);
	});

	it("Given an imported session lands on disk, Then each written session broadcasts a list change; idempotent skips stay silent", async () => {
		const root = await mkdtemp(join(tmpdir(), "session-archive-events-"));
		roots.push(root);
		const projectCwd = await mkdtemp(join(tmpdir(), "session-archive-events-cwd-"));
		roots.push(projectCwd);
		const sessionPath = await writeSessionFile(root, "demo.jsonl", "sess-events", projectCwd);
		const bytes = await exportSessionArchiveToBytes({ sessionPath, passphrase: "", appVersion: "0.1.1" });
		const fingerprint = await fingerprintConversationFile(await readFile(sessionPath, "utf8"));

		const events: Array<{ cwd: string; sessionPath: string }> = [];
		const unsubscribe = onConversationListChanged((event) => events.push(event));
		try {
			const first = await importSessionArchiveFromBytes(bytes, "", {
				listKnownFingerprints: async () => new Map(),
				resolveImportDirectory: async () => root,
			});
			expect(first[0]?.conflict.action).toBe("create-copy");
			expect(events).toEqual([{ cwd: projectCwd, sessionPath: first[0]!.writtenPath! }]);

			events.length = 0;
			const second = await importSessionArchiveFromBytes(bytes, "", {
				listKnownFingerprints: async () =>
					new Map([[fingerprint, { sessionPath: first[0]!.writtenPath!, mtimeMs: 1 }]]),
				resolveImportDirectory: async () => root,
			});
			expect(second[0]?.conflict.action).toBe("skip-idempotent");
			expect(events).toEqual([]);
		} finally {
			unsubscribe();
		}
	});

	it("Given an imported session whose records carry a default-conversation workspace cwd, Then the broadcast maps it to the default conversation list cwd", async () => {
		const root = await mkdtemp(join(tmpdir(), "session-archive-defcwd-"));
		roots.push(root);
		const workspaceCwd = join(DEFAULT_CONVERSATION_CWD, "0e4f2d51-2b3f-4c5d-8e9f-0a1b2c3d4e5f");
		const sessionPath = await writeSessionFile(root, "demo.jsonl", "sess-defcwd", workspaceCwd);
		const bytes = await exportSessionArchiveToBytes({ sessionPath, passphrase: "", appVersion: "0.1.1" });

		const events: Array<{ cwd: string; sessionPath: string }> = [];
		const unsubscribe = onConversationListChanged((event) => events.push(event));
		try {
			await importSessionArchiveFromBytes(bytes, "", {
				listKnownFingerprints: async () => new Map(),
				resolveImportDirectory: async () => root,
			});
			expect(events).toHaveLength(1);
			expect(events[0]?.cwd).toBe(DEFAULT_CONVERSATION_CWD);
		} finally {
			unsubscribe();
		}
	});
});
