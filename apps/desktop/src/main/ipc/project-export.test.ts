// Copyright The Open Forge contributors.
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { codingAgentSessionShardPath } from "@vetta/coding-agent/bootstrap";
import { ENV_AGENT_DIR } from "@vetta/coding-agent/config";
import AdmZip from "adm-zip";
import { afterEach, describe, expect, it, vi } from "vitest";
import { onConversationListChanged } from "../conversations/conversation-list-events.js";

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

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown> | unknown;
const ipcHandlers = new Map<string, IpcHandler>();

vi.mock("electron", () => ({
	dialog: {
		showSaveDialog: () => saveDialogResult(),
		showOpenDialog: () => openDialogResult(),
	},
	ipcMain: {
		handle: (channel: string, handler: IpcHandler): void => {
			ipcHandlers.set(channel, handler);
		},
		removeHandler: (channel: string) => {
			ipcHandlers.delete(channel);
		},
	},
}));

interface TestDesktopConfig {
	projects: { path: string; name: string }[];
	archivedProjects: { path: string; name: string }[];
	workspacePath: string;
}

let configState: TestDesktopConfig = { projects: [], archivedProjects: [], workspacePath: "" };

vi.mock("./fs.js", () => ({
	readDesktopConfig: async () => configState,
	updateDesktopConfig: async (updater: (current: TestDesktopConfig) => TestDesktopConfig) => {
		configState = updater(configState);
		return configState;
	},
	allowProjectRoot: () => undefined,
}));

vi.mock("../logger.js", () => ({
	getAppLogger: () => ({ warn: () => undefined, info: () => undefined }),
}));

const { PROJECT_EXPORT_CHANNELS, registerProjectExportIpc } = await import("./project-export.js");

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

/** 读出 jsonl 首行会话头（type:"session"）里的 cwd。 */
async function readSessionHeaderCwd(sessionPath: string): Promise<string> {
	const firstLine = (await readFile(sessionPath, "utf8")).split(/\r?\n/, 1)[0]!;
	return (JSON.parse(firstLine) as { cwd: string }).cwd;
}

