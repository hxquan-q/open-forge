// Copyright The Open Forge contributors.
import type { ArtifactDescriptor, ArtifactKind } from "@vetta/runtime-core/task";
import { type DesktopIpcUnimplemented, unimplementedDesktopIpcResult } from "./desktop-ipc-result.js";

/** Canvas artifact 服务 IPC：main / preload 共用的唯一 channel 事实源。 */
export const CANVAS_CHANNELS = {
	LIST: "vetta:canvas:list",
	GET: "vetta:canvas:get",
	UPDATE: "vetta:canvas:update",
	OPEN_IN_BROWSER: "vetta:canvas:open-in-browser",
	SAVE_TO_PROJECT: "vetta:canvas:save-to-project",
	DELETE: "vetta:canvas:delete",
} as const;

export interface DesktopCanvasListRequest {
	readonly workspaceId: string;
}

export interface DesktopCanvasGetRequest {
	readonly workspaceId: string;
	readonly artifactId: string;
	readonly version?: number;
}

/**
 * 「在浏览器打开」：主进程按需在本机回环地址上起只读伺服，回一个可加载的地址。
 * 页面由内置 Browser Tab 承载，`<webview>` 预览沙箱基线不变。
 */
export interface DesktopCanvasOpenInBrowserRequest {
	readonly workspaceId: string;
	readonly artifactId: string;
}

export interface DesktopCanvasSaveToProjectRequest {
	readonly workspaceId: string;
	readonly artifactId: string;
	readonly targetPath: string;
}

/**
 * 用户就地编辑写入。`baseVersion` 是编辑器打开时看到的版本：落后或文件校验和不符
 * 一律回 `stale_version`，绝不覆盖 Agent / 外部的新版本。
 */
export interface DesktopCanvasUpdateRequest {
	readonly workspaceId: string;
	readonly artifactId: string;
	readonly baseVersion: number;
	readonly content: string;
	readonly title?: string;
}

export interface DesktopCanvasDeleteRequest {
	readonly workspaceId: string;
	readonly artifactId: string;
}

export interface DesktopCanvasArtifactView {
	readonly descriptor: ArtifactDescriptor;
	readonly missing: boolean;
	readonly externalUpdate: boolean;
}

export type DesktopCanvasErrorCode =
	| DesktopIpcUnimplemented["code"]
	| "missing_file"
	| "conflict"
	| "invalid_input"
	| "cancelled"
	| "stale_version";

export interface DesktopCanvasFailure {
	readonly ok: false;
	readonly code: DesktopCanvasErrorCode;
	readonly message: string;
}

export type DesktopCanvasListResult =
	| { readonly ok: true; readonly items: readonly DesktopCanvasArtifactView[] }
	| DesktopCanvasFailure;

export type DesktopCanvasGetResult =
	| {
			readonly ok: true;
			readonly view: DesktopCanvasArtifactView;
			readonly content: string;
			readonly contentType?: string;
	  }
	| DesktopCanvasFailure;

export type DesktopCanvasOpenInBrowserResult = { readonly ok: true; readonly url: string } | DesktopCanvasFailure;

export type DesktopCanvasSaveToProjectResult =
	| { readonly ok: true; readonly descriptor: ArtifactDescriptor }
	| DesktopCanvasFailure;

/** 成功回新版本的 descriptor；`stale_version` 表示编辑器基线落后，未写入任何文件。 */
export type DesktopCanvasUpdateResult =
	| { readonly ok: true; readonly descriptor: ArtifactDescriptor }
	| DesktopCanvasFailure;

export type DesktopCanvasDeleteResult = { readonly ok: true } | DesktopCanvasFailure;

export type { ArtifactKind };

export function unimplementedCanvasResult(): DesktopIpcUnimplemented {
	return unimplementedDesktopIpcResult("canvas");
}
