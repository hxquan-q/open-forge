// Copyright The Open Forge contributors.
import { createRequire } from "node:module";
import { isAllowedBrowserTabUrl } from "@vetta/coding-agent/function-extensions";
import type {
	DesktopBrowserViewBounds,
	DesktopBrowserViewControlAction,
	DesktopBrowserViewEventEnvelope,
	DesktopBrowserViewState,
} from "../../shared/browser-view-ipc.js";
import { IN_APP_BROWSER_PARTITION } from "./webview-session-controller.js";
import { bindInAppBrowserViewContents } from "./webview-session-host.js";

/** Electron WebContentsView 的最小面，测试用 fake 注入。 */
export interface BrowserViewHandle {
	readonly webContents: BrowserViewContents;
	setBounds(bounds: DesktopBrowserViewBounds): void;
	setVisible(visible: boolean): void;
}

export interface BrowserViewContents {
	readonly id: number;
	isDestroyed(): boolean;
	getURL(): string;
	getTitle(): string;
	loadURL(url: string): Promise<void>;
	goBack(): void;
	goForward(): void;
	reload(): void;
	stop(): void;
	canGoBack(): boolean;
	canGoForward(): boolean;
	setIgnoreMouseEvents(ignore: boolean): void;
	setWindowOpenHandler(handler: (details: { url: string }) => { action: "deny" | "allow" }): void;
	on(event: string, listener: (...args: unknown[]) => void): void;
	once(event: string, listener: (...args: unknown[]) => void): void;
	executeJavaScript(code: string): Promise<unknown>;
	capturePage(rect?: { x: number; y: number; width: number; height: number }): Promise<unknown>;
}

export interface BrowserViewHostWindow {
	contentView: {
		addChildView(view: BrowserViewHandle): void;
		removeChildView(view: BrowserViewHandle): void;
	};
	isDestroyed(): boolean;
}

export type BrowserViewEventSink = (envelope: DesktopBrowserViewEventEnvelope) => void;

export interface BrowserViewHostDeps {
	readonly getWindow: () => BrowserViewHostWindow | null;
	readonly createView: () => BrowserViewHandle;
	readonly send: BrowserViewEventSink;
}

interface ViewRecord {
	readonly view: BrowserViewHandle;
	attached: boolean;
	visible: boolean;
	loading: boolean;
	failed: boolean;
}

/**
 * 按 workspace 持有 WebContentsView 的内置浏览器宿主（TASK-0072）。
 * view 常驻存活（切 workspace 只摘不显式销毁），renderer 占位矩形经
 * bounds/visible 上报驱动摆放；导航与事件状态经 IPC 往返。
 */
export class InAppBrowserViewHost {
	private readonly views = new Map<string, ViewRecord>();

	constructor(private readonly deps: BrowserViewHostDeps) {}

	attach(request: {
		workspaceId: string;
		bounds: DesktopBrowserViewBounds;
		url?: string;
		visible?: boolean;
	}): DesktopBrowserViewState | null {
		const win = this.deps.getWindow();
		if (!win || win.isDestroyed()) return null;
		const record = this.ensureView(request.workspaceId);
		if (!record.attached) {
			win.contentView.addChildView(record.view);
			record.attached = true;
		}
		record.view.setBounds(request.bounds);
		record.visible = request.visible ?? true;
		record.view.setVisible(record.visible);
		const url = request.url?.trim();
		if (url && url !== record.view.webContents.getURL()) {
			void record.view.webContents.loadURL(url).catch(() => this.markFailed(record));
		}
		return this.stateOf(request.workspaceId, record);
	}

	setBounds(workspaceId: string, bounds: DesktopBrowserViewBounds): void {
		const record = this.views.get(workspaceId);
		if (!record || record.view.webContents.isDestroyed()) return;
		record.view.setBounds(bounds);
	}

	setVisible(workspaceId: string, visible: boolean): void {
		const record = this.views.get(workspaceId);
		if (!record || record.view.webContents.isDestroyed()) return;
		record.view.setVisible(visible);
		record.visible = visible;
	}

	detach(workspaceId: string): void {
		const record = this.views.get(workspaceId);
		if (!record) return;
		const win = this.deps.getWindow();
		if (record.attached && win && !win.isDestroyed()) win.contentView.removeChildView(record.view);
		record.view.setVisible(false);
		record.attached = false;
		record.visible = false;
	}

	async navigate(workspaceId: string, url: string): Promise<{ ok: true } | { ok: false; code: string }> {
		const record = this.views.get(workspaceId);
		if (!record || record.view.webContents.isDestroyed()) return { ok: false, code: "no_view" };
		if (!isAllowedBrowserTabUrl(url)) return { ok: false, code: "policy_denied" };
		try {
			await record.view.webContents.loadURL(url);
			return { ok: true };
		} catch {
			record.failed = true;
			record.loading = false;
			this.emit(workspaceId, record);
			return { ok: false, code: "load_failed" };
		}
	}

	control(workspaceId: string, action: DesktopBrowserViewControlAction): void {
		const contents = this.views.get(workspaceId)?.view.webContents;
		if (!contents || contents.isDestroyed()) return;
		switch (action) {
			case "back":
				if (contents.canGoBack()) contents.goBack();
				break;
			case "forward":
				if (contents.canGoForward()) contents.goForward();
				break;
			case "reload":
				contents.reload();
				break;
			case "stop":
				contents.stop();
				break;
		}
	}

