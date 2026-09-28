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
	type DesktopCanvasOpenInBrowserRequest,
	type DesktopCanvasOpenInBrowserResult,
	type DesktopCanvasSaveToProjectRequest,
	type DesktopCanvasSaveToProjectResult,
	type DesktopCanvasUpdateRequest,
	type DesktopCanvasUpdateResult,
} from "../../shared/canvas-ipc.js";
import type { CanvasArtifactService, CanvasArtifactView } from "../artifacts/canvas-artifact-service.js";
import type { OpenCanvasPreviewResult } from "../canvas-server/canvas-preview-desktop.js";

const CHANNELS = CANVAS_CHANNELS;

/**
 * 本进程是否起过回环预览伺服。伺服是应用级单例（画布根归主进程所有），这个标记
 * 只用来避免从没打开过预览时也去加载伺服模块。
 */
let previewServerUsed = false;

export type CanvasIpcHost = Pick<
	CanvasArtifactService,
	"listWorkspace" | "getWorkspace" | "applyUpdate" | "saveToProject" | "deleteWorkspaceArtifact"
>;

/** 用户写入没有会话上下文：中止信号由调用方给出，IPC 路径只做即时应答。 */
const NEVER_ABORTED = new AbortController().signal;

/** 「在浏览器打开」的实际实现；测试注入替身，生产走懒加载的桌面伺服。 */
export type CanvasPreviewOpener = (input: {
	readonly workspaceId: string;
	readonly artifactId: string;
}) => Promise<OpenCanvasPreviewResult>;

export interface RegisterCanvasIpcOptions {
	readonly host?: CanvasIpcHost;
	readonly preview?: CanvasPreviewOpener;
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
	ipcMain.handle(CHANNELS.UPDATE, async (_event, request: unknown): Promise<DesktopCanvasUpdateResult> => {
		const parsed = readUpdateRequest(request);
		if (!parsed) return invalidInput("workspaceId, artifactId, baseVersion and content are required");
		try {
			const outcome = await (await resolveHost()).applyUpdate({
				workspaceId: parsed.workspaceId,
				artifactId: parsed.artifactId,
				baseVersion: parsed.baseVersion,
				content: parsed.content,
				...(parsed.title ? { title: parsed.title } : {}),
				signal: NEVER_ABORTED,
			});
			if (!outcome.ok) return toFailure(outcome.error);
			return { ok: true, descriptor: outcome.descriptor };
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
	ipcMain.handle(
		CHANNELS.OPEN_IN_BROWSER,
		async (_event, request: unknown): Promise<DesktopCanvasOpenInBrowserResult> => {
			const parsed = readOpenInBrowserRequest(request);
			if (!parsed) return invalidInput("workspaceId and artifactId are required");
			try {
				let open = options.preview;
				if (!open) {
					// 延迟加载：伺服模块连着本地端口与日志，不该进单测进程。
					previewServerUsed = true;
					open = (await import("../canvas-server/canvas-preview-desktop.js")).openCanvasArtifactPreviewInBrowser;
				}
				const result = await open(parsed);
				if (!result.ok) return { ok: false, code: result.code, message: result.message };
				return { ok: true, url: result.url };
			} catch (error) {
				return failureFromUnknown(error);
			}
		},
	);
	return () => {
		ipcMain.removeHandler(CHANNELS.LIST);
		ipcMain.removeHandler(CHANNELS.GET);
		ipcMain.removeHandler(CHANNELS.UPDATE);
		ipcMain.removeHandler(CHANNELS.SAVE_TO_PROJECT);
		ipcMain.removeHandler(CHANNELS.DELETE);
		ipcMain.removeHandler(CHANNELS.OPEN_IN_BROWSER);
		// 预览页只属于这个窗口：窗口关闭即释放监听端口，不留后台服务。
		if (previewServerUsed) {
			previewServerUsed = false;
			void import("../canvas-server/canvas-preview-desktop.js")
				.then(({ disposeCanvasPreviewServer }) => disposeCanvasPreviewServer())
				.catch(() => undefined);
		}
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

function readUpdateRequest(value: unknown): DesktopCanvasUpdateRequest | undefined {
	if (!isRecord(value)) return undefined;
	const workspaceId = readRequiredString(value.workspaceId);
	const artifactId = readRequiredString(value.artifactId);
	// 正文允许空字符串（用户清空 artifact），所以这里只校验类型。
	const content = typeof value.content === "string" ? value.content : undefined;
	const baseVersion = value.baseVersion;
	if (!workspaceId || !artifactId || content === undefined) return undefined;
	if (typeof baseVersion !== "number" || !Number.isInteger(baseVersion) || baseVersion < 1) return undefined;
	const title = readRequiredString(value.title);
	return { workspaceId, artifactId, baseVersion, content, ...(title ? { title } : {}) };
}

function readDeleteRequest(value: unknown): DesktopCanvasDeleteRequest | undefined {
	return readArtifactRefRequest(value);
}

function readOpenInBrowserRequest(value: unknown): DesktopCanvasOpenInBrowserRequest | undefined {
	return readArtifactRefRequest(value);
}

/** DELETE 与「在浏览器打开」只要同一组标识；空字符串视为缺失。 */
function readArtifactRefRequest(
	value: unknown,
): { readonly workspaceId: string; readonly artifactId: string } | undefined {
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
