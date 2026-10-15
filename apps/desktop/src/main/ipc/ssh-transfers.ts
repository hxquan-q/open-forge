// Modified by The Open Forge contributors.
import { dialog, ipcMain, type WebContents } from "electron";
import type { SshTransferConflictPolicy, SshTransferPlanInput } from "../../preload/api-types/ssh-transfers.js";
import { getSshFileTransferService } from "../ssh/ssh-file-transfer-service.js";

const SSH_TRANSFER_CHANNELS = {
	PLAN: "vetta:ssh-transfers:plan",
	COMMIT: "vetta:ssh-transfers:commit",
	CANCEL: "vetta:ssh-transfers:cancel",
	REMOVE: "vetta:ssh-transfers:remove",
	LIST: "vetta:ssh-transfers:list",
	SELECT_SOURCE: "vetta:ssh-transfers:select-source",
	SELECT_DOWNLOAD_DIR: "vetta:ssh-transfers:select-download-dir",
	EVENT: "vetta:ssh-transfers:event",
} as const;

export { SSH_TRANSFER_CHANNELS };

function asString(value: unknown): string {
	if (typeof value !== "string" || value.trim() === "") throw new Error("Expected a non-empty string");
	return value;
}

function asStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) throw new Error("Expected an array of paths");
	return value.map((item) => {
		if (typeof item !== "string" || item.trim() === "") throw new Error("Expected non-empty path strings");
		return item;
	});
}

function toPlanInput(raw: unknown): SshTransferPlanInput {
	if (typeof raw !== "object" || raw === null) throw new Error("Invalid transfer plan input");
	const input = raw as Record<string, unknown>;
	if (input.direction === "upload") {
		return {
			direction: "upload",
			remoteDirUri: asString(input.remoteDirUri),
			localPaths: asStringArray(input.localPaths),
		};
	}
	if (input.direction === "download") {
		return {
			direction: "download",
			remoteUris: asStringArray(input.remoteUris),
			localDir: asString(input.localDir),
		};
	}
	throw new Error(`Unsupported transfer direction: ${String(input.direction)}`);
}

function toConflictPolicy(value: unknown): SshTransferConflictPolicy {
	if (value === "replace" || value === "skip") return value;
	throw new Error(`Unsupported conflict policy: ${String(value)}`);
}

async function selectTransferSource(kind: "file" | "directory"): Promise<string[]> {
	const result = await dialog.showOpenDialog({
		properties: kind === "directory" ? ["openDirectory", "multiSelections"] : ["openFile", "multiSelections"],
		title: kind === "directory" ? "Select Folders to Upload" : "Select Files to Upload",
	});
	if (result.canceled || result.filePaths.length === 0) return [];
	return result.filePaths;
}

async function selectDownloadDirectory(): Promise<string | null> {
	const result = await dialog.showOpenDialog({ properties: ["openDirectory"], title: "Select Download Folder" });
	if (result.canceled || result.filePaths.length === 0) return null;
	return result.filePaths[0] ?? null;
}

export function registerSshTransfersIpc(webContents: WebContents): () => void {
	const transfers = getSshFileTransferService();
	const detachEventSink = transfers.attachEventSink((event) => {
		if (!webContents.isDestroyed()) webContents.send(SSH_TRANSFER_CHANNELS.EVENT, event);
	});
	ipcMain.handle(SSH_TRANSFER_CHANNELS.PLAN, (event, input: unknown) =>
		transfers.plan(toPlanInput(input), event.sender.id),
	);
	ipcMain.handle(SSH_TRANSFER_CHANNELS.COMMIT, (event, planId: unknown, policy: unknown) =>
		transfers.commit(asString(planId), toConflictPolicy(policy), event.sender.id),
	);
	ipcMain.handle(SSH_TRANSFER_CHANNELS.CANCEL, (_event, id: unknown) => transfers.cancel(asString(id)));
	ipcMain.handle(SSH_TRANSFER_CHANNELS.REMOVE, (_event, id: unknown) => transfers.remove(asString(id)));
	ipcMain.handle(SSH_TRANSFER_CHANNELS.LIST, () => transfers.list());
	ipcMain.handle(SSH_TRANSFER_CHANNELS.SELECT_SOURCE, (_event, kind: unknown) =>
		selectTransferSource(kind === "directory" ? "directory" : "file"),
	);
	ipcMain.handle(SSH_TRANSFER_CHANNELS.SELECT_DOWNLOAD_DIR, () => selectDownloadDirectory());

	return () => {
		detachEventSink();
		for (const channel of Object.values(SSH_TRANSFER_CHANNELS)) {
			if (channel !== SSH_TRANSFER_CHANNELS.EVENT) ipcMain.removeHandler(channel);
		}
	};
}