	setInputPassthrough(workspaceId: string, passthrough: boolean): void {
		const contents = this.views.get(workspaceId)?.view.webContents;
		if (!contents || contents.isDestroyed()) return;
		contents.setIgnoreMouseEvents(passthrough);
	}

	getState(workspaceId: string): DesktopBrowserViewState | null {
		const record = this.views.get(workspaceId);
		if (!record || record.view.webContents.isDestroyed()) return null;
		return this.stateOf(workspaceId, record);
	}

	/** 窗口销毁/退出时清表；view 随窗口析构，仅丢引用并停发事件。 */
	disposeAll(): void {
		for (const record of this.views.values()) {
			record.attached = false;
			record.visible = false;
		}
		this.views.clear();
	}

	private ensureView(workspaceId: string): ViewRecord {
		const existing = this.views.get(workspaceId);
		if (existing && !existing.view.webContents.isDestroyed()) return existing;
		const view = this.deps.createView();
		const contents = view.webContents;
		// 与 webview 旧路径一致：window.open/target=_blank 不另开窗口，原地加载。
		contents.setWindowOpenHandler(({ url }) => {
			if (/^https?:\/\//i.test(url)) void contents.loadURL(url).catch(() => undefined);
			return { action: "deny" };
		});
		const record: ViewRecord = { view, attached: false, visible: false, loading: false, failed: false };
		this.views.set(workspaceId, record);
		this.wireContents(workspaceId, contents, record);
		// 会话控制器接线（revision/picker/DOM sentinel/快捷键），workspace 直连无竞态。
		// BrowserViewContents 是测试收窄面；生产路径传入的是真实 WebContents。
		bindInAppBrowserViewContents(
			contents as unknown as Parameters<typeof bindInAppBrowserViewContents>[0],
			workspaceId,
		);
		return record;
	}

	private wireContents(workspaceId: string, contents: BrowserViewContents, record: ViewRecord): void {
		const emit = (): void => this.emit(workspaceId, record);
		contents.on("did-start-loading", () => {
			record.loading = true;
			record.failed = false;
			emit();
		});
		contents.on("did-stop-loading", emit);
		const onNavigate = (): void => {
			record.failed = false;
			record.loading = false;
			emit();
		};
		contents.on("did-navigate", onNavigate);
		contents.on("did-navigate-in-page", (_event: unknown, _url: unknown, isMainFrame?: unknown) => {
			if (isMainFrame !== false) onNavigate();
		});
		contents.on(
			"did-fail-load",
			(_event: unknown, errorCode?: unknown, _desc?: unknown, _url?: unknown, isMainFrame?: unknown) => {
				// errorCode -3 (ABORTED) 多为重定向/手动停止，非真实失败。
				if (isMainFrame !== false && errorCode !== -3) {
					record.loading = false;
					record.failed = true;
					emit();
				}
			},
		);
		contents.once("destroyed", () => {
			record.attached = false;
			record.visible = false;
		});
	}

	private markFailed(record: ViewRecord): void {
		record.failed = true;
		record.loading = false;
	}

	private stateOf(workspaceId: string, record: ViewRecord): DesktopBrowserViewState {
		const contents = record.view.webContents;
		return {
			workspaceId,
			url: contents.getURL(),
			title: contents.getTitle(),
			canBack: contents.canGoBack(),
			canForward: contents.canGoForward(),
			loading: record.loading,
			failed: record.failed,
		};
	}

	private emit(workspaceId: string, record: ViewRecord): void {
		if (record.view.webContents.isDestroyed()) return;
		this.deps.send({ workspaceId, state: this.stateOf(workspaceId, record) });
	}
}

let sharedHost: InAppBrowserViewHost | undefined;
let viewEventSink: BrowserViewEventSink = () => undefined;

export function setInAppBrowserViewEventSink(sink: BrowserViewEventSink): void {
	viewEventSink = sink;
}

const lazyRequire = createRequire(import.meta.url);

function createRealBrowserView(): BrowserViewHandle {
	// 延迟加载 electron：host 单测不拉起 Electron 运行时。
	const { WebContentsView } = lazyRequire("electron") as typeof import("electron");
	return new WebContentsView({
		webPreferences: {
			partition: IN_APP_BROWSER_PARTITION,
			contextIsolation: true,
			nodeIntegration: false,
		},
	}) as unknown as BrowserViewHandle;
}

export function getInAppBrowserViewHost(): InAppBrowserViewHost {
	sharedHost ??= new InAppBrowserViewHost({
		getWindow: () => {
			// 延迟 import 同因：保持模块可在 node 测试环境载入。
			const { getMainWindow } = lazyRequire("../window-manager.js") as typeof import("../window-manager.js");
			return getMainWindow() as unknown as BrowserViewHostWindow | null;
		},
		createView: createRealBrowserView,
		send: (envelope) => viewEventSink(envelope),
	});
	return sharedHost;
}

export function resetInAppBrowserViewHostForTests(): void {
	sharedHost = undefined;
	viewEventSink = () => undefined;
}
