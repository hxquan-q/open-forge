// Copyright The Open Forge contributors.
import { randomUUID } from "node:crypto";
import { link, lstat, mkdir, open, readFile, realpath, rename, rm, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, posix, resolve } from "node:path";
import { isSshProjectUri, parseProjectLocation } from "@vetta/ssh-transport";
import { type CodeProjectAiWorkspaceLocation, resolveCodeProjectAiWorkspace } from "./code-project-ai-workspace.js";
import { resolveDesktopSshConnection } from "./ssh-connection-resolver.js";

export const CODE_PROJECT_CONFIG_FILE_NAME = "project-config.md";
const LEGACY_MEMORY_FILE_NAMES = ["MEMORY.md", "JOURNAL.md"] as const;

export type ProjectMemoryMigrationStatus = "absent" | "migrated" | "conflict" | "copy-failed" | "source-retained";

export interface CodeProjectWorkspaceSnapshot extends CodeProjectAiWorkspaceLocation {
	readonly migration: Readonly<Record<(typeof LEGACY_MEMORY_FILE_NAMES)[number], ProjectMemoryMigrationStatus>>;
}

export interface LegacyProjectFilePort {
	read(projectCwd: string, fileName: string): Promise<Uint8Array | undefined>;
	remove(projectCwd: string, fileName: string): Promise<void>;
}

export interface EnsureCodeProjectAiWorkspaceOptions {
	readonly vettaHome?: string;
	readonly legacyFiles?: LegacyProjectFilePort;
}

const localLegacyFiles: LegacyProjectFilePort = {
	async read(projectCwd, fileName) {
		try {
			return await readFile(join(projectCwd, fileName));
		} catch (error: unknown) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
			throw error;
		}
	},
	remove: (projectCwd, fileName) => unlink(join(projectCwd, fileName)),
};

const remoteLegacyFiles: LegacyProjectFilePort = {
	async read(projectCwd, fileName) {
		const location = parseProjectLocation(projectCwd);
		if (location.kind !== "ssh") throw new Error("Expected an SSH project path");
		const connection = resolveDesktopSshConnection(location.hostId);
		const path = posix.join(location.remotePath, fileName);
		const entry = await connection.stat(path);
		if (!entry) return undefined;
		if (entry.kind !== "file") throw new Error(`Legacy memory path is not a file: ${fileName}`);
		return Buffer.from(await connection.readFile(path));
	},
	async remove(projectCwd, fileName) {
		const location = parseProjectLocation(projectCwd);
		if (location.kind !== "ssh") throw new Error("Expected an SSH project path");
		await resolveDesktopSshConnection(location.hostId).remove(posix.join(location.remotePath, fileName));
	},
};

function legacyFilePort(projectCwd: string): LegacyProjectFilePort {
	return isSshProjectUri(projectCwd) ? remoteLegacyFiles : localLegacyFiles;
}

export async function ensureCodeProjectAiWorkspace(
	projectCwd: string,
	options: EnsureCodeProjectAiWorkspaceOptions = {},
): Promise<CodeProjectWorkspaceSnapshot> {
	const workspace = resolveCodeProjectAiWorkspace(projectCwd, { vettaHome: options.vettaHome });
	await mkdir(workspace.directory, { recursive: true, mode: 0o700 });
	await assertWorkspaceDirectory(workspace.directory);
	const files = options.legacyFiles ?? legacyFilePort(projectCwd);
	const migration = {
		"MEMORY.md": await migrateFile(projectCwd, workspace.directory, "MEMORY.md", files),
		"JOURNAL.md": await migrateFile(projectCwd, workspace.directory, "JOURNAL.md", files),
	} satisfies Record<(typeof LEGACY_MEMORY_FILE_NAMES)[number], ProjectMemoryMigrationStatus>;
	return { ...workspace, migration };
}

