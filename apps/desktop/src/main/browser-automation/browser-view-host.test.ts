// Copyright The Open Forge contributors.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DesktopBrowserViewBounds, DesktopBrowserViewEventEnvelope } from "../../shared/browser-view-ipc.js";
import {
	type BrowserViewContents,
	type BrowserViewHandle,
	type BrowserViewHostWindow,
	configureInAppBrowserViewHostDeps,
	getInAppBrowserViewHost,
	InAppBrowserViewHost,
	resetInAppBrowserViewHostForTests,
} from "./browser-view-host.js";
import { resetInAppBrowserSessionControllerForTests } from "./webview-session-controller.js";

const BOUNDS: DesktopBrowserViewBounds = { x: 10, y: 20, width: 400, height: 300 };

class FakeContents implements BrowserViewContents {
	static nextId = 1;
	readonly id = FakeContents.nextId++;
	url = "about:blank";
	title = "";
	destroyed = false;
	back = false;
	forward = false;
	loads: string[] = [];
	reloads = 0;
	stops = 0;
	goBacks = 0;
	goForwards = 0;
	openHandler: ((d: { url: string }) => { action: string }) | null = null;
	private listeners = new Map<string, ((...args: unknown[]) => void)[]>();

	isDestroyed(): boolean {
		return this.destroyed;
	}
	getURL(): string {
		return this.url;
	}
	getTitle(): string {
		return this.title;
	}
	async loadURL(url: string): Promise<void> {
		this.loads.push(url);
		this.url = url;
	}
	goBack(): void {
		this.goBacks += 1;
	}
	goForward(): void {
		this.goForwards += 1;
	}
	reload(): void {
		this.reloads += 1;
	}
	stop(): void {
		this.stops += 1;
	}
	canGoBack(): boolean {
		return this.back;
	}
	canGoForward(): boolean {
		return this.forward;
	}
	setWindowOpenHandler(handler: (details: { url: string }) => { action: "deny" | "allow" }): void {
		this.openHandler = handler;
	}
	on(event: string, listener: (...args: unknown[]) => void): void {
		const list = this.listeners.get(event) ?? [];
		list.push(listener);
		this.listeners.set(event, list);
	}
	once(event: string, listener: (...args: unknown[]) => void): void {
		this.on(event, listener);
	}
	async executeJavaScript(): Promise<unknown> {
		return undefined;
	}
	async capturePage(): Promise<unknown> {
		return {};
	}
	fire(event: string, ...args: unknown[]): void {
		for (const listener of this.listeners.get(event) ?? []) listener(...args);
	}
}

class FakeView implements BrowserViewHandle {
	readonly webContents = new FakeContents();
	bounds: DesktopBrowserViewBounds | null = null;
	visible = false;
	setBounds(bounds: DesktopBrowserViewBounds): void {
		this.bounds = bounds;
	}
	setVisible(visible: boolean): void {
		this.visible = visible;
	}
}

class FakeWindow implements BrowserViewHostWindow {
	added: BrowserViewHandle[] = [];
	removed: BrowserViewHandle[] = [];
	destroyed = false;
	contentView = {
		addChildView: (view: BrowserViewHandle) => this.added.push(view),
		removeChildView: (view: BrowserViewHandle) => this.removed.push(view),
	};
	isDestroyed(): boolean {
		return this.destroyed;
	}
}

function makeHost() {
	const win = new FakeWindow();
	const views: FakeView[] = [];
	const events: DesktopBrowserViewEventEnvelope[] = [];
	const host = new InAppBrowserViewHost({
		getWindow: () => win,
		createView: () => {
			const view = new FakeView();
			views.push(view);
			return view;
		},
		send: (envelope) => events.push(envelope),
	});
	return { host, win, views, events };
}

beforeEach(() => {
	resetInAppBrowserSessionControllerForTests();
});

