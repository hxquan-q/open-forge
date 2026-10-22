// Copyright The Open Forge contributors.
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { codingAgentSessionShardPath } from "@vetta/coding-agent/bootstrap";
import { ENV_AGENT_DIR } from "@vetta/coding-agent/config";
import { decodeSessionArchive } from "@vetta/runtime-storage/conversation";
import { afterEach, describe, expect, it, vi } from "vitest";
import { onConversationListChanged } from "./conversation-list-events.js";
import type { KnownArchiveFingerprint } from "./session-archive-service.js";

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
	app: { getVersion: () => "0.1.3" },
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
	applyProjectMigrationArchive,
	collectWorkspaceFiles,
	exportProjectMigrationArchive,
	previewProjectMigrationArchive,
	WORKSPACE_MAX_FILE_BYTES,
	WORKSPACE_MAX_TOTAL_BYTES,
} = await import("./project-migration-service.js");
const { fingerprintConversationFile } = await import("./session-archive-service.js");

async function writeSessionFile(root: string, fileName: string, sessionId: string, cwd: string): Promise<string> {
	const sessionPath = join(root, fileName);
	const content = [
		JSON.stringify({ type: "session", version: 3, id: sessionId, timestamp: "2026-01-01T00:00:00.000Z", cwd }),
		JSON.stringify({
			type: "message",
			id: `m-${sessionId}`,
			parentId: null,
			timestamp: "2026-01-01T00:00:01.000Z",
			message: { role: "user", content: `run ${cwd}/scripts/build`, timestamp: "2026-01-01T00:00:01.000Z" },
		}),
	].join("\n");
	await writeFile(sessionPath, `${content}\n`, "utf8");
	return sessionPath;
}

/** 与 IPC 层同构：扫描某实例分片根下的全部 .jsonl 构建指纹索引。 */
async function buildShardFingerprintIndex(agentDir: string): Promise<Map<string, KnownArchiveFingerprint>> {
	const map = new Map<string, KnownArchiveFingerprint>();
	const sessionsRoot = join(agentDir, "sessions");
	try {
		for (const shard of await readdir(sessionsRoot, { withFileTypes: true })) {
			if (!shard.isDirectory()) continue;
			for (const file of await readdir(join(sessionsRoot, shard.name), { withFileTypes: true })) {
				if (!file.isFile() || !file.name.endsWith(".jsonl")) continue;
				const sessionPath = join(sessionsRoot, shard.name, file.name);
				try {
					const content = await readFile(sessionPath, "utf8");
					map.set(await fingerprintConversationFile(content), { sessionPath, mtimeMs: 1 });
				} catch {
					// 与 IPC 层一致：坏文件不入索引。
				}
			}
		}
	} catch {
		// 分片根尚不存在（新实例首次导入）。
	}
	return map;
}

