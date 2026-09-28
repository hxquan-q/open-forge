import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@vetta/coding-agent/config";
import { ipcMain } from "electron";
import { DEFAULT_CONVERSATION_SESSION_DIR } from "../config/desktop-config-store.js";
import {
	exportSessionArchiveWithDialog,
	fingerprintConversationFile,
	importSessionArchiveWithDialog,
	type KnownArchiveFingerprint,
	SESSION_ARCHIVE_EXTENSION,
} from "../conversations/session-archive-service.js";
import { resolveSessionImportDir } from "../conversations/session-paths.js";

export const SESSION_ARCHIVE_CHANNELS = {
	EXPORT: "vetta:session-archive:export",
	IMPORT: "vetta:session-archive:import",
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

	ipcMain.handle(SESSION_ARCHIVE_CHANNELS.IMPORT, async (_event, input: { passphrase?: unknown } | undefined) => {
		const passphrase = typeof input?.passphrase === "string" ? input.passphrase : "";
		return importSessionArchiveWithDialog(passphrase, {
			listKnownFingerprints,
			resolveImportDirectory,
		});
	});
}

export { SESSION_ARCHIVE_EXTENSION };