async function assertWorkspaceDirectory(workspaceDirectory: string): Promise<void> {
	const stats = await lstat(workspaceDirectory);
	if (stats.isSymbolicLink() || !stats.isDirectory()) {
		throw new Error("Project AI workspace must be a real directory");
	}
	const parent = await realpath(dirname(workspaceDirectory));
	const target = await realpath(workspaceDirectory);
	const expected = resolve(parent, basename(workspaceDirectory));
	if (target !== expected && !(process.platform === "win32" && target.toLowerCase() === expected.toLowerCase())) {
		throw new Error("Project AI workspace resolves outside its parent directory");
	}
}

async function migrateFile(
	projectCwd: string,
	workspaceDirectory: string,
	fileName: (typeof LEGACY_MEMORY_FILE_NAMES)[number],
	files: LegacyProjectFilePort,
): Promise<ProjectMemoryMigrationStatus> {
	let content: Uint8Array | undefined;
	try {
		content = await files.read(projectCwd, fileName);
	} catch {
		return "copy-failed";
	}
	if (content === undefined) return "absent";

	const destination = join(workspaceDirectory, fileName);
	const temporary = join(workspaceDirectory, `.${fileName}.${randomUUID()}.tmp`);
	let handle: Awaited<ReturnType<typeof open>> | undefined;
	try {
		handle = await open(temporary, "wx", 0o600);
		await handle.writeFile(content);
		await handle.sync();
		await handle.close();
		handle = undefined;
		await link(temporary, destination);
	} catch (error: unknown) {
		if (handle) await handle.close().catch(() => undefined);
		await rm(temporary, { force: true }).catch(() => undefined);
		if ((error as NodeJS.ErrnoException).code === "EEXIST") return "conflict";
		return "copy-failed";
	}
	await unlink(temporary).catch(() => undefined);

	try {
		await files.remove(projectCwd, fileName);
		return "migrated";
	} catch {
		return "source-retained";
	}
}

export async function readCodeProjectConfig(
	projectCwd: string,
	options: EnsureCodeProjectAiWorkspaceOptions = {},
): Promise<{ readonly exists: boolean; readonly content: string }> {
	const workspace = await ensureCodeProjectAiWorkspace(projectCwd, options);
	const filePath = join(workspace.directory, CODE_PROJECT_CONFIG_FILE_NAME);
	try {
		const stats = await lstat(filePath);
		if (stats.isSymbolicLink() || !stats.isFile()) throw new Error("Project config must be a regular file");
		return { exists: true, content: await readFile(filePath, "utf8") };
	} catch (error: unknown) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return { exists: false, content: "" };
		throw error;
	}
}

export async function writeCodeProjectConfig(
	projectCwd: string,
	content: string,
	options: EnsureCodeProjectAiWorkspaceOptions = {},
): Promise<void> {
	const workspace = await ensureCodeProjectAiWorkspace(projectCwd, options);
	const filePath = join(workspace.directory, CODE_PROJECT_CONFIG_FILE_NAME);
	try {
		const stats = await lstat(filePath);
		if (stats.isSymbolicLink() || !stats.isFile()) throw new Error("Project config must be a regular file");
	} catch (error: unknown) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	const temporary = join(workspace.directory, `.${CODE_PROJECT_CONFIG_FILE_NAME}.${randomUUID()}.tmp`);
	try {
		await writeFile(temporary, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
		await rename(temporary, filePath);
	} finally {
		await rm(temporary, { force: true }).catch(() => undefined);
	}
}

/**
 * 硬删除项目时清理其 AI 工作区（ADR-0152 决策 6）。归档与仅移除登记不经过此路径；
 * 目录不存在时静默通过，与硬删除流程的重试语义兼容。
 */
export async function deleteCodeProjectAiWorkspace(
	projectCwd: string,
	options: EnsureCodeProjectAiWorkspaceOptions = {},
): Promise<void> {
	const workspace = resolveCodeProjectAiWorkspace(projectCwd, { vettaHome: options.vettaHome });
	await rm(workspace.directory, { recursive: true, force: true });
}