describe("project migration service: export", () => {
	const roots: string[] = [];

	afterEach(async () => {
		await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
		saveDialogResult.mockReset();
		saveDialogResult.mockResolvedValue({ canceled: true });
		openDialogResult.mockReset();
		openDialogResult.mockResolvedValue({ canceled: true, filePaths: [] });
	});

	async function prepareProject(): Promise<{ projectCwd: string; sessionPaths: string[] }> {
		const projectCwd = await mkdtemp(join(tmpdir(), "migration-src-"));
		roots.push(projectCwd);
		const sessionsDir = await mkdtemp(join(tmpdir(), "migration-sessions-"));
		roots.push(sessionsDir);
		await writeFile(join(projectCwd, "README.md"), "# demo\n", "utf8");
		await mkdir(join(projectCwd, "src"), { recursive: true });
		await writeFile(join(projectCwd, "src", "main.ts"), "export {};\n", "utf8");
		await mkdir(join(projectCwd, ".git"), { recursive: true });
		await writeFile(join(projectCwd, ".git", "config"), "[core]\n", "utf8");
		await mkdir(join(projectCwd, "node_modules", "pkg"), { recursive: true });
		await writeFile(join(projectCwd, "node_modules", "pkg", "index.js"), "module.exports = 1;\n", "utf8");
		await mkdir(join(projectCwd, ".vetta"), { recursive: true });
		await writeFile(join(projectCwd, ".vetta", "state.json"), "{}\n", "utf8");
		await mkdir(join(projectCwd, "sub", "node_modules"), { recursive: true });
		await writeFile(join(projectCwd, "sub", "node_modules", "skip.txt"), "skip\n", "utf8");
		await writeFile(join(projectCwd, "sub", "keep.ts"), "keep\n", "utf8");
		const sessionPath = await writeSessionFile(sessionsDir, "a.jsonl", "sess-mig", resolve(projectCwd));
		return { projectCwd, sessionPaths: [sessionPath] };
	}

	it("排除 .git/node_modules/.vetta（含嵌套）与符号链接，产出 v2 迁移包且 workspace 字节保真", async () => {
		const { projectCwd, sessionPaths } = await prepareProject();
		let symlinkSkipped = false;
		try {
			await symlink(join(projectCwd, "README.md"), join(projectCwd, "link-to-readme.md"));
		} catch {
			// Windows 未开启开发者模式时文件符号链接需要管理员权限；无符号链接则跳过该项断言。
			symlinkSkipped = true;
		}
		const outDir = await mkdtemp(join(tmpdir(), "migration-out-"));
		roots.push(outDir);
		const archivePath = join(outDir, "proj.ofar");
		saveDialogResult.mockResolvedValueOnce({ canceled: false, filePath: archivePath });

		const result = await exportProjectMigrationArchive({
			cwd: projectCwd,
			passphrase: "pw",
			includeWorkspace: true,
			defaultFileName: "MyProj",
			listSessionPaths: async () => sessionPaths,
		});

		expect(result).toEqual({
			saved: true,
			path: archivePath,
			sessionCount: 1,
			workspaceFileCount: 3,
		});
		// 默认文件名：项目名-migration.ofar。
		expect(saveDialogResult).toHaveBeenCalled();
		const decoded = await decodeSessionArchive(new Uint8Array(await readFile(archivePath)), "pw");
		expect(decoded.metadata.formatVersion).toBe(2);
		expect(decoded.metadata.sourceCwd).toBe(resolve(projectCwd));
		expect(decoded.workspace?.files.map((file) => file.relativePath).sort()).toEqual([
			"README.md",
			"src/main.ts",
			"sub/keep.ts",
		]);
		expect(decoded.workspace?.files.find((file) => file.relativePath === "README.md")?.bytes).toEqual(
			new TextEncoder().encode("# demo\n"),
		);
		if (!symlinkSkipped) {
			expect(decoded.workspace?.files.some((file) => file.relativePath === "link-to-readme.md")).toBe(false);
		}
	});

	it("不包含产物时仍是 v2 迁移包，workspace 为空且不读项目目录", async () => {
		const { projectCwd, sessionPaths } = await prepareProject();
		const outDir = await mkdtemp(join(tmpdir(), "migration-out-2-"));
		roots.push(outDir);
		const archivePath = join(outDir, "proj.ofar");
		saveDialogResult.mockResolvedValueOnce({ canceled: false, filePath: archivePath });

		const result = await exportProjectMigrationArchive({
			cwd: projectCwd,
			passphrase: "",
			includeWorkspace: false,
			listSessionPaths: async () => sessionPaths,
		});

		expect(result.saved).toBe(true);
		expect(result.workspaceFileCount).toBeUndefined();
		const decoded = await decodeSessionArchive(new Uint8Array(await readFile(archivePath)), "");
		expect(decoded.metadata.formatVersion).toBe(2);
		expect(decoded.workspace?.files).toEqual([]);
	});

	it("零会话不弹保存框，返回 no-sessions", async () => {
		const { projectCwd } = await prepareProject();
		const result = await exportProjectMigrationArchive({
			cwd: projectCwd,
			passphrase: "",
			includeWorkspace: true,
			listSessionPaths: async () => [],
		});
		expect(result).toEqual({ saved: false, reason: "no-sessions" });
		expect(saveDialogResult).not.toHaveBeenCalled();
	});

	it("远程 ssh:// 项目明确拒绝且不解析会话", async () => {
		const listSessionPaths = vi.fn(async () => ["C:/nowhere/a.jsonl"]);
		const result = await exportProjectMigrationArchive({
			cwd: "ssh://host-id/srv/project",
			passphrase: "",
			includeWorkspace: true,
			listSessionPaths,
		});
		expect(result).toEqual({ saved: false, reason: "remote-unsupported" });
		expect(listSessionPaths).not.toHaveBeenCalled();
		expect(saveDialogResult).not.toHaveBeenCalled();
	});

	it("单文件超上限在 stat 阶段拦截，不产半包不弹框", async () => {
		const projectCwd = await mkdtemp(join(tmpdir(), "migration-limit-1-"));
		roots.push(projectCwd);
		await writeFile(join(projectCwd, "small.txt"), "ok", "utf8");
		await writeFile(join(projectCwd, "big.bin"), "x", "utf8");
		await truncate(join(projectCwd, "big.bin"), 512 * 1024 * 1024 + 1);

		const collection = await collectWorkspaceFiles(projectCwd);
		expect(collection.violation).toMatchObject({ kind: "single-file", relativePath: "big.bin" });
		// 违规即整体放弃：超限文件未被读入，收集结果不包含它。
		expect(collection.files.map((file) => file.relativePath)).not.toContain("big.bin");

		const result = await exportProjectMigrationArchive({
			cwd: projectCwd,
			passphrase: "",
			includeWorkspace: true,
			listSessionPaths: async () => [await writeSessionFile(projectCwd, "s.jsonl", "s", projectCwd)],
		});
		expect(result).toEqual({
			saved: false,
			reason: "workspace-too-large",
			detail: "big.bin",
		});
		expect(saveDialogResult).not.toHaveBeenCalled();
	});

	it("总量超上限整体放弃，已读文件不部分落盘", async () => {
		const projectCwd = await mkdtemp(join(tmpdir(), "migration-limit-2-"));
		roots.push(projectCwd);
		await writeFile(join(projectCwd, "a.txt"), "aaaa", "utf8");
		await writeFile(join(projectCwd, "b.txt"), "bbbb", "utf8");
		const collection = await collectWorkspaceFiles(projectCwd, { maxFileBytes: 100, maxTotalBytes: 6 });
		expect(collection.violation).toMatchObject({ kind: "total", relativePath: "b.txt" });

		const result = await exportProjectMigrationArchive({
			cwd: projectCwd,
			passphrase: "",
			includeWorkspace: true,
			listSessionPaths: async () => [await writeSessionFile(projectCwd, "s.jsonl", "s", projectCwd)],
			workspaceLimits: { maxFileBytes: 100, maxTotalBytes: 6 },
		});
		expect(result.reason).toBe("workspace-too-large");
		expect(result.saved).toBe(false);
	});

	it("ADR 上限常量与迁移包格式版本保持合同值", () => {
		expect(WORKSPACE_MAX_FILE_BYTES).toBe(512 * 1024 * 1024);
		expect(WORKSPACE_MAX_TOTAL_BYTES).toBe(4 * 1024 * 1024 * 1024);
	});
});

