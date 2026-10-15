// Copyright The Open Forge contributors.
import type {
	DesktopBrowserViewAttachRequest,
	DesktopBrowserViewAttachResult,
	DesktopBrowserViewControlRequest,
	DesktopBrowserViewDetachRequest,
	DesktopBrowserViewEventEnvelope,
	DesktopBrowserViewNavigateRequest,
	DesktopBrowserViewNavigateResult,
	DesktopBrowserViewPassthroughRequest,
	DesktopBrowserViewUpdateRequest,
} from "../../shared/browser-view-ipc.js";

export interface DesktopBrowserViewApi {
	attach: (request: DesktopBrowserViewAttachRequest) => Promise<DesktopBrowserViewAttachResult>;
	update: (request: DesktopBrowserViewUpdateRequest) => Promise<void>;
	detach: (request: DesktopBrowserViewDetachRequest) => Promise<void>;
	navigate: (request: DesktopBrowserViewNavigateRequest) => Promise<DesktopBrowserViewNavigateResult>;
	control: (request: DesktopBrowserViewControlRequest) => Promise<void>;
	setInputPassthrough: (request: DesktopBrowserViewPassthroughRequest) => Promise<void>;
	onEvent: (listener: (envelope: DesktopBrowserViewEventEnvelope) => void) => () => void;
}

export type {
	DesktopBrowserViewAttachRequest,
	DesktopBrowserViewAttachResult,
	DesktopBrowserViewBounds,
	DesktopBrowserViewControlAction,
	DesktopBrowserViewControlRequest,
	DesktopBrowserViewDetachRequest,
	DesktopBrowserViewEventEnvelope,
	DesktopBrowserViewNavigateRequest,
	DesktopBrowserViewNavigateResult,
	DesktopBrowserViewPassthroughRequest,
	DesktopBrowserViewState,
	DesktopBrowserViewUpdateRequest,
} from "../../shared/browser-view-ipc.js";