describe("project export/import（.openforge.zip）", () => {
	const roots: string[] = [];
	const previousAgentDir = process.env[ENV_AGENT_DIR];

	afterEach(async () => {
		if (previousAgentDir === undefined) delete process.env[ENV_AGENT_DIR];
		else process.env[ENV_AGENT_DIR] = previousAgentDir;
		await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
		saveDialogResult.mockReset();
		saveDialogResult.mockResolvedValue({ canceled: true });
		openDialogResult.mockReset();
		openDialogResult.mockResolvedValue({ canceled: true, filePaths: [] });
		configState = { projects: [], archivedProjects: [], workspacePath: "" };
	});

	async function tempDir(prefix: string): Promise<string> {
		const dir = await mkdtemp(join(tmpdir(), prefix));
		roots.push(dir);
		return dir;
	}

	/** 把 ENV_AGENT_DIR 指到临时实例目录，让分片目录落在测试沙箱里。 */
	async function withTempAgentDir<T>(fn: (agentDir: string) => Promise<T>): Promise<T> {
		const agentDir = await tempDir("pex-agent-");
		process.env[ENV_AGENT_DIR] = agentDir;
		return await fn(agentDir);
	}

	function invokeExport(projectDir: string): Promise<unknown> {
		const handler = ipcHandlers.get(PROJECT_EXPORT_CHANNELS.EXPORT);
		if (!handler) throw new Error("export handler not registered");
		return Promise.resolve(handler(undefined, projectDir));
	}

	function invokeImport(): Promise<unknown> {
		const handler = ipcHandlers.get(PROJECT_EXPORT_CHANNELS.IMPORT);
		if (!handler) throw new Error("import handler not registered");
		return Promise.resolve(handler(undefined));
	}

	it("含分片会话的项目导出→导入：会话进新项目 .vetta/sessions、cwd 重写、按条广播列表变更，lock/tmp 不入包", async () => {
		const workspace = await tempDir("pex-ws-");
		configState = { projects: [], archivedProjects: [], workspacePath: workspace };
		await withTempAgentDir(async (agentDir) => {
			const projectDir = await tempDir("pex-src-");
			const projectName = basename(projectDir);
			await writeFile(join(projectDir, "README.md"), "# demo\n", "utf8");
			// 项目内存量会话（旧落点）与全局分片会话（现行落点）都要进包。
			await mkdir(join(projectDir, ".vetta", "sessions"), { recursive: true });
			await writeSessionFile(
				join(projectDir, ".vetta", "sessions"),
				"legacy.jsonl",
				"sess-legacy",
				resolve(projectDir),
			);
			const shardDir = codingAgentSessionShardPath(resolve(projectDir), agentDir);
			await mkdir(shardDir, { recursive: true });
			await writeSessionFile(shardDir, "shard.jsonl", "sess-shard", resolve(projectDir));
			await writeFile(join(shardDir, "shard.jsonl.lock"), "locked", "utf8");
			await writeFile(join(shardDir, "shard.jsonl.partial.tmp"), "partial", "utf8");

			const unregister = registerProjectExportIpc();
			try {
				const zipPath = join(workspace, `${projectName}.openforge.zip`);
				saveDialogResult.mockResolvedValueOnce({ canceled: false, filePath: zipPath });
				const exportResult = await invokeExport(projectDir);
				expect(exportResult).toEqual({ saved: true, zipPath });

				// 包内：分片会话以 <root>/.vetta/sessions/<文件名> 呈现，lock/tmp 不入包。
				const zip = new AdmZip(zipPath);
				const names = zip.getEntries().map((entry) => entry.entryName);
				expect(names).toContain(`${projectName}/.vetta/sessions/legacy.jsonl`);
				expect(names).toContain(`${projectName}/.vetta/sessions/shard.jsonl`);
				expect(names.filter((name) => name.endsWith(".lock") || name.endsWith(".tmp"))).toEqual([]);

				const events: Array<{ cwd: string; sessionPath: string }> = [];
				const unsubscribe = onConversationListChanged((event) => events.push(event));
				try {
					openDialogResult.mockResolvedValueOnce({ canceled: false, filePaths: [zipPath] });
					const importResult = (await invokeImport()) as {
						path: string;
						name: string;
						type: string;
						missingSources?: string[];
					};

					const newProject = resolve(join(workspace, projectName));
					expect(importResult).toEqual({ path: join(workspace, projectName), name: projectName, type: "normal" });
					expect(existsSync(join(newProject, "README.md"))).toBe(true);
					expect(configState.projects).toContainEqual({ path: join(workspace, projectName), name: projectName });

					// 会话恢复进新项目 .vetta/sessions，会话头 cwd 重写为新项目根。
					const newSessionsDir = join(newProject, ".vetta", "sessions");
					expect(await readSessionHeaderCwd(join(newSessionsDir, "legacy.jsonl"))).toBe(newProject);
					expect(await readSessionHeaderCwd(join(newSessionsDir, "shard.jsonl"))).toBe(newProject);
					expect(existsSync(join(newSessionsDir, "shard.jsonl.lock"))).toBe(false);
					expect(existsSync(join(newSessionsDir, "shard.jsonl.partial.tmp"))).toBe(false);

					// 每个写入的会话按目标列表 cwd 广播一次列表变更（侧栏即时刷新）。
					expect(events.map((event) => event.cwd)).toEqual([newProject, newProject]);
					expect(events.map((event) => event.sessionPath).sort()).toEqual(
						[join(newSessionsDir, "legacy.jsonl"), join(newSessionsDir, "shard.jsonl")].sort(),
					);
				} finally {
					unsubscribe();
				}
			} finally {
				unregister();
			}
		});
	});

	it("导出对同名会话按文件名去重：项目内 .vetta/sessions 优先，分片副本不重复入包", async () => {
		const workspace = await tempDir("pex-ws-dup-");
		configState = { projects: [], archivedProjects: [], workspacePath: workspace };
		await withTempAgentDir(async (agentDir) => {
			const projectDir = await tempDir("pex-src-dup-");
			const projectName = basename(projectDir);
			await mkdir(join(projectDir, ".vetta", "sessions"), { recursive: true });
			await writeSessionFile(
				join(projectDir, ".vetta", "sessions"),
				"dup.jsonl",
				"dup-project",
				resolve(projectDir),
			);
			const shardDir = codingAgentSessionShardPath(resolve(projectDir), agentDir);
			await mkdir(shardDir, { recursive: true });
			await writeSessionFile(shardDir, "dup.jsonl", "dup-shard", resolve(projectDir));
			await writeSessionFile(shardDir, "solo.jsonl", "solo-shard", resolve(projectDir));

			const unregister = registerProjectExportIpc();
			try {
				const zipPath = join(workspace, `${projectName}.openforge.zip`);
				saveDialogResult.mockResolvedValueOnce({ canceled: false, filePath: zipPath });
				await invokeExport(projectDir);

				const zip = new AdmZip(zipPath);
				const sessionEntries = zip
					.getEntries()
					.filter((entry) => entry.entryName.startsWith(`${projectName}/.vetta/sessions/`));
				expect(sessionEntries.map((entry) => entry.entryName).sort()).toEqual([
					`${projectName}/.vetta/sessions/dup.jsonl`,
					`${projectName}/.vetta/sessions/solo.jsonl`,
				]);
				// 同名时项目内文件是事实源：dup.jsonl 内容是项目内那份。
				const dup = zip.getEntry(`${projectName}/.vetta/sessions/dup.jsonl`);
				expect(dup?.getData().toString("utf8")).toContain("dup-project");
				expect(dup?.getData().toString("utf8")).not.toContain("dup-shard");
			} finally {
				unregister();
			}
		});
	});

	it("旧包（仅工作区文件、无会话）导入不回归：项目恢复、注册且不广播会话列表变更", async () => {
		const workspace = await tempDir("pex-ws-old-");
		configState = { projects: [], archivedProjects: [], workspacePath: workspace };

		const zipPath = join(workspace, "OldProj.openforge.zip");
		const zip = new AdmZip();
		zip.addFile(
			"_vetta-export.json",
			Buffer.from(
				JSON.stringify({
					format: "vetta-project-export",
					version: 1,
					type: "normal",
					name: "OldProj",
					originalPath: "C:/old/machine/OldProj",
					rootDir: "OldProj",
					exportedAt: 1,
				}),
				"utf8",
			),
		);
		zip.addFile("OldProj/README.md", Buffer.from("old\n", "utf8"));
		zip.writeZip(zipPath);

		const unregister = registerProjectExportIpc();
		try {
			const events: Array<{ cwd: string; sessionPath: string }> = [];
			const unsubscribe = onConversationListChanged((event) => events.push(event));
			try {
				openDialogResult.mockResolvedValueOnce({ canceled: false, filePaths: [zipPath] });
				const importResult = (await invokeImport()) as {
					path: string;
					name: string;
					type: string;
					missingSources?: string[];
				};

				expect(importResult).toEqual({ path: join(workspace, "OldProj"), name: "OldProj", type: "normal" });
				expect(await readFile(join(workspace, "OldProj", "README.md"), "utf8")).toBe("old\n");
				expect(configState.projects).toContainEqual({ path: join(workspace, "OldProj"), name: "OldProj" });
				expect(existsSync(join(workspace, "OldProj", ".vetta", "sessions"))).toBe(false);
				expect(events).toEqual([]);
			} finally {
				unsubscribe();
			}
		} finally {
			unregister();
		}
	});
});
