// Copyright The Open Forge contributors.

/**
 * 内置浏览器 WebContentsView 宿主 IPC（TASK-0072）。
 * guest 从 renderer `<webview>` 迁为主进程持有的 WebContentsView：
 * renderer 只上报占位矩形的 bounds/可见性与导航意图，主进程负责
 * view 创建、挂窗、尺寸跟随与导航状态回推。
 */
export const BROWSER_VIEW_CHANNELS = {
	ATTACH: "vetta:browser-view:attach",
	UPDATE: "vetta:browser-view:update",
	DETACH: "vetta:browser-view:detach",
	NAVIGATE: "vetta:browser-view:navigate",
	CONTROL: "vetta:browser-view:control",
	PASSTHROUGH: "vetta:browser-view:passthrough",
	EVENT: "vetta:browser-view:event",
} as const;

export interface DesktopBrowserViewBounds {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export interface DesktopBrowserViewAttachRequest {
	readonly workspaceId: string;
	readonly bounds: DesktopBrowserViewBounds;
	readonly url?: string;
	/** 挂载时已知不可见（隐藏 tab/空态）时传 false，避免原生 view 闪一帧。 */
	readonly visible?: boolean;
}

export interface DesktopBrowserViewUpdateRequest {
	readonly workspaceId: string;
	readonly bounds?: DesktopBrowserViewBounds;
	readonly visible?: boolean;
}

export interface DesktopBrowserViewDetachRequest {
	readonly workspaceId: string;
}

export interface DesktopBrowserViewNavigateRequest {
	readonly workspaceId: string;
	readonly url: string;
}

export type DesktopBrowserViewControlAction = "back" | "forward" | "reload" | "stop";

export interface DesktopBrowserViewControlRequest {
	readonly workspaceId: string;
	readonly action: DesktopBrowserViewControlAction;
}

/**
 * 面板分栏拖拽期间把 guest 设为指针穿透：view 是原生图层，
 * DOM overlay 挡不住它，必须让事件落到主渲染进程的拖拽兜底层。
 */
export interface DesktopBrowserViewPassthroughRequest {
	readonly workspaceId: string;
	readonly passthrough: boolean;
}

export interface DesktopBrowserViewState {
	readonly workspaceId: string;
	readonly url: string;
	readonly title: string;
	readonly canBack: boolean;
	readonly canForward: boolean;
	readonly loading: boolean;
	readonly failed: boolean;
}

export interface DesktopBrowserViewEventEnvelope {
	readonly workspaceId: string;
	readonly state: DesktopBrowserViewState;
}

export type DesktopBrowserViewAttachResult =
	| { readonly ok: true; readonly state: DesktopBrowserViewState }
	| { readonly ok: false; readonly code: "no_window" };

export type DesktopBrowserViewNavigateResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly code: "no_view" | "policy_denied" | "load_failed" };
