// Copyright The Open Forge contributors.

/**
 * 项目迁移包服务（OFAR v2，ADR-0147）：会话 + 项目产物一起打包，
 * 导入侧自选目标位置、重写会话头 cwd、指纹按最终落盘形态计算。
 * IPC 与 UI 保持薄层；本模块拥有文件 I/O 与冲突/恢复策略。
 */

import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { codingAgentSessionShardPath } from "@vetta/coding-agent/bootstrap";
import {
	decodeSessionArchive,
	encodeSessionArchive,
	fingerprintSessionPayload,
	resolveSessionArchiveImportConflict,
	SessionArchiveError,
	type SessionArchiveSessionPayload,
	safePath,
} from "@vetta/runtime-storage/conversation";
import { isSshProjectUri } from "@vetta/ssh-transport";
import { app, dialog } from "electron";
import { mainT } from "../i18n/index.js";
import { getAppLogger } from "../logger.js";
import { ensureArchiveDirectory, restoreArchiveAttachments, restoreArchiveFile } from "./archive-file-restore.js";
import { emitConversationListChanged } from "./conversation-list-events.js";
import {
	type KnownArchiveFingerprint,
	parseConversationFile,
	restoreArchiveSession,
	SESSION_ARCHIVE_EXTENSION,
	type SessionArchiveImportDecision,
} from "./session-archive-service.js";
import { resolveSessionListCwd } from "./session-paths.js";

const log = getAppLogger("project-migration");

/** ADR-0147：导出侧默认排除的目录名（会话已单独成帧，产物目录递归跳过同名目录）。 */
const WORKSPACE_EXCLUDED_DIRS = new Set([".git", "node_modules", ".vetta"]);
/** 单文件 >512MB 或总量 >4GB 直接失败提示精简，不做静默截断。 */
export const WORKSPACE_MAX_FILE_BYTES = 512 * 1024 * 1024;
export const WORKSPACE_MAX_TOTAL_BYTES = 4 * 1024 * 1024 * 1024;

export type ProjectMigrationExportReason = "no-sessions" | "remote-unsupported" | "workspace-too-large";

export interface ProjectMigrationExportInput {
	readonly cwd: string;
	readonly passphrase: string;
	readonly includeWorkspace: boolean;
	readonly defaultFileName?: string;
	/** 解析项目全部会话文件路径（IPC 层接 listSessionHistory）。 */
	readonly listSessionPaths: () => Promise<readonly string[]>;
	/** 测试注入用；缺省为 ADR-0147 上限（单文件 512MB / 总量 4GB）。 */
	readonly workspaceLimits?: WorkspaceSizeLimits;
}

export interface WorkspaceSizeLimits {
	readonly maxFileBytes: number;
	readonly maxTotalBytes: number;
}

export interface ProjectMigrationExportResult {
	readonly saved: boolean;
	readonly path?: string;
	readonly sessionCount?: number;
	readonly workspaceFileCount?: number;
	readonly reason?: ProjectMigrationExportReason;
	/** 体积超限时的定位信息（触发上限的相对路径等）；不包含文件内容。 */
	readonly detail?: string;
}

export interface ProjectMigrationPreviewInfo {
	readonly archivePath: string;
	readonly sourceCwd?: string;
	readonly sessionCount: number;
	readonly sessions: readonly { sessionId: string; name?: string }[];
	readonly workspaceFileCount: number;
	readonly workspaceBytes: number;
	readonly formatVersion: number;
}

export type ProjectMigrationPreviewResult =
	| { readonly canceled: true }
	| { readonly canceled: false; readonly classic: true; readonly archivePath: string }
	| ({ readonly canceled: false; readonly classic: false } & ProjectMigrationPreviewInfo);

export interface ProjectMigrationApplyInput {
	readonly archivePath: string;
	readonly passphrase: string;
	readonly targetCwd: string;
	/** 产物恢复默认 skip-existing；显式 true 才覆盖既有文件（symlink/目录类型不一致仍拒绝）。 */
	readonly overwriteWorkspace?: boolean;
	readonly listKnownFingerprints: () => Promise<ReadonlyMap<string, KnownArchiveFingerprint>>;
	/** 确保目标目录存在；默认 mkdir(targetCwd, {recursive:true})。 */
	readonly ensureTargetDir?: (targetCwd: string) => Promise<void>;
}

export interface ProjectMigrationWorkspaceReport {
	readonly written: number;
	readonly skipped: number;
	readonly overwritten: number;
	/** 无法恢复的相对路径（路径逃逸拒绝、symlink/目录类型不一致、写失败）。 */
	readonly failed: readonly string[];
}

