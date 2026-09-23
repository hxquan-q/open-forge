// Copyright The Open Forge contributors.
import { ipcMain } from "electron";
import {
	CANVAS_CHANNELS,
	type DesktopCanvasDeleteRequest,
	type DesktopCanvasDeleteResult,
	type DesktopCanvasFailure,
	type DesktopCanvasGetRequest,
	type DesktopCanvasGetResult,
	type DesktopCanvasListRequest,
	type DesktopCanvasListResult,
	type DesktopCanvasSaveToProjectRequest,
	type DesktopCanvasSaveToProjectResult,
} from "../../shared/canvas-ipc.js";
import type { CanvasArtifactService, CanvasArtifactView } from "../artifacts/canvas-artifact-service.js";

const CHANNELS = CANVAS_CHANNELS;

export type CanvasIpcHost = Pick<
	CanvasArtifactService,
	"listWorkspace" | "getWorkspace" | "saveToProject" | "deleteWorkspaceArtifact"
>;

export interface RegisterCanvasIpcOptions {
	readonly host?: CanvasIpcHost;
}

/** Canvas artifact IPC：业务在 CanvasArtifactService；此处只做校验与结果映射。 */
export function registerCanvasIpc(options: RegisterCanvasIpcOptions = {}): () => void {
	const resolveHost = async (): Promise<CanvasIpcHost> => {
		if (options.host) return options.host;
		const { getDesktopCanvasArtifactService } = await import("../artifacts/canvas-artifact-desktop.js");
		return getDesktopCanvasArtifactService();
	};

	ipcMain.handle(CHANNELS.LIST, async (_event, request: unknown): Promise<DesktopCanvasListResult> => {
		const parsed = readListRequest(request);
		if (!parsed) return invalidInput("workspaceId is required");
		try {
			const items = await (await resolveHost()).listWorkspace(parsed.workspaceId);
			return { ok: true, items: items.map(toView) };
		} catch (error) {
			return failureFromUnknown(error);
		}
	});
	ipcMain.handle(CHANNELS.GET, async (_event, request: unknown): Promise<DesktopCanvasGetResult> => {
		const parsed = readGetRequest(request);
		if (!parsed) return invalidInput("workspaceId and artifactId are required");
		try {
			const result = await (await resolveHost()).getWorkspace(parsed.workspaceId, parsed.artifactId, parsed.version);
			if (!result.ok) return toFailure(result);
			return {
				ok: true,
				view: toView(result.view),
				content: result.content,
				...(result.contentType ? { contentType: result.contentType } : {}),
			};
		} catch (error) {
			return failureFromUnknown(error);
		}
	});
	ipcMain.handle(
		CHANNELS.SAVE_TO_PROJECT,
		async (_event, request: unknown): Promise<DesktopCanvasSaveToProjectResult> => {
			const parsed = readSaveRequest(request);
			if (!parsed) return invalidInput("workspaceId, artifactId and targetPath are required");
			try {
				const result = await (await resolveHost()).saveToProject(
					parsed.workspaceId,
					parsed.artifactId,
					parsed.targetPath,
				);
				if (!result.ok) return toFailure(result);
				return { ok: true, descriptor: result.descriptor };
			} catch (error) {
				return failureFromUnknown(error);
			}
		},
	);
	ipcMain.handle(CHANNELS.DELETE, async (_event, request: unknown): Promise<DesktopCanvasDeleteResult> => {
		const parsed = readDeleteRequest(request);
		if (!parsed) return invalidInput("workspaceId and artifactId are required");
		try {
			await (await resolveHost()).deleteWorkspaceArtifact(parsed.workspaceId, parsed.artifactId);
			return { ok: true };
		} catch (error) {
			return failureFromUnknown(error);
		}
	});
	return () => {
		ipcMain.removeHandler(CHANNELS.LIST);
		ipcMain.removeHandler(CHANNELS.GET);
		ipcMain.removeHandler(CHANNELS.SAVE_TO_PROJECT);
		ipcMain.removeHandler(CHANNELS.DELETE);
	};
}

function toView(view: CanvasArtifactView) {
	return {
		descriptor: view.descriptor,
		missing: view.missing,
		externalUpdate: view.externalUpdate,
	};
}

function readListRequest(value: unknown): DesktopCanvasListRequest | undefined {
	if (!isRecord(value)) return undefined;
	const workspaceId = readRequiredString(value.workspaceId);
	return workspaceId ? { workspaceId } : undefined;
}

function readGetRequest(value: unknown): DesktopCanvasGetRequest | undefined {
	if (!isRecord(value)) return undefined;
	const workspaceId = readRequiredString(value.workspaceId);
	const artifactId = readRequiredString(value.artifactId);
	if (!workspaceId || !artifactId) return undefined;
	const version = value.version;
	if (version !== undefined && (!Number.isInteger(version) || Number(version) < 1)) return undefined;
	return {
		workspaceId,
		artifactId,
		...(typeof version === "number" ? { version } : {}),
	};
}

function readSaveRequest(value: unknown): DesktopCanvasSaveToProjectRequest | undefined {
	if (!isRecord(value)) return undefined;
	const workspaceId = readRequiredString(value.workspaceId);
	const artifactId = readRequiredString(value.artifactId);
	const targetPath = readRequiredString(value.targetPath);
	if (!workspaceId || !artifactId || !targetPath) return undefined;
	return { workspaceId, artifactId, targetPath };
}

function readDeleteRequest(value: unknown): DesktopCanvasDeleteRequest | undefined {
	if (!isRecord(value)) return undefined;
	const workspaceId = readRequiredString(value.workspaceId);
	const artifactId = readRequiredString(value.artifactId);
	if (!workspaceId || !artifactId) return undefined;
	return { workspaceId, artifactId };
}

function readRequiredString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function invalidInput(message: string): DesktopCanvasFailure {
	return { ok: false, code: "invalid_input", message };
}

function toFailure(error: { readonly code: string; readonly message: string }): DesktopCanvasFailure {
	if (
		error.code === "missing_file" ||
		error.code === "conflict" ||
		error.code === "invalid_input" ||
		error.code === "cancelled" ||
		error.code === "stale_version"
	) {
		return { ok: false, code: error.code, message: error.message };
	}
	return { ok: false, code: "invalid_input", message: error.message };
}

function failureFromUnknown(error: unknown): DesktopCanvasFailure {
	const message = error instanceof Error ? error.message : "canvas request failed";
	if (/invalid artifactId/i.test(message) || /workspaceId is required/i.test(message)) {
		return { ok: false, code: "invalid_input", message };
	}
	return { ok: false, code: "invalid_input", message };
}
