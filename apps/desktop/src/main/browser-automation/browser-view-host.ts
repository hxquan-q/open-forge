// Copyright The Open Forge contributors.
import { isAllowedBrowserTabUrl } from "@vetta/coding-agent/function-extensions";
import { isReportableBrowserViewBounds } from "../../shared/browser-view-bounds.js";
import type {
	DesktopBrowserViewBounds,
	DesktopBrowserViewControlAction,
	DesktopBrowserViewEventEnvelope,
	DesktopBrowserViewState,
} from "../../shared/browser-view-ipc.js";
import { bindInAppBrowserViewContents } from "./webview-session-host.js";

/**
 * `loadURL` 在导航被后继导航取代或手动停止时以 `ERR_ABORTED (-3)` 拒绝，
 * 与 `did-fail-load` 的 -3 同义：那是让位，不是加载失败。
 */
function isAbortedNavigation(error: unknown): boolean {
	const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
	return /\bERR_ABORTED\b|\(-3\)/.test(message);
}

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
	/** Electron 39 起导航历史挂在 contents.navigationHistory，旧 goBack/canGoBack 直属方法已废弃。 */
	readonly navigationHistory: {
		canGoBack(): boolean;
		canGoForward(): boolean;
		goBack(): void;
		goForward(): void;
	};
	reload(): void;
	stop(): void;
	setWindowOpenHandler(handler: (details: { url: string }) => { action: "deny" | "allow" }): void;
	on(event: string, listener: (...args: unknown[]) => void): void;
	once(event: string, listener: (...args: unknown[]) => void): void;
	executeJavaScript(code: string): Promise<unknown>;
	capturePage(rect?: { x: number; y: number; width: number; height: number }): Promise<unknown>;
	close(): void;
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
	/** 拖拽期指针穿透：为 true 时原生 view 暂时隐去，事件落到 DOM 兜底 overlay。 */
	passthrough: boolean;
	loading: boolean;
	failed: boolean;
	/** 已经发出、getURL() 尚未落到该地址的目标。重复 attach 同一地址不再 loadURL。 */
	pendingUrl: string | null;
	/** 最近使用的单调序号（attach/detach 时刷新），detached 驱逐按它取最老。 */
	lastUsedAt: number;
}

/** 非活动 view 上限：对齐 TASK-0039 插件 pinned 页签同型（每个 view 是一个独立渲染进程）。 */
const MAX_DETACHED_BROWSER_VIEWS = 3;

/**
 * 按 workspace 持有 WebContentsView 的内置浏览器宿主（TASK-0072）。
 * view 常驻存活但有界：detached 数超过上限时按最近使用驱逐销毁
 * （BUG-0094），被逐工作区重新 attach 时由 renderer 携带的 URL 自动重建；
 * renderer 占位矩形经 bounds/visible 上报驱动摆放；导航与事件状态经 IPC 往返。
 */
