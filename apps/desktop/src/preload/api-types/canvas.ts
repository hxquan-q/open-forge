// Copyright The Open Forge contributors.
import type {
	DesktopCanvasDeleteRequest,
	DesktopCanvasDeleteResult,
	DesktopCanvasGetRequest,
	DesktopCanvasGetResult,
	DesktopCanvasListRequest,
	DesktopCanvasListResult,
	DesktopCanvasOpenInBrowserRequest,
	DesktopCanvasOpenInBrowserResult,
	DesktopCanvasSaveToProjectRequest,
	DesktopCanvasSaveToProjectResult,
	DesktopCanvasUpdateRequest,
	DesktopCanvasUpdateResult,
} from "../../shared/canvas-ipc.js";

export interface DesktopCanvasApi {
	list: (request: DesktopCanvasListRequest) => Promise<DesktopCanvasListResult>;
	get: (request: DesktopCanvasGetRequest) => Promise<DesktopCanvasGetResult>;
	update: (request: DesktopCanvasUpdateRequest) => Promise<DesktopCanvasUpdateResult>;
	openInBrowser: (request: DesktopCanvasOpenInBrowserRequest) => Promise<DesktopCanvasOpenInBrowserResult>;
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
	DesktopCanvasOpenInBrowserRequest,
	DesktopCanvasOpenInBrowserResult,
	DesktopCanvasSaveToProjectRequest,
	DesktopCanvasSaveToProjectResult,
	DesktopCanvasUpdateRequest,
	DesktopCanvasUpdateResult,
} from "../../shared/canvas-ipc.js";
