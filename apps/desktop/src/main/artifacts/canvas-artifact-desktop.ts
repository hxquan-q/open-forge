// Copyright The Open Forge contributors.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getVettaHomePath } from "@vetta/action-rpc";
import { isSshProjectUri } from "@vetta/ssh-transport";
import { conversationOwnershipCatalog } from "../conversations/conversation-ownership-catalog.js";
import { resolveSessionDirForCwd } from "../conversations/session-paths.js";
import {
	allowProjectRoot,
	readFilesystemFile,
	statFilesystemPath,
	writeFilesystemFile,
} from "../filesystem/filesystem-service.js";
import { getSharedRuntime } from "../runtime.js";
import { CanvasArtifactService, type CanvasOwnershipRecord } from "./canvas-artifact-service.js";
import { CanvasStore } from "./canvas-store.js";

let instance: CanvasArtifactService | undefined;

export function getDesktopCanvasArtifactService(): CanvasArtifactService {
	instance ??= createDesktopCanvasArtifactService();
	return instance;
}

export function createDesktopCanvasArtifactService(root = join(getVettaHomePath(), "canvas")): CanvasArtifactService {
	const store = new CanvasStore(root);
	return new CanvasArtifactService({
		store,
		now: () => Date.now(),
		createId: () => `artifact-${crypto.randomUUID()}`,
		resolveSessionDir: resolveSessionDirForCwd,
		runtime: {
			getTaskState: (sessionId) => getSharedRuntime().getTaskState(sessionId),
			recordTaskFacts: (sessionId, facts) => getSharedRuntime().recordTaskFacts(sessionId, facts),
			listSessions: async (cwd, sessionDir) => {
				const listed = await getSharedRuntime().listSessions(cwd, sessionDir);
				return listed.map((session) => ({ sessionId: session.id, path: session.path, cwd: session.cwd }));
			},
			readWorkingDirectory: (sessionId) => getSharedRuntime().readSessionWorkingDirectory(sessionId),
			getSessionPath: (sessionId) => getSharedRuntime().getSessionPath(sessionId),
		},
		project: {
			exists: async (path, projectRoot) => {
				if (projectRoot) allowProjectRoot(projectRoot);
				if (isSshProjectUri(path)) {
					return (await statFilesystemPath(path)) !== null;
				}
				return store.exists(path);
			},
			read: async (path, projectRoot) => {
				if (projectRoot) allowProjectRoot(projectRoot);
				if (isSshProjectUri(path)) {
					const file = await readFilesystemFile(path);
					return file.encoding === "utf8" ? file.content : undefined;
				}
				return store.readContent(path);
			},
			write: async (path, content, projectRoot) => {
				if (projectRoot) allowProjectRoot(projectRoot);
				await writeFilesystemFile(path, content, "utf8");
			},
		},
		listOwnership: async () => {
			const records = await conversationOwnershipCatalog.list();
			return records.map(
				(record): CanvasOwnershipRecord => ({
					sessionPath: record.sessionPath,
					...(record.workspaceId ? { workspaceId: record.workspaceId } : {}),
					...(record.cwd ? { cwd: record.cwd } : {}),
				}),
			);
		},
		readConversationText: async (path) => {
			try {
				return await readFile(path, "utf8");
			} catch {
				return undefined;
			}
		},
	});
}
