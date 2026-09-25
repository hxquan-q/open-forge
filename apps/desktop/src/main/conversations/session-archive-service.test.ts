import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codingAgentSessionShardPath } from "@vetta/coding-agent/bootstrap";
import { ENV_AGENT_DIR } from "@vetta/coding-agent/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveSessionImportDir } from "./session-paths.js";

const openDialogResult = vi.fn(
	async (): Promise<{ canceled: boolean; filePaths: string[] }> => ({
		canceled: true,
		filePaths: [],
	}),
);

vi.mock("electron", () => ({
	app: { getVersion: () => "0.1.1" },
	dialog: {
		showSaveDialog: async () => ({ canceled: true }),
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
});