describe("project migration service: preview", () => {
	const roots: string[] = [];

	afterEach(async () => {
		await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
		openDialogResult.mockReset();
		openDialogResult.mockResolvedValue({ canceled: true, filePaths: [] });
	});

	async function buildArchive(version: "v1" | "v2"): Promise<string> {
		const srcDir = await mkdtemp(join(tmpdir(), "migration-preview-"));
		roots.push(srcDir);
		const sessionPath = await writeSessionFile(srcDir, "a.jsonl", "sess-p", "C:/source/proj");
		const migrationService = await import("./project-migration-service.js");
		if (version === "v1") {
			const { encodeSessionArchive } = await import("@vetta/runtime-storage/conversation");
			const { parseConversationFile } = await import("./session-archive-service.js");
			const parsed = parseConversationFile(await readFile(sessionPath, "utf8"), "a");
			const bytes = await encodeSessionArchive({
				appVersion: "0.1.3",
				passphrase: "pw",
				sessions: [
					{
						sessionId: parsed.sessionId,
						name: parsed.name,
						cwd: parsed.cwd,
						fingerprintSource: { records: parsed.records },
						records: parsed.records,
					},
				],
			});
			const archivePath = join(srcDir, "v1.ofar");
			await writeFile(archivePath, bytes);
			return archivePath;
		}
		const outDir = await mkdtemp(join(tmpdir(), "migration-preview-out-"));
		roots.push(outDir);
		const archivePath = join(outDir, "v2.ofar");
		await writeFile(join(srcDir, "artifact.txt"), "artifact-bytes", "utf8");
		// v2 迁移包直接用导出函数构造（保存框指向临时路径）。
		saveDialogResult.mockResolvedValueOnce({ canceled: false, filePath: archivePath });
		await migrationService.exportProjectMigrationArchive({
			cwd: srcDir,
			passphrase: "pw",
			includeWorkspace: true,
			listSessionPaths: async () => [sessionPath],
		});
		return archivePath;
	}

	it("v1 会话归档识别为 classic，交由现行导入流程回落", async () => {
		const archivePath = await buildArchive("v1");
		openDialogResult.mockResolvedValueOnce({ canceled: false, filePaths: [archivePath] });

		const result = await previewProjectMigrationArchive("pw");

		expect(result).toEqual({ canceled: false, classic: true, archivePath });
	});

	it("v2 迁移包返回摘要且不落盘（不写任何目标文件）", async () => {
		const archivePath = await buildArchive("v2");
		openDialogResult.mockResolvedValueOnce({ canceled: false, filePaths: [archivePath] });

		const result = await previewProjectMigrationArchive("pw");

		expect(result.canceled).toBe(false);
		if (result.canceled || result.classic) throw new Error("expected migration preview");
		expect(result.archivePath).toBe(archivePath);
		expect(result.formatVersion).toBe(2);
		expect(result.sessionCount).toBe(1);
		expect(result.sessions[0]?.sessionId).toBe("sess-p");
		expect(result.workspaceFileCount).toBeGreaterThanOrEqual(1);
		expect(result.workspaceBytes).toBeGreaterThan(0);
	});

	it("取消选择返回 canceled 且不抛错", async () => {
		openDialogResult.mockResolvedValueOnce({ canceled: true, filePaths: [] });
		await expect(previewProjectMigrationArchive("pw")).resolves.toEqual({ canceled: true });
	});
});