describe("InAppBrowserViewHost", () => {
	it("attach 按 workspace 建 view、挂窗、摆位并加载初始 URL；重复 attach 复用同一 view", async () => {
		const { host, win, views } = makeHost();
		const state = host.attach({ workspaceId: "ws-1", bounds: BOUNDS, url: "https://a.example" });
		expect(state?.workspaceId).toBe("ws-1");
		expect(views).toHaveLength(1);
		expect(win.added).toEqual([views[0]]);
		expect(views[0].bounds).toEqual(BOUNDS);
		expect(views[0].visible).toBe(true);
		await vi.waitFor(() => expect(views[0].webContents.loads).toEqual(["https://a.example"]));

		const again = host.attach({ workspaceId: "ws-1", bounds: { ...BOUNDS, x: 50 } });
		expect(views).toHaveLength(1);
		expect(win.added).toHaveLength(1);
		expect(views[0].bounds?.x).toBe(50);
		expect(again?.url).toBe("https://a.example");
	});

	it("attach 携带 visible:false 时挂窗但不显示（隐藏 tab/空态挂载不闪帧）", () => {
		const { host, win, views } = makeHost();
		host.attach({ workspaceId: "ws-1", bounds: BOUNDS, visible: false });
		expect(win.added).toEqual([views[0]]);
		expect(views[0].visible).toBe(false);
		// 后续可见性仍由 update 驱动
		host.setVisible("ws-1", true);
		expect(views[0].visible).toBe(true);
	});

	it("attach 时 URL 与当前页不同才加载（view 常驻，不每回重挂页面）", async () => {
		const { host, views } = makeHost();
		host.attach({ workspaceId: "ws-1", bounds: BOUNDS, url: "https://a.example" });
		await vi.waitFor(() => expect(views[0].webContents.loads).toHaveLength(1));
		views[0].webContents.url = "https://b.example"; // 页内导航后的现状
		host.attach({ workspaceId: "ws-1", bounds: BOUNDS, url: "https://b.example" });
		host.attach({ workspaceId: "ws-1", bounds: BOUNDS, url: "https://c.example" });
		await vi.waitFor(() => expect(views[0].webContents.loads).toContain("https://c.example"));
		expect(views[0].webContents.loads).toEqual(["https://a.example", "https://c.example"]);
	});

	it("导航/加载事件把 toolbar 状态推给 renderer", () => {
		const { host, views, events } = makeHost();
		host.attach({ workspaceId: "ws-1", bounds: BOUNDS });
		const contents = views[0].webContents;
		contents.fire("did-start-loading");
		expect(events.at(-1)?.state).toMatchObject({ workspaceId: "ws-1", loading: true, failed: false });
		contents.back = true;
		contents.url = "https://x.example";
		contents.fire("did-navigate", {}, "https://x.example");
		expect(events.at(-1)?.state).toMatchObject({ url: "https://x.example", canBack: true, loading: false });
	});

	it("did-fail-load 主帧非 -3 → failed；子帧与 ABORTED 不误报", () => {
		const { host, views, events } = makeHost();
		host.attach({ workspaceId: "ws-1", bounds: BOUNDS });
		const contents = views[0].webContents;
		contents.fire("did-fail-load", {}, -3, "aborted", "https://x.example", true);
		contents.fire("did-fail-load", {}, -6, "not found", "https://sub.example", false);
		expect(events.every((e) => !e.state.failed)).toBe(true);
		contents.fire("did-fail-load", {}, -105, "name not resolved", "https://x.example", true);
		expect(events.at(-1)?.state.failed).toBe(true);
	});

	it("navigate 只放行 http/https；未知 workspace 返回 no_view", async () => {
		const { host, views } = makeHost();
		expect(await host.navigate("ws-ghost", "https://a.example")).toEqual({ ok: false, code: "no_view" });
		host.attach({ workspaceId: "ws-1", bounds: BOUNDS });
		expect(await host.navigate("ws-1", "file:///etc/passwd")).toEqual({ ok: false, code: "policy_denied" });
		expect(await host.navigate("ws-1", "javascript:alert(1)")).toEqual({ ok: false, code: "policy_denied" });
		expect(await host.navigate("ws-1", "https://ok.example")).toEqual({ ok: true });
		expect(views[0].webContents.loads).toEqual(["https://ok.example"]);
	});

	it("control 映射 back/forward/reload/stop；不可回退时不 goBack", () => {
		const { host, views } = makeHost();
		host.attach({ workspaceId: "ws-1", bounds: BOUNDS });
		const contents = views[0].webContents;
		host.control("ws-1", "back");
		expect(contents.goBacks).toBe(0);
		contents.back = true;
		host.control("ws-1", "back");
		host.control("ws-1", "reload");
		host.control("ws-1", "stop");
		expect(contents.goBacks).toBe(1);
		expect(contents.reloads).toBe(1);
		expect(contents.stops).toBe(1);
	});

	it("detach 摘窗保活：contents 不销毁，重新 attach 直接复用", () => {
		const { host, win, views } = makeHost();
		host.attach({ workspaceId: "ws-1", bounds: BOUNDS });
		host.detach("ws-1");
		expect(win.removed).toEqual([views[0]]);
		expect(views[0].visible).toBe(false);
		expect(views[0].webContents.destroyed).toBe(false);
		host.attach({ workspaceId: "ws-1", bounds: BOUNDS });
		expect(views).toHaveLength(1);
		expect(win.added).toHaveLength(2);
	});

	it("面板拖拽期 setInputPassthrough 隐藏原生 view 让位给 DOM 兜底 overlay，结束后按请求可见性恢复", () => {
		// Electron 39 没有 per-view 的 ignore-mouse API（setIgnoreMouseEvents 只在
		// BaseWindow/BrowserWindow 上，electron#23863 未实现 view 级版本）；穿透只能
		// 通过暂时隐去原生 view 实现，页面保活不销毁（BUG-0086）。
		const { host, views } = makeHost();
		host.attach({ workspaceId: "ws-1", bounds: BOUNDS, visible: true });
		host.setInputPassthrough("ws-1", true);
		expect(views[0].visible).toBe(false);
		expect(views[0].webContents.destroyed).toBe(false);
		host.setInputPassthrough("ws-1", false);
		expect(views[0].visible).toBe(true);
	});

	it("穿透中收到 visible:false 更新时请求态保留，穿透结束不误恢复为可见", () => {
		const { host, views } = makeHost();
		host.attach({ workspaceId: "ws-1", bounds: BOUNDS, visible: true });
		host.setInputPassthrough("ws-1", true);
		// 穿透期间 tab 切走 / 失败覆盖层升起：请求可见性翻 false，不能丢。
		host.setVisible("ws-1", false);
		host.setInputPassthrough("ws-1", false);
		expect(views[0].visible).toBe(false);
	});

	it("attach 即不可见的 view 穿透开关不改变其可见性", () => {
		const { host, views } = makeHost();
		host.attach({ workspaceId: "ws-1", bounds: BOUNDS, visible: false });
		host.setInputPassthrough("ws-1", true);
		host.setInputPassthrough("ws-1", false);
		expect(views[0].visible).toBe(false);
	});

	it("view 销毁后 getState 为 null，重新 attach 重建新 view", () => {
		const { host, views } = makeHost();
		host.attach({ workspaceId: "ws-1", bounds: BOUNDS });
		views[0].webContents.destroyed = true;
		views[0].webContents.fire("destroyed");
		expect(host.getState("ws-1")).toBeNull();
		host.attach({ workspaceId: "ws-1", bounds: BOUNDS });
		expect(views).toHaveLength(2);
	});

	it("不同 workspace 各自持 view；无窗口时 attach 返回 null", () => {
		const { host, views } = makeHost();
		host.attach({ workspaceId: "ws-1", bounds: BOUNDS });
		host.attach({ workspaceId: "ws-2", bounds: BOUNDS });
		expect(views).toHaveLength(2);
		const emptyHost = new InAppBrowserViewHost({
			getWindow: () => null,
			createView: () => new FakeView(),
			send: () => undefined,
		});
		expect(emptyHost.attach({ workspaceId: "ws", bounds: BOUNDS })).toBeNull();
	});

	it("装配前的 getInAppBrowserViewHost 报明确错误，不自解析运行时相对路径依赖", () => {
		resetInAppBrowserViewHostForTests();
		// 回归：宿主此前用 createRequire(import.meta.url)("../window-manager.js") 取窗口，
		// main 单文件 bundle 下该路径不存在，attach 在 IPC 处理器里整条抛错（BUG-0050）。
		expect(() => getInAppBrowserViewHost().attach({ workspaceId: "ws-1", bounds: BOUNDS })).toThrow(/not configured/);

		const win = new FakeWindow();
		const views: FakeView[] = [];
		configureInAppBrowserViewHostDeps({
			getWindow: () => win,
			createView: () => {
				const view = new FakeView();
				views.push(view);
				return view;
			},
		});
		expect(getInAppBrowserViewHost().attach({ workspaceId: "ws-1", bounds: BOUNDS })?.workspaceId).toBe("ws-1");
		expect(win.added).toEqual([views[0]]);
		resetInAppBrowserViewHostForTests();
	});

	it("attach 的 loadURL 被后继导航中止（ERR_ABORTED）时不报失败，真实失败推给 renderer", async () => {
		const { host, views, events } = makeHost();
		host.attach({ workspaceId: "ws-1", bounds: BOUNDS });
		const contents = views[0].webContents;

		contents.loadURL = async (url: string) => {
			throw new Error(`ERR_ABORTED (-3) loading '${url}'`);
		};
		host.attach({ workspaceId: "ws-1", bounds: BOUNDS, url: "https://a.example" });
		await Promise.resolve();
		expect(events.every((envelope) => !envelope.state.failed)).toBe(true);

		contents.loadURL = async (url: string) => {
			throw new Error(`ERR_NAME_NOT_RESOLVED (-105) loading '${url}'`);
		};
		host.attach({ workspaceId: "ws-1", bounds: BOUNDS, url: "https://nope.example" });
		await vi.waitFor(() => expect(events.at(-1)?.state.failed).toBe(true));
	});

	it("navigate 被中止视为让位（ok:true），真实失败才回 load_failed 并推失败态", async () => {
		const { host, views, events } = makeHost();
		host.attach({ workspaceId: "ws-1", bounds: BOUNDS });
		const contents = views[0].webContents;

		contents.loadURL = async (url: string) => {
			throw new Error(`ERR_ABORTED (-3) loading '${url}'`);
		};
		expect(await host.navigate("ws-1", "https://b.example")).toEqual({ ok: true });
		expect(events.filter((envelope) => envelope.state.failed)).toEqual([]);

		contents.loadURL = async (url: string) => {
			throw new Error(`ERR_CONNECTION_REFUSED (-102) loading '${url}'`);
		};
		expect(await host.navigate("ws-1", "https://c.example")).toEqual({ ok: false, code: "load_failed" });
		expect(events.at(-1)?.state).toMatchObject({ failed: true, loading: false });
	});
});
