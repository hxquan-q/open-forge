// Copyright The Open Forge contributors.
import { ARTIFACT_KINDS, type ArtifactKind } from "@vetta/runtime-core/task";
import { ipcMain, type WebContents } from "electron";
import { TASK_CHANNELS } from "../../shared/task-ipc.js";
import { desktopDocumentExportService } from "../task-activity/document-export.js";
import { verifyArtifactResearchSources } from "../task-activity/research-source-verify.js";
import { type DesktopTaskCommand, desktopTaskActivityService } from "../task-activity/task-activity-service.js";

const CHANNELS = TASK_CHANNELS;

function asString(value: unknown): string {
	return typeof value === "string" ? value : "";
}

/** IPC 边界收窄：命令载荷是跨进程不可信输入。 */
export function parseCommand(value: unknown): DesktopTaskCommand | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const raw = value as Record<string, unknown>;
	const type = asString(raw.type);
	switch (type) {
		case "create":
			return { type, ...(typeof raw.title === "string" ? { title: raw.title } : {}) };
		case "cancel": {
			const taskId = asString(raw.taskId);
			if (!taskId) return undefined;
			return { type, taskId, ...(typeof raw.reason === "string" ? { reason: raw.reason } : {}) };
		}
		case "pause": {
			const taskId = asString(raw.taskId);
			return taskId ? { type, taskId } : undefined;
		}
		case "review": {
			const taskId = asString(raw.taskId);
			const decision = asString(raw.decision);
			if (!taskId) return undefined;
			if (decision !== "approved" && decision !== "changes_requested" && decision !== "rejected") return undefined;
			return { type, taskId, decision };
		}
		case "attach-artifact": {
			const taskId = asString(raw.taskId);
			const artifact = raw.artifact;
			if (typeof artifact !== "object" || artifact === null) return undefined;
			const artifactInput = artifact as Record<string, unknown>;
			const kind = asString(artifactInput.kind) as ArtifactKind;
			const title = asString(artifactInput.title);
			const uri = asString(artifactInput.uri);
			if (!taskId || !ARTIFACT_KINDS.includes(kind) || !title || !uri) return undefined;
			return {
				type,
				taskId,
				artifact: {
					kind,
					title,
					uri,
					...(typeof artifactInput.contentType === "string" ? { contentType: artifactInput.contentType } : {}),
				},
			};
		}
		default:
			return undefined;
	}
}

/** IPC 边界收窄：artifact 读取载荷。 */
export function parseArtifactRead(value: unknown): { sessionId: string; artifactId: string } | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const raw = value as Record<string, unknown>;
	const sessionId = asString(raw.sessionId);
	const artifactId = asString(raw.artifactId);
	return sessionId && artifactId ? { sessionId, artifactId } : undefined;
}

/** IPC 边界收窄：artifact 导出载荷。 */
export function parseArtifactExport(
	value: unknown,
): { sessionId: string; artifactId: string; suggestedFileName?: string } | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const raw = value as Record<string, unknown>;
	const sessionId = asString(raw.sessionId);
	const artifactId = asString(raw.artifactId);
	if (!sessionId || !artifactId) return undefined;
	return {
		sessionId,
		artifactId,
		...(typeof raw.suggestedFileName === "string" ? { suggestedFileName: raw.suggestedFileName } : {}),
	};
}

export function registerTaskIpc(_webContents: WebContents): () => void {
	ipcMain.handle(CHANNELS.GET_STATE, (_event, sessionId: unknown) =>
		desktopTaskActivityService.getState(asString(sessionId)),
	);
	ipcMain.handle(CHANNELS.GET_ARTIFACT_VIEWS, (_event, sessionId: unknown) =>
		desktopTaskActivityService.getArtifactViews(asString(sessionId)),
	);
	ipcMain.handle(CHANNELS.COMMAND, async (_event, input: unknown) => {
		if (typeof input !== "object" || input === null) {
			return { ok: false as const, code: "task_command_invalid", message: "invalid command payload" };
		}
		const raw = input as Record<string, unknown>;
		const sessionId = asString(raw.sessionId);
		const command = parseCommand(raw.command);
		if (!sessionId || !command) {
			return { ok: false as const, code: "task_command_invalid", message: "invalid command payload" };
		}
		return desktopTaskActivityService.runCommand(sessionId, command);
	});
	ipcMain.handle(CHANNELS.READ_ARTIFACT, (_event, input: unknown) => {
		const payload = parseArtifactRead(input);
		if (!payload) {
			return { status: "not-found" as const, artifactId: "" };
		}
		return desktopTaskActivityService.readArtifact(payload.sessionId, payload.artifactId);
	});
	ipcMain.handle(CHANNELS.VERIFY_ARTIFACT_SOURCES, (_event, input: unknown) => {
		const payload = parseArtifactRead(input);
		if (!payload) {
			return { status: "not-found" as const };
		}
		return verifyArtifactResearchSources(payload.sessionId, payload.artifactId);
	});
	ipcMain.handle(CHANNELS.EXPORT_ARTIFACT, (_event, input: unknown) => {
		const payload = parseArtifactExport(input);
		if (!payload) {
			return { status: "not-found" as const, artifactId: "" };
		}
		return desktopDocumentExportService.exportArtifact(
			payload.sessionId,
			payload.artifactId,
			payload.suggestedFileName,
		);
	});
	return () => {
		for (const channel of Object.values(CHANNELS)) ipcMain.removeHandler(channel);
	};
}