export class InAppBrowserViewHost {
	private readonly views = new Map<string, ViewRecord>();
	private lastUsedSeq = 0;

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
		this.applyBounds(record, request.bounds);
		record.visible = request.visible ?? true;
		record.passthrough = false;
		record.lastUsedAt = ++this.lastUsedSeq;
		this.applyVisible(record);
		const url = request.url?.trim();
		if (url && this.shouldStartLoad(record, url)) this.startLoad(request.workspaceId, record, url);
		this.enforceDetachedLimit();
		return this.stateOf(request.workspaceId, record);
	}

	setBounds(workspaceId: string, bounds: DesktopBrowserViewBounds): void {
		const record = this.views.get(workspaceId);
		if (!record || record.view.webContents.isDestroyed()) return;
		this.applyBounds(record, bounds);
	}

	setVisible(workspaceId: string, visible: boolean): void {
		const record = this.views.get(workspaceId);
		if (!record || record.view.webContents.isDestroyed()) return;
		record.visible = visible;
		this.applyVisible(record);
	}

	detach(workspaceId: string): void {
		const record = this.views.get(workspaceId);
		if (!record) return;
		const win = this.deps.getWindow();
		if (record.attached && win && !win.isDestroyed()) win.contentView.removeChildView(record.view);
		record.view.setVisible(false);
		record.attached = false;
		record.visible = false;
		record.lastUsedAt = ++this.lastUsedSeq;
		this.enforceDetachedLimit();
	}

	async navigate(workspaceId: string, url: string): Promise<{ ok: true } | { ok: false; code: string }> {
		const record = this.views.get(workspaceId);
		if (!record || record.view.webContents.isDestroyed()) return { ok: false, code: "no_view" };
		if (!isAllowedBrowserTabUrl(url)) return { ok: false, code: "policy_denied" };
		if (!this.shouldStartLoad(record, url)) return { ok: true };
		record.pendingUrl = url;
		try {
			await record.view.webContents.loadURL(url);
			if (record.pendingUrl === url) record.pendingUrl = null;
			return { ok: true };
		} catch (error) {
			if (record.pendingUrl === url) record.pendingUrl = null;
			if (isAbortedNavigation(error)) return { ok: true };
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
				if (contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
				break;
			case "forward":
				if (contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
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
		const record = this.views.get(workspaceId);
		if (!record || record.view.webContents.isDestroyed()) return;
		record.passthrough = passthrough;
		this.applyVisible(record);
	}

	/**
	 * 实际可见性 = 请求可见且不在穿透期。Electron 没有 per-view 的 ignore-mouse
	 * API（`setIgnoreMouseEvents` 只在 `BaseWindow`/`BrowserWindow` 上，
	 * `WebContentsView`/`View`/`WebContents` 均无，electron#23863 未实现）；
	 * 窗口级 ignore+forward 会把真实点击泄漏给下层应用窗口。拖拽期暂时隐去
	 * 原生 view 是唯一安全的让位手段：页面保活不销毁，DOM 兜底 overlay 自然
	 * 收到掠过该区域的事件（BUG-0086）。
	 */
	private applyVisible(record: ViewRecord): void {
		record.view.setVisible(record.visible && !record.passthrough);
	}

	/**
	 * detached view 上限执行：attached 永不驱逐；已 destroyed 的条目直接清表；
	 * 超限按 lastUsedAt 升序销毁最老的。`webContents.close()` 触发 `destroyed`，
	 * webview-session-host 已接线自动解绑会话控制器，无悬挂引用。
	 */
	private enforceDetachedLimit(): void {
		const detached: [string, ViewRecord][] = [];
		for (const [workspaceId, record] of this.views) {
			if (record.attached) continue;
			if (record.view.webContents.isDestroyed()) {
				this.views.delete(workspaceId);
				continue;
			}
			detached.push([workspaceId, record]);
		}
		detached.sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt);
		while (detached.length > MAX_DETACHED_BROWSER_VIEWS) {
			const [workspaceId, record] = detached.shift() as [string, ViewRecord];
			this.views.delete(workspaceId);
			record.view.webContents.close();
		}
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
			if (/^(https?|file):/i.test(url)) void contents.loadURL(url).catch(() => undefined);
			return { action: "deny" };
		});
		const record: ViewRecord = {
			view,
			attached: false,
			visible: false,
			passthrough: false,
			loading: false,
			failed: false,
			pendingUrl: null,
			lastUsedAt: 0,
		};
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

	/** 隐藏页签的 0×0 不能覆盖上一次有效矩形，否则视图被压扁后停在错误位置。 */
	private applyBounds(record: ViewRecord, bounds: DesktopBrowserViewBounds): void {
		if (!isReportableBrowserViewBounds(bounds)) return;
		record.view.setBounds(bounds);
	}

	/** getURL() 还停在 about:blank 时，在途的同一地址不能再 loadURL，否则会把首载中止。 */
	private shouldStartLoad(record: ViewRecord, url: string): boolean {
		if (url === record.view.webContents.getURL()) return false;
		return url !== record.pendingUrl;
	}

	private startLoad(workspaceId: string, record: ViewRecord, url: string): void {
		record.pendingUrl = url;
		void record.view.webContents.loadURL(url).then(
			() => {
				if (record.pendingUrl === url) record.pendingUrl = null;
			},
			(error: unknown) => {
				if (record.pendingUrl !== url) return;
				record.pendingUrl = null;
				this.onLoadRejected(workspaceId, record, error);
			},
		);
	}

	/**
	 * `loadURL` 的拒绝与 `did-fail-load` 是同一件事的两个出口：后者已在监听里
	 * 过滤 -3，这里同样把「被后继导航取代/手动停止」当成正常让位。真实失败此前
	 * 只改内部标记不发事件，renderer 永远收不到失败态，故补 emit。
	 */
	private onLoadRejected(workspaceId: string, record: ViewRecord, error: unknown): void {
		if (isAbortedNavigation(error)) return;
		record.failed = true;
		record.loading = false;
		this.emit(workspaceId, record);
	}

	private stateOf(workspaceId: string, record: ViewRecord): DesktopBrowserViewState {
		const contents = record.view.webContents;
		return {
			workspaceId,
			url: contents.getURL(),
			title: contents.getTitle(),
			canBack: contents.navigationHistory.canGoBack(),
			canForward: contents.navigationHistory.canGoForward(),
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
let runtimeDeps: InAppBrowserViewHostRuntime | undefined;

export function setInAppBrowserViewEventSink(sink: BrowserViewEventSink): void {
	viewEventSink = sink;
}

/** 宿主自身拿不到的两项主进程依赖（窗口读取、view 构造），由装配点注入。 */
export interface InAppBrowserViewHostRuntime {
	readonly getWindow: () => BrowserViewHostWindow | null;
	readonly createView: () => BrowserViewHandle;
}

/**
 * 生产装配点（主进程入口注册 IPC 时调用一次）。窗口读取与 `WebContentsView`
 * 构造都必须来自静态 import 的模块：main 进程是单文件 bundle，
 * `createRequire(import.meta.url)("../window-manager.js")` 这类运行时相对路径
 * 会解析到 dist/ 根并抛「Cannot find module」，attach 整条链路随之失效（BUG-0050）。
 */
export function configureInAppBrowserViewHostDeps(deps: InAppBrowserViewHostRuntime): void {
	runtimeDeps = deps;
}

function requireRuntimeDeps(): InAppBrowserViewHostRuntime {
	if (!runtimeDeps) {
		throw new Error(
			"in-app browser view host is not configured: call configureInAppBrowserViewHostDeps at main startup",
		);
	}
	return runtimeDeps;
}

export function getInAppBrowserViewHost(): InAppBrowserViewHost {
	sharedHost ??= new InAppBrowserViewHost({
		getWindow: () => requireRuntimeDeps().getWindow(),
		createView: () => requireRuntimeDeps().createView(),
		send: (envelope) => viewEventSink(envelope),
	});
	return sharedHost;
}

export function resetInAppBrowserViewHostForTests(): void {
	sharedHost = undefined;
	viewEventSink = () => undefined;
	runtimeDeps = undefined;
}
