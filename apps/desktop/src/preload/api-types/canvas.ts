// Copyright The Open Forge contributors.
import type {
	DesktopCanvasDeleteRequest,
	DesktopCanvasDeleteResult,
	DesktopCanvasGetRequest,
	DesktopCanvasGetResult,
	DesktopCanvasListRequest,
	DesktopCanvasListResult,
	DesktopCanvasSaveToProjectRequest,
	DesktopCanvasSaveToProjectResult,
	DesktopCanvasUpdateRequest,
	DesktopCanvasUpdateResult,
} from "../../shared/canvas-ipc.js";

export interface DesktopCanvasApi {
	list: (request: DesktopCanvasListRequest) => Promise<DesktopCanvasListResult>;
	get: (request: DesktopCanvasGetRequest) => Promise<DesktopCanvasGetResult>;
	update: (request: DesktopCanvasUpdateRequest) => Promise<DesktopCanvasUpdateResult>;
	saveToProject: (request: DesktopCanvasSaveToProjectRequest) => Promise<DesktopCanvasSaveToProjectResult>;
	delete: (request: DesktopCanvasDeleteRequest) => Promise<DesktopCanvasDeleteResult>;
}

export type {
	DesktopCanvasArtifactView,
	DesktopCanvasDeleteRequest,
	DesktopCanvasDeleteResult,
	DesktopCanvasGetRequest,
	DesktopCanvasGetResult,
	DesktopCanvasListRequest,
	DesktopCanvasListResult,
	DesktopCanvasSaveToProjectRequest,
	DesktopCanvasSaveToProjectResult,
	DesktopCanvasUpdateRequest,
	DesktopCanvasUpdateResult,
} from "../../shared/canvas-ipc.js";
