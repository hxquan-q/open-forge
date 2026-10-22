import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@vetta/coding-agent/config";
import { ipcMain } from "electron";
import { DEFAULT_CONVERSATION_SESSION_DIR } from "../config/desktop-config-store.js";
import {
	applyProjectMigrationArchive,
	exportProjectMigrationArchive,
	previewProjectMigrationArchive,
} from "../conversations/project-migration-service.js";
import {
	exportProjectSessionsArchiveWithDialog,
	exportSessionArchiveWithDialog,
	fingerprintConversationFile,
	importSessionArchiveWithDialog,
	type KnownArchiveFingerprint,
	SESSION_ARCHIVE_EXTENSION,
} from "../conversations/session-archive-service.js";
import { resolveSessionImportDir } from "../conversations/session-paths.js";
import { listSessionHistory } from "../conversations/session-query-service.js";

export const SESSION_ARCHIVE_CHANNELS = {
	EXPORT: "vetta:session-archive:export",
	EXPORT_PROJECT: "vetta:session-archive:export-project",
	IMPORT: "vetta:session-archive:import",
	EXPORT_MIGRATION: "vetta:session-archive:export-migration",
	PREVIEW_MIGRATION: "vetta:session-archive:preview-migration",
	APPLY_MIGRATION: "vetta:session-archive:apply-migration",
} as const;

async function listKnownFingerprints(): Promise<Map<string, KnownArchiveFingerprint>> {
	const roots = new Set<string>([DEFAULT_CONVERSATION_SESSION_DIR]);
	// Project sessions live in agent-owned cwd shards; without them re-import dedupe misses.
	try {
		const shardRoot = join(getAgentDir(), "sessions");
		for (const entry of await readdir(shardRoot, { withFileTypes: true })) {
			if (entry.isDirectory()) roots.add(join(shardRoot, entry.name));
		}
	} catch {
		// Sessions root may not exist yet.
	}
	const map = new Map<string, KnownArchiveFingerprint>();
	for (const root of roots) {
		try {
			const entries = await readdir(root, { withFileTypes: true });
			for (const entry of entries) {
				if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
				const sessionPath = join(root, entry.name);
				try {
					const content = await readFile(sessionPath, "utf8");
					const fingerprint = await fingerprintConversationFile(content);
					const mtimeMs = (await stat(sessionPath)).mtimeMs;
					map.set(fingerprint, { sessionPath, mtimeMs });
				} catch {
					// Skip unreadable / corrupt sessions when building the conflict index.
				}
			}
		} catch {
			// Skip unreadable roots.
		}
	}
	return map;
}

async function resolveImportDirectory(cwdHint?: string): Promise<string> {
	return resolveSessionImportDir(cwdHint);
}

export function registerSessionArchiveIpc(): void {
	ipcMain.handle(
		SESSION_ARCHIVE_CHANNELS.EXPORT,
		async (_event, input: { sessionPath?: unknown; passphrase?: unknown; defaultFileName?: unknown }) => {
			if (typeof input?.sessionPath !== "string" || !input.sessionPath.trim()) {
				throw new Error("sessionPath is required");
			}
			const passphrase = typeof input.passphrase === "string" ? input.passphrase : "";
			const defaultFileName = typeof input.defaultFileName === "string" ? input.defaultFileName : undefined;
			return exportSessionArchiveWithDialog({
				sessionPath: input.sessionPath,
				passphrase,
				defaultFileName,
			});
		},
	);

	ipcMain.handle(
		SESSION_ARCHIVE_CHANNELS.EXPORT_PROJECT,
		async (_event, input: { cwd?: unknown; passphrase?: unknown; defaultFileName?: unknown }) => {
			if (typeof input?.cwd !== "string" || !input.cwd.trim()) {
				throw new Error("cwd is required");
			}
			// 会话记录始终落在本机（项目 cwd 对应的分片目录），远程 ssh:// 项目同样可导出。
			const sessions = await listSessionHistory(input.cwd);
			if (sessions.length === 0) {
				return { saved: false as const, reason: "no-sessions" as const };
			}
			const passphrase = typeof input.passphrase === "string" ? input.passphrase : "";
			const defaultFileName = typeof input.defaultFileName === "string" ? input.defaultFileName : undefined;
			return exportProjectSessionsArchiveWithDialog({
				sessionPaths: sessions.map((session) => session.path),
				passphrase,
				defaultFileName,
			});
		},
	);

	ipcMain.handle(SESSION_ARCHIVE_CHANNELS.IMPORT, async (_event, input: { passphrase?: unknown } | undefined) => {
		const passphrase = typeof input?.passphrase === "string" ? input.passphrase : "";
		return importSessionArchiveWithDialog(passphrase, {
			listKnownFingerprints,
			resolveImportDirectory,
		});
	});

	// ── 项目迁移包（OFAR v2，ADR-0147）：纯新增通道，既有 export/import/export-project 合同不动。 ──

	ipcMain.handle(
		SESSION_ARCHIVE_CHANNELS.EXPORT_MIGRATION,
		async (
			_event,
			input: { cwd?: unknown; passphrase?: unknown; includeWorkspace?: unknown; defaultFileName?: unknown },
		) => {
			if (typeof input?.cwd !== "string" || !input.cwd.trim()) {
				throw new Error("cwd is required");
			}
			const cwd = input.cwd;
			const passphrase = typeof input.passphrase === "string" ? input.passphrase : "";
			// 含产物默认开启；渲染端复选框显式传 false 才排除。
			const includeWorkspace = input.includeWorkspace !== false;
			const defaultFileName = typeof input.defaultFileName === "string" ? input.defaultFileName : undefined;
			return exportProjectMigrationArchive({
				cwd,
				passphrase,
				includeWorkspace,
				defaultFileName,
				listSessionPaths: async () => (await listSessionHistory(cwd)).map((session) => session.path),
			});
		},
	);

	ipcMain.handle(
		SESSION_ARCHIVE_CHANNELS.PREVIEW_MIGRATION,
		async (_event, input: { passphrase?: unknown } | undefined) => {
			const passphrase = typeof input?.passphrase === "string" ? input.passphrase : "";
			return previewProjectMigrationArchive(passphrase);
		},
	);

	ipcMain.handle(
		SESSION_ARCHIVE_CHANNELS.APPLY_MIGRATION,
		async (
			_event,
			input: { archivePath?: unknown; passphrase?: unknown; targetCwd?: unknown; overwriteWorkspace?: unknown },
		) => {
			if (typeof input?.archivePath !== "string" || !input.archivePath.trim()) {
				throw new Error("archivePath is required");
			}
			if (typeof input?.targetCwd !== "string" || !input.targetCwd.trim()) {
				throw new Error("targetCwd is required");
			}
			const passphrase = typeof input.passphrase === "string" ? input.passphrase : "";
			return applyProjectMigrationArchive({
				archivePath: input.archivePath,
				passphrase,
				targetCwd: input.targetCwd,
				overwriteWorkspace: input.overwriteWorkspace === true,
				listKnownFingerprints,
			});
		},
	);
}

export { SESSION_ARCHIVE_EXTENSION };