describe("project migration service: apply（跨实例迁移）", () => {
	const roots: string[] = [];

	afterEach(async () => {
		await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
	});

	async function buildMigrationPackage(): Promise<{ archivePath: string; sourceCwd: string }> {
		const sourceCwd = await mkdtemp(join(tmpdir(), "apply-src-"));
		roots.push(sourceCwd);
		const sessionsDir = await mkdtemp(join(tmpdir(), "apply-sessions-"));
		roots.push(sessionsDir);
		const outDir = await mkdtemp(join(tmpdir(), "apply-out-"));
		roots.push(outDir);
		await writeFile(join(sourceCwd, "artifact.txt"), "artifact-content", "utf8");
		await mkdir(join(sourceCwd, "nested"), { recursive: true });
		await writeFile(join(sourceCwd, "nested", "deep.txt"), "deep", "utf8");
		const sessionPath = await writeSessionFile(sessionsDir, "a.jsonl", "sess-apply", resolve(sourceCwd));

		const archivePath = join(outDir, "pkg.ofar");
		saveDialogResult.mockResolvedValueOnce({ canceled: false, filePath: archivePath });
		const result = await exportProjectMigrationArchive({
			cwd: sourceCwd,
			passphrase: "pw",
			includeWorkspace: true,
			listSessionPaths: async () => [sessionPath],
		});
		expect(result.saved).toBe(true);
		return { archivePath, sourceCwd: resolve(sourceCwd) };
	}

	async function withAgentDirB<T>(fn: (agentDir: string) => Promise<T>): Promise<T> {
		const agentDir = await mkdtemp(join(tmpdir(), "apply-agent-"));
		roots.push(agentDir);
		const previous = process.env[ENV_AGENT_DIR];
		process.env[ENV_AGENT_DIR] = agentDir;
		try {
			return await fn(agentDir);
		} finally {
			if (previous === undefined) delete process.env[ENV_AGENT_DIR];
			else process.env[ENV_AGENT_DIR] = previous;
		}
	}

	it("重写 cwd 后落目标分片、幂等重导、消息内绝对路径保持事实、广播目标列表", async () => {
		const { archivePath, sourceCwd } = await buildMigrationPackage();
		await withAgentDirB(async (agentDir) => {
			const targetCwd = await mkdtemp(join(tmpdir(), "apply-target-"));
			roots.push(targetCwd);
			const options = () => ({
				listKnownFingerprints: () => buildShardFingerprintIndex(agentDir),
			});
			const events: Array<{ cwd: string; sessionPath: string }> = [];
			const unsubscribe = onConversationListChanged((event) => events.push(event));
			try {
				const first = await applyProjectMigrationArchive({
					archivePath,
					passphrase: "pw",
					targetCwd,
					...options(),
				});
				const shard = codingAgentSessionShardPath(resolve(targetCwd), agentDir);
				expect(first.sessions[0]?.conflict.action).toBe("create-copy");
				expect(first.sessions[0]!.writtenPath!.startsWith(shard)).toBe(true);

				// 会话头 cwd 重写为目标；消息记录内的源绝对路径保持事实（ADR-0147）。
				const lines = (await readFile(first.sessions[0]!.writtenPath!, "utf8")).trim().split(/\r?\n/);
				const header = JSON.parse(lines[0]!) as { type: string; cwd: string };
				expect(header).toMatchObject({ type: "session", cwd: resolve(targetCwd) });
				const message = JSON.parse(lines[1]!) as { message?: { content?: string } };
				expect(message.message?.content).toContain(`${sourceCwd}/scripts/build`);

				// 产物恢复到目标位置。
				expect(await readFile(join(targetCwd, "artifact.txt"), "utf8")).toBe("artifact-content");
				expect(await readFile(join(targetCwd, "nested", "deep.txt"), "utf8")).toBe("deep");

				// 广播的是目标列表 cwd。
				expect(events).toEqual([{ cwd: resolve(targetCwd), sessionPath: first.sessions[0]!.writtenPath! }]);

				// 同包同目标重导：全部 skip-idempotent，产物 skip-existing，不产生重复副本。
				events.length = 0;
				const second = await applyProjectMigrationArchive({
					archivePath,
					passphrase: "pw",
					targetCwd,
					...options(),
				});
				expect(second.sessions[0]?.conflict.action).toBe("skip-idempotent");
				expect(second.sessions[0]?.writtenPath).toBe(first.sessions[0]?.writtenPath);
				expect(second.workspace).toMatchObject({ written: 0, skipped: 2, overwritten: 0, failed: [] });
				expect(events).toEqual([]);
			} finally {
				unsubscribe();
			}
		});
	});

	it("换目标视为新位置建副本（指纹按目标形态区分）", async () => {
		const { archivePath } = await buildMigrationPackage();
		await withAgentDirB(async (agentDir) => {
			const targetA = await mkdtemp(join(tmpdir(), "apply-target-a-"));
			const targetB = await mkdtemp(join(tmpdir(), "apply-target-b-"));
			roots.push(targetA, targetB);
			const first = await applyProjectMigrationArchive({
				archivePath,
				passphrase: "pw",
				targetCwd: targetA,
				listKnownFingerprints: () => buildShardFingerprintIndex(agentDir),
			});
			const second = await applyProjectMigrationArchive({
				archivePath,
				passphrase: "pw",
				targetCwd: targetB,
				listKnownFingerprints: () => buildShardFingerprintIndex(agentDir),
			});
			expect(first.sessions[0]?.conflict.action).toBe("create-copy");
			expect(second.sessions[0]?.conflict.action).toBe("create-copy");
			expect(second.sessions[0]?.writtenPath).not.toBe(first.sessions[0]?.writtenPath);
			// 目标 B 的会话头 cwd 是 B 而不是 A。
			const lines = (await readFile(second.sessions[0]!.writtenPath!, "utf8")).trim().split(/\r?\n/);
			expect(JSON.parse(lines[0]!)).toMatchObject({ cwd: resolve(targetB) });
		});
	});

	it("产物冲突策略：默认跳过已有文件，显式覆盖才改写，symlink/目录类型不一致拒绝", async () => {
		const { archivePath } = await buildMigrationPackage();
		await withAgentDirB(async (agentDir) => {
			const targetCwd = await mkdtemp(join(tmpdir(), "apply-target-ws-"));
			roots.push(targetCwd);
			await writeFile(join(targetCwd, "artifact.txt"), "user-owned", "utf8");
			await mkdir(join(targetCwd, "nested"), { recursive: true });
			await mkdir(join(targetCwd, "nested", "deep.txt"), { recursive: true });
			let linkPlaced = true;
			// 占位：包内无该文件时这步只是为 symlink 场景准备（包内只有 artifact/nested/deep）。
			try {
				await symlink(join(targetCwd, "artifact.txt"), join(targetCwd, "nested", "link.txt"));
			} catch {
				linkPlaced = false;
			}
			void linkPlaced;

			const skipped = await applyProjectMigrationArchive({
				archivePath,
				passphrase: "pw",
				targetCwd,
				listKnownFingerprints: () => buildShardFingerprintIndex(agentDir),
			});
			// artifact.txt 已存在 → skip（用户内容不被静默覆盖）；deep.txt 是目录 → failed。
			expect(skipped.workspace).toMatchObject({ written: 0, skipped: 1, overwritten: 0 });
			expect(skipped.workspace.failed).toEqual(["nested/deep.txt"]);
			expect(await readFile(join(targetCwd, "artifact.txt"), "utf8")).toBe("user-owned");

			const overwritten = await applyProjectMigrationArchive({
				archivePath,
				passphrase: "pw",
				targetCwd,
				overwriteWorkspace: true,
				listKnownFingerprints: () => buildShardFingerprintIndex(agentDir),
			});
			expect(overwritten.workspace).toMatchObject({ written: 0, skipped: 0, overwritten: 1 });
			expect(overwritten.workspace.failed).toEqual(["nested/deep.txt"]);
			expect(await readFile(join(targetCwd, "artifact.txt"), "utf8")).toBe("artifact-content");
			// 目录类型的 deep.txt 依旧不被文件覆盖。
			expect((await readdir(join(targetCwd, "nested", "deep.txt"))).length).toBe(0);
		});
	});

	it("错误口令直接拒绝且不落盘；相对 targetCwd 拒绝", async () => {
		const { archivePath } = await buildMigrationPackage();
		await withAgentDirB(async (agentDir) => {
			const targetCwd = await mkdtemp(join(tmpdir(), "apply-target-bad-"));
			roots.push(targetCwd);
			await expect(
				applyProjectMigrationArchive({
					archivePath,
					passphrase: "wrong",
					targetCwd,
					listKnownFingerprints: async () => new Map(),
				}),
			).rejects.toThrow();
			expect(existsSync(join(agentDir, "sessions"))).toBe(false);
			await expect(
				applyProjectMigrationArchive({
					archivePath,
					passphrase: "pw",
					targetCwd: "relative/path",
					listKnownFingerprints: async () => new Map(),
				}),
			).rejects.toThrow(/absolute/);
		});
	});
});
