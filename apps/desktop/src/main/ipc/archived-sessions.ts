// Copyright The Open Forge contributors.
import { ipcMain, type WebContents } from "electron";
import { ARCHIVED_SESSIONS_CHANGED_CHANNEL, type ArchivedSessionsSnapshot } from "../../shared/archived-sessions.js";
import {
	archiveSession,
	forgetArchivedSessions,
	listArchivedSessions,
	onArchivedSessionsChanged,
	unarchiveSession,
} from "../conversations/archived-sessions-store.js";

const CHANNELS = {
	LIST: "vetta:archived-sessions:list",
	ARCHIVE: "vetta:archived-sessions:archive",
	UNARCHIVE: "vetta:archived-sessions:unarchive",
	FORGET: "vetta:archived-sessions:forget",
} as const;

function asString(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function asOptionalString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

export function registerArchivedSessionsIpc(webContents: WebContents): () => void {
	ipcMain.handle(CHANNELS.LIST, () => listArchivedSessions());

	ipcMain.handle(CHANNELS.ARCHIVE, (_event, input: unknown) => {
		const raw = (input ?? {}) as Record<string, unknown>;
		return archiveSession({
			path: asString(raw.path),
			label: asOptionalString(raw.label),
			cwd: asOptionalString(raw.cwd),
			// 缺一不可由模型层统一裁定（normalizeArchiveTeam），这里只做类型收窄。
			teamId: asOptionalString(raw.teamId),
			teamSessionId: asOptionalString(raw.teamSessionId),
		});
	});

	ipcMain.handle(CHANNELS.UNARCHIVE, (_event, sessionPath: unknown) => unarchiveSession(asString(sessionPath)));

	ipcMain.handle(CHANNELS.FORGET, (_event, sessionPaths: unknown) =>
		forgetArchivedSessions(
			Array.isArray(sessionPaths) ? sessionPaths.filter((path): path is string => typeof path === "string") : [],
		),
	);

	const unsubscribe = onArchivedSessionsChanged((snapshot: ArchivedSessionsSnapshot) => {
		if (webContents.isDestroyed()) return;
		webContents.send(ARCHIVED_SESSIONS_CHANGED_CHANNEL, snapshot);
	});

	return () => {
		unsubscribe();
		for (const channel of Object.values(CHANNELS)) ipcMain.removeHandler(channel);
	};
}