export interface ProjectMigrationApplyReport {
	readonly sessions: readonly SessionArchiveImportDecision[];
	readonly workspace: ProjectMigrationWorkspaceReport;
}

export interface WorkspaceFilePayload {
	readonly relativePath: string;
	readonly bytes: Uint8Array;
}

export interface WorkspaceCollectionViolation {
	readonly kind: "single-file" | "total";
	readonly relativePath: string;
	readonly sizeBytes: number;
}

export interface WorkspaceCollection {
	readonly files: readonly WorkspaceFilePayload[];
	readonly totalBytes: number;
	readonly violation?: WorkspaceCollectionViolation;
}

const DEFAULT_WORKSPACE_LIMITS: WorkspaceSizeLimits = {
	maxFileBytes: WORKSPACE_MAX_FILE_BYTES,
	maxTotalBytes: WORKSPACE_MAX_TOTAL_BYTES,
};

/**
 * 递归收集项目产物文件：排除规则按目录名整树跳过，symlink 不跟随；
 * 体积上限在 stat 阶段判定（不把超限文件读进内存），违规即整体放弃导出。
 */
export async function collectWorkspaceFiles(
	cwd: string,
	limits: WorkspaceSizeLimits = DEFAULT_WORKSPACE_LIMITS,
): Promise<WorkspaceCollection> {
	const files: WorkspaceFilePayload[] = [];
	const violation = await walk(cwd, "", files, { totalBytes: 0 });
	const totalBytes = files.reduce((sum, file) => sum + file.bytes.byteLength, 0);
	return { files, totalBytes, violation };

	async function walk(
		root: string,
		relativeDir: string,
		out: WorkspaceFilePayload[],
		budget: { totalBytes: number },
	): Promise<WorkspaceCollectionViolation | undefined> {
		let entries: Dirent[];
		try {
			entries = await readdir(relativeDir ? join(root, relativeDir) : root, { withFileTypes: true });
		} catch (error) {
			throw new Error(
				`failed to list workspace ${relativeDir || "."}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		for (const entry of entries) {
			// 符号链接既可能是逃逸也可能成环；导出侧一律不跟随、不入包。
			if (entry.isSymbolicLink()) continue;
			const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				if (WORKSPACE_EXCLUDED_DIRS.has(entry.name)) continue;
				const nested = await walk(root, relativePath, out, budget);
				if (nested) return nested;
				continue;
			}
			if (!entry.isFile()) continue;
			let size: number;
			try {
				size = (await stat(join(root, relativePath))).size;
			} catch (error) {
				throw new Error(
					`failed to stat workspace ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
			if (size > limits.maxFileBytes) {
				return { kind: "single-file", relativePath, sizeBytes: size };
			}
			if (budget.totalBytes + size > limits.maxTotalBytes) {
				return { kind: "total", relativePath, sizeBytes: budget.totalBytes + size };
			}
			let bytes: Buffer;
			try {
				bytes = await readFile(join(root, relativePath));
			} catch (error) {
				throw new Error(
					`failed to read workspace ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
			budget.totalBytes += bytes.byteLength;
			out.push({ relativePath, bytes });
		}
		return undefined;
	}
}

async function loadSessionPayloads(sessionPaths: readonly string[]): Promise<SessionArchiveSessionPayload[]> {
	const sessions: SessionArchiveSessionPayload[] = [];
	for (const sessionPath of sessionPaths) {
		let content: string;
		try {
			content = await readFile(sessionPath, "utf8");
		} catch (error) {
			throw new Error(
				`failed to read session ${basename(sessionPath)}: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
		const parsed = parseConversationFile(content, basename(sessionPath, ".jsonl"));
		sessions.push({
			sessionId: parsed.sessionId,
			name: parsed.name,
			cwd: parsed.cwd,
			fingerprintSource: { records: parsed.records },
			records: parsed.records,
		});
	}
	return sessions;
}

/**
 * 导出项目迁移包：全部会话 +（可选）项目产物，编码为 OFAR v2。
 * 零会话、远程项目、产物超限都不弹保存框，以 reason 返回由 UI 给出精确反馈。
 */
export async function exportProjectMigrationArchive(
	input: ProjectMigrationExportInput,
): Promise<ProjectMigrationExportResult> {
	// 产物在远端，本机无法打包；明确拒绝而不是产半包（ADR-0147）。
	if (isSshProjectUri(input.cwd)) {
		return { saved: false, reason: "remote-unsupported" };
	}
	const sessionPaths = await input.listSessionPaths();
	if (sessionPaths.length === 0) {
		// 零会话不弹保存框：用户会觉得「保存了个空壳」而不知道自己导丢了什么。
		return { saved: false, reason: "no-sessions" };
	}

	let workspaceFiles: readonly WorkspaceFilePayload[] = [];
	if (input.includeWorkspace) {
		const collection = await collectWorkspaceFiles(input.cwd, input.workspaceLimits);
		if (collection.violation) {
			return {
				saved: false,
				reason: "workspace-too-large",
				detail: collection.violation.relativePath,
			};
		}
		workspaceFiles = collection.files;
	}

	const sessions = await loadSessionPayloads(sessionPaths);
	const bytes = await encodeSessionArchive({
		appVersion: app.getVersion(),
		passphrase: input.passphrase,
		sessions,
		workspace: { sourceCwd: resolve(input.cwd), files: workspaceFiles },
	});

	// 默认名 `项目名-migration.ofar`；调用方传名时不重复追加 -migration 后缀。
	const providedName = input.defaultFileName?.trim();
	const defaultName = providedName
		? providedName.endsWith("-migration")
			? providedName
			: `${providedName}-migration`
		: "project-migration";
	const savedTo = await showMigrationSaveDialog(defaultName);
	if (!savedTo) {
		return { saved: false };
	}
	await restoreArchiveFile(dirname(savedTo), basename(savedTo), bytes, true);
	return {
		saved: true,
		path: savedTo,
		sessionCount: sessions.length,
		workspaceFileCount: input.includeWorkspace ? workspaceFiles.length : undefined,
	};
}

async function showMigrationSaveDialog(defaultName: string): Promise<string | undefined> {
	const result = await dialog.showSaveDialog({
		title: mainT("sessionArchive.migrationExportDialogTitle"),
		defaultPath: defaultName.endsWith(`.${SESSION_ARCHIVE_EXTENSION}`)
			? defaultName
			: `${defaultName}.${SESSION_ARCHIVE_EXTENSION}`,
		filters: [
			{
				name: mainT("sessionArchive.filterName"),
				extensions: [SESSION_ARCHIVE_EXTENSION],
			},
		],
	});
	if (result.canceled || !result.filePath) return undefined;
	return result.filePath;
}

/**
 * 预览迁移包：打开框选 .ofar → 解码 → 返回摘要，不落盘。
 * v1 会话归档返回 classic:true，由调用方回落现行导入流程。
 */
export async function previewProjectMigrationArchive(passphrase: string): Promise<ProjectMigrationPreviewResult> {
	const open = await dialog.showOpenDialog({
		title: mainT("sessionArchive.importDialogTitle"),
		properties: ["openFile"],
		filters: [
			{
				name: mainT("sessionArchive.filterName"),
				extensions: [SESSION_ARCHIVE_EXTENSION],
			},
		],
	});
	if (open.canceled || open.filePaths.length === 0) {
		return { canceled: true };
	}
	return previewProjectMigrationFromFile(open.filePaths[0]!, passphrase);
}

/**
 * 预览指定迁移包（不弹框）：项目侧「导入项目」已经选好 `.ofar`，再弹一次文件框
 * 等于让用户为同一个文件选两遍（BUG-0143）。解码与摘要结构同 preview 其它分支。
 */
export async function previewProjectMigrationFromFile(
	archivePath: string,
	passphrase: string,
): Promise<ProjectMigrationPreviewResult> {
	if (!isAbsolute(archivePath)) {
		throw new Error("archivePath must be an absolute path");
	}
	const bytes = new Uint8Array(await readFile(archivePath));
	const decoded = await decodeSessionArchive(bytes, passphrase);

	if (decoded.metadata.formatVersion === 1) {
		return { canceled: false, classic: true, archivePath };
	}
	const workspaceFiles = decoded.workspace?.files ?? [];
	return {
		canceled: false,
		classic: false,
		archivePath,
		sourceCwd: decoded.workspace?.sourceCwd,
		sessionCount: decoded.sessions.length,
		sessions: decoded.sessions.map((session) => ({
			sessionId: session.sessionId,
			name: session.name,
		})),
		workspaceFileCount: workspaceFiles.length,
		workspaceBytes: workspaceFiles.reduce((sum, file) => sum + file.bytes.byteLength, 0),
		formatVersion: decoded.metadata.formatVersion,
	};
}

/**
 * ADR-0147：仅重写 legacy/session 与 native/conversation.header 里等于 sourceCwd 的 cwd 字段；
 * 历史消息/工具调用内的绝对路径是事实记录，保持原样。纯函数，两侧（导入/索引）同形。
 */
export function rewriteSessionRecordCwd(record: unknown, sourceCwd: string | undefined, targetCwd: string): unknown {
	if (sourceCwd === undefined || record === null || typeof record !== "object") return record;
	const parsed = record as Record<string, unknown>;
	if ((parsed.type !== "session" && parsed.recordType !== "conversation.header") || parsed.cwd !== sourceCwd)
		return record;
	return { ...parsed, cwd: targetCwd };
}

/**
 * 应用迁移包：重读+解码 → 会话记录先重写 cwd 再算指纹（幂等按最终落盘形态判定）
 * → 副本落目标 cwd 的分片目录 → 产物恢复（默认 skip-existing）→ 按写入会话广播目标列表。
 */
export async function applyProjectMigrationArchive(
	input: ProjectMigrationApplyInput,
): Promise<ProjectMigrationApplyReport> {
	if (typeof input.archivePath !== "string" || !input.archivePath.trim()) {
		throw new Error("archivePath is required");
	}
	if (typeof input.targetCwd !== "string" || !isAbsolute(input.targetCwd) || isSshProjectUri(input.targetCwd)) {
		throw new Error("targetCwd must be a local absolute path");
	}
	const targetCwd = resolve(input.targetCwd);
	const bytes = new Uint8Array(await readFile(input.archivePath));
	const decoded = await decodeSessionArchive(bytes, input.passphrase);
	if (decoded.metadata.formatVersion !== 2) {
		throw new Error("not a v2 migration archive");
	}

	const ensureTargetDir = input.ensureTargetDir ?? ensureArchiveDirectory;
	await ensureTargetDir(targetCwd);
	await ensureArchiveDirectory(targetCwd);
	const known = new Map(await input.listKnownFingerprints());
	const decisions: SessionArchiveImportDecision[] = [];
	const sourceCwd = decoded.workspace?.sourceCwd;
	const targetDir = codingAgentSessionShardPath(targetCwd);

	for (const session of decoded.sessions) {
		// 指纹按最终落盘形态计算：先重写再算，索引侧对磁盘文件直接算——两侧同形。
		const records = session.records.map((record) => rewriteSessionRecordCwd(record, sourceCwd, targetCwd));
		const fingerprint = await fingerprintSessionPayload({ records });
		const existing = known.get(fingerprint);
		const conflict = resolveSessionArchiveImportConflict({
			existingFingerprint: existing ? fingerprint : `__absent__:${fingerprint}`,
			incomingFingerprint: fingerprint,
			preferOverwrite: false,
		});

		if (conflict.action === "skip-idempotent") {
			if (existing) await restoreArchiveAttachments(dirname(existing.sessionPath), session.attachments);
			decisions.push({
				fingerprint,
				sessionId: session.sessionId,
				conflict,
				writtenPath: existing?.sessionPath,
			});
			continue;
		}

		const restored = await restoreArchiveSession({ ...session, records, fingerprint, targetDir });
		const targetPath = restored.path;
		known.set(fingerprint, { sessionPath: targetPath, mtimeMs: 0 });
		decisions.push({
			fingerprint,
			sessionId: session.sessionId,
			conflict: restored.written
				? conflict
				: resolveSessionArchiveImportConflict({
						existingFingerprint: fingerprint,
						incomingFingerprint: fingerprint,
					}),
			writtenPath: targetPath,
		});
		if (!restored.written) continue;
		// 导入落盘对渲染端不可见（会话目录没有 watcher）；按目标列表 cwd 广播即时刷新。
		emitConversationListChanged({
			cwd: resolveSessionListCwd(targetCwd),
			sessionPath: targetPath,
		});
	}

	const workspace = await restoreWorkspaceFiles(
		decoded.workspace?.files ?? [],
		targetCwd,
		input.overwriteWorkspace === true,
	);

	return { sessions: decisions, workspace };
}

async function restoreWorkspaceFiles(
	files: readonly { relativePath: string; bytes: Uint8Array }[],
	targetCwd: string,
	overwrite: boolean,
): Promise<ProjectMigrationWorkspaceReport> {
	let written = 0;
	let skipped = 0;
	let overwritten = 0;
	const failed: string[] = [];

	for (const file of files) {
		// safePath 防逃逸（..、绝对路径、盘符、NUL）；拒绝的路径计入报告而不中断整包。
		let relative: string;
		try {
			relative = safePath(file.relativePath);
		} catch (error) {
			log.warn("workspace path rejected", error instanceof SessionArchiveError ? error.archiveCode : undefined);
			failed.push(file.relativePath);
			continue;
		}
		try {
			const result = await restoreArchiveFile(targetCwd, relative, file.bytes, overwrite);
			if (result === "skipped") skipped++;
			else if (result === "overwritten") overwritten++;
			else written++;
		} catch (error) {
			log.warn("workspace restore failed", relative, error instanceof Error ? error.message : undefined);
			failed.push(relative);
		}
	}

	return { written, skipped, overwritten, failed };
}
