// Copyright The Open Forge contributors.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BROWSER_VIEW_CHANNELS, type DesktopBrowserViewBounds } from "../../shared/browser-view-ipc.js";

const BOUNDS: DesktopBrowserViewBounds = { x: 8, y: 16, width: 640, height: 480 };

/**
 * 生产装配合同（BUG-0050）：`registerBrowserViewIpc` 是内置浏览器 view 的唯一装配点，
 * 必须把主窗口读取与 `WebContentsView` 构造静态接进宿主。此前宿主自己用
 * `createRequire(import.meta.url)` 解析相对路径，main bundle 下 attach 整条抛错，
 * 本用例覆盖的正是那条没有任何测试的装配缝。
 */
const captured = vi.hoisted(() => {
	class FakeContents {
		static nextId = 1;
		readonly id = FakeContents.nextId++;
		url = "about:blank";
		title = "";
		destroyed = false;
		loads: string[] = [];
		private readonly listeners = new Map<string, ((...args: unknown[]) => void)[]>();

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
		readonly navigationHistory = {
			canGoBack: () => false,
			canGoForward: () => false,
			goBack: () => {},
			goForward: () => {},
		};
		reload(): void {}
		stop(): void {}
		setWindowOpenHandler(): void {}
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
		close(): void {
			this.destroyed = true;
			this.fire("destroyed");
		}
		fire(event: string, ...args: unknown[]): void {
			for (const listener of this.listeners.get(event) ?? []) listener(...args);
		}
	}

	class FakeView {
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

	return {
		FakeView,
		handlers: new Map<string, (event: unknown, request: unknown) => unknown>(),
		created: [] as { options?: { webPreferences?: Record<string, unknown> }; view: FakeView }[],
	};
});

// 以默认 alias 的 electron stub 为底，只接管 ipcMain 注册与 WebContentsView 构造：
// window-manager 及其依赖图在模块求值期读的导出保持与其余 main 单测一致。
vi.mock("electron", async () => {
	const stub = await import("../../test/electron-stub.js");
	return {
		...stub,
		ipcMain: {
			...stub.ipcMain,
			handle: (channel: string, handler: (event: unknown, request: unknown) => unknown) => {
				captured.handlers.set(channel, handler);
			},
			removeHandler: (channel: string) => {
				captured.handlers.delete(channel);
			},
		},
		WebContentsView: class extends captured.FakeView {
			constructor(options?: { webPreferences?: Record<string, unknown> }) {
				super();
				captured.created.push({ options, view: this });
			}
		},
	};
});

const { registerBrowserViewIpc } = await import("./browser-view.js");
const { resetInAppBrowserViewHostForTests } = await import("../browser-automation/browser-view-host.js");
const { resetInAppBrowserSessionControllerForTests } = await import(
	"../browser-automation/webview-session-controller.js"
);
const { setMainWindow } = await import("../window-manager.js");

interface FakeMainWindow {
	readonly added: unknown[];
	readonly sent: { channel: string; payload: unknown }[];
}

function createMainWindow(): FakeMainWindow {
	const added: unknown[] = [];
	const sent: { channel: string; payload: unknown }[] = [];
	const win = {
		added,
		sent,
		isDestroyed: () => false,
		contentView: {
			addChildView: (view: unknown) => added.push(view),
			removeChildView: () => undefined,
		},
		webContents: {
			send: (channel: string, payload: unknown) => sent.push({ channel, payload }),
		},
	};
	setMainWindow(win as unknown as Parameters<typeof setMainWindow>[0]);
	return win;
}

function invoke(channel: string, request: unknown): Promise<unknown> {
	const handler = captured.handlers.get(channel);
	if (!handler) throw new Error(`no handler registered for ${channel}`);
	return Promise.resolve(handler({}, request));
}

function lastView(): InstanceType<typeof captured.FakeView> {
	const entry = captured.created.at(-1);
	if (!entry) throw new Error("no browser view created");
	return entry.view;
}

beforeEach(() => {
	resetInAppBrowserViewHostForTests();
	resetInAppBrowserSessionControllerForTests();
	captured.handlers.clear();
	captured.created.length = 0;
	setMainWindow(null);
});

describe("registerBrowserViewIpc（内置浏览器 view 装配）", () => {
	it("attach 为主窗口建 persist:vetta-browser 的 WebContentsView，摆位并加载初始地址", async () => {
		const teardown = registerBrowserViewIpc();
		const win = createMainWindow();

		const result = await invoke(BROWSER_VIEW_CHANNELS.ATTACH, {
			workspaceId: "ws-1",
			bounds: BOUNDS,
			url: "https://a.example",
			visible: true,
		});

		expect(result).toMatchObject({ ok: true, state: { workspaceId: "ws-1" } });
		expect(captured.created).toHaveLength(1);
		expect(captured.created[0].options).toEqual({
			webPreferences: { partition: "persist:vetta-browser", contextIsolation: true, nodeIntegration: false },
		});
		expect(win.added).toEqual([captured.created[0].view]);
		expect(lastView().bounds).toEqual(BOUNDS);
		expect(lastView().visible).toBe(true);
		await vi.waitFor(() => expect(lastView().webContents.loads).toEqual(["https://a.example"]));

		teardown();
	});

	it("导航事件经主窗口 webContents 回推 renderer，navigate/update/control 落到同一 view", async () => {
		const teardown = registerBrowserViewIpc();
		const win = createMainWindow();
		await invoke(BROWSER_VIEW_CHANNELS.ATTACH, { workspaceId: "ws-1", bounds: BOUNDS });

		lastView().webContents.fire("did-start-loading");
		expect(win.sent.at(-1)).toMatchObject({
			channel: BROWSER_VIEW_CHANNELS.EVENT,
			payload: { workspaceId: "ws-1", state: { loading: true, failed: false } },
		});

		expect(await invoke(BROWSER_VIEW_CHANNELS.NAVIGATE, { workspaceId: "ws-1", url: "https://b.example" })).toEqual({
			ok: true,
		});
		await invoke(BROWSER_VIEW_CHANNELS.UPDATE, { workspaceId: "ws-1", bounds: { ...BOUNDS, x: 99 } });
		await invoke(BROWSER_VIEW_CHANNELS.PASSTHROUGH, { workspaceId: "ws-1", passthrough: true });
		await invoke(BROWSER_VIEW_CHANNELS.CONTROL, { workspaceId: "ws-1", action: "reload" });
		expect(lastView().bounds?.x).toBe(99);
		expect(captured.created).toHaveLength(1);

		await invoke(BROWSER_VIEW_CHANNELS.DETACH, { workspaceId: "ws-1" });
		expect(lastView().visible).toBe(false);

		teardown();
		for (const channel of Object.values(BROWSER_VIEW_CHANNELS)) {
			if (channel === BROWSER_VIEW_CHANNELS.EVENT) continue;
			expect(captured.handlers.has(channel)).toBe(false);
		}
	});

	it("窗口不可用时 attach 回 no_window，不让 IPC 处理器抛错", async () => {
		const teardown = registerBrowserViewIpc();
		setMainWindow(null);

		expect(await invoke(BROWSER_VIEW_CHANNELS.ATTACH, { workspaceId: "ws-1", bounds: BOUNDS })).toEqual({
			ok: false,
			code: "no_window",
		});
		expect(captured.created).toHaveLength(0);

		teardown();
	});
});
