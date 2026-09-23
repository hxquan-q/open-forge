// Copyright The Open Forge contributors.
import type { ArtifactDescriptor, ArtifactKind } from "@vetta/runtime-core/task";
import { type DesktopIpcUnimplemented, unimplementedDesktopIpcResult } from "./desktop-ipc-result.js";

/** Canvas artifact 服务 IPC：main / preload 共用的唯一 channel 事实源。 */
export const CANVAS_CHANNELS = {
	LIST: "vetta:canvas:list",
	GET: "vetta:canvas:get",
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

export interface DesktopCanvasSaveToProjectRequest {
	readonly workspaceId: string;
	readonly artifactId: string;
	readonly targetPath: string;
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

export type DesktopCanvasSaveToProjectResult =
	| { readonly ok: true; readonly descriptor: ArtifactDescriptor }
	| DesktopCanvasFailure;

export type DesktopCanvasDeleteResult = { readonly ok: true } | DesktopCanvasFailure;

export type { ArtifactKind };

export function unimplementedCanvasResult(): DesktopIpcUnimplemented {
	return unimplementedDesktopIpcResult("canvas");
}
