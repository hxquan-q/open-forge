import { beforeEach, describe, expect, it, vi } from "vitest";
import { QUICK_PANEL_CHANNELS } from "../shared/quickpanel-ipc.js";

type Handler = (event: unknown, ...args: unknown[]) => void;

const electronMock = vi.hoisted(() => {
	class FakeEventTarget {
		private readonly handlers = new Map<string, Array<{ handler: Handler; once: boolean }>>();
		on(event: string, handler: Handler): this {
			this.handlers.set(event, [...(this.handlers.get(event) ?? []), { handler, once: false }]);
			return this;
		}
		once(event: string, handler: Handler): this {
			this.handlers.set(event, [...(this.handlers.get(event) ?? []), { handler, once: true }]);
			return this;
		}
		emit(event: string, ...args: unknown[]): void {
			const entries = this.handlers.get(event) ?? [];
			this.handlers.set(
				event,
				entries.filter((entry) => !entry.once),
			);
			const stubEvent = { preventDefault: () => {} };
			for (const entry of entries) entry.handler(stubEvent, ...args);
		}
	}

	class FakeWebContents extends FakeEventTarget {
		send = vi.fn();
		isDestroyed = vi.fn(() => false);
		setWindowOpenHandler = vi.fn();
		reload = vi.fn();
		reloadIgnoringCache = vi.fn();
		// 返回永不 resolve 的 promise：加载中的挂起态即测试所需。
		loadURL = vi.fn(() => new Promise<void>(() => {}));
	}

	class FakeBrowserWindow extends FakeEventTarget {
		static readonly instances: FakeBrowserWindow[] = [];
		readonly webContents = new FakeWebContents();
		visible = false;
		show = vi.fn(() => {
			this.visible = true;
		});
		hide = vi.fn(() => {
			this.visible = false;
		});
		isVisible = vi.fn(() => this.visible);
		focus = vi.fn();
		isDestroyed = vi.fn(() => false);
		setBounds = vi.fn();
		getBounds = vi.fn(() => ({ x: 640, y: 216, width: 640, height: 344 }));
		setAlwaysOnTop = vi.fn();
		setVisibleOnAllWorkspaces = vi.fn();
		getNativeWindowHandle = vi.fn(() => Buffer.alloc(8));
		// BrowserWindow.loadURL 代理到 webContents；模块调用的是 win.loadURL。
		loadURL = vi.fn(() => new Promise<void>(() => {}));
		constructor(_options: unknown) {
			super();
			FakeBrowserWindow.instances.push(this);
		}
	}

	return {
		BrowserWindow: FakeBrowserWindow,
		app: { isPackaged: false, getAppPath: () => "C:/app" },
		screen: {
			getCursorScreenPoint: () => ({ x: 960, y: 540 }),
			getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
		},
	};
});

vi.mock("electron", () => electronMock);
vi.mock("./logger.js", () => ({
	getAppLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("./window-manager.js", () => ({
	iconPath: { win32: "icon.ico", darwin: "icon.icns", linux: "icon.png" },
}));

async function importQuickPanelModule() {
	return await import("./quickpanel-window.js");
}

function lastWindow() {
	const instances = electronMock.BrowserWindow.instances;
	return instances[instances.length - 1];
}

describe("quickpanel window 懒创建", () => {
	beforeEach(() => {
		vi.resetModules();
		electronMock.BrowserWindow.instances.length = 0;
	});

	it("首次触发即开始建窗，但展示延迟到 ready-to-show", async () => {
		const mod = await importQuickPanelModule();
		mod.showQuickPanelWindow();
		const win = lastWindow();
		expect(electronMock.BrowserWindow.instances.length).toBe(1);
		expect(win.show).not.toHaveBeenCalled();
		win.emit("ready-to-show");
		expect(win.show).toHaveBeenCalledTimes(1);
		expect(win.focus).toHaveBeenCalledTimes(1);
		expect(win.webContents.send).toHaveBeenCalledWith(QUICK_PANEL_CHANNELS.ON_SHOWN);
	});

	it("就绪挂起期间再次触发立即展示，ready-to-show 不二次 show", async () => {
		const mod = await importQuickPanelModule();
		mod.showQuickPanelWindow();
		const win = lastWindow();
		mod.showQuickPanelWindow();
		expect(win.show).toHaveBeenCalledTimes(1);
		win.emit("ready-to-show");
		expect(win.show).toHaveBeenCalledTimes(1);
	});

	it("创建后常驻复用，show/hide 循环不重建窗口", async () => {
		const mod = await importQuickPanelModule();
		mod.showQuickPanelWindow();
		const win = lastWindow();
		win.emit("ready-to-show");
		mod.hideQuickPanelWindow();
		expect(win.isVisible()).toBe(false);
		mod.showQuickPanelWindow();
		expect(win.show).toHaveBeenCalledTimes(2);
		expect(electronMock.BrowserWindow.instances.length).toBe(1);
	});

	it("未创建时 hide 是 no-op，不触发建窗", async () => {
		const mod = await importQuickPanelModule();
		mod.hideQuickPanelWindow();
		expect(electronMock.BrowserWindow.instances.length).toBe(0);
	});

	it("主帧加载失败解除挂起不 show 空窗，下次触发走常驻立即展示", async () => {
		const mod = await importQuickPanelModule();
		mod.showQuickPanelWindow();
		const win = lastWindow();
		win.webContents.emit("did-fail-load", -3, "ABORTED", "file:///quickpanel.html", true);
		win.emit("ready-to-show");
		expect(win.show).not.toHaveBeenCalled();
		mod.showQuickPanelWindow();
		expect(win.show).toHaveBeenCalledTimes(1);
	});

	it("子帧加载失败不解除首唤挂起", async () => {
		const mod = await importQuickPanelModule();
		mod.showQuickPanelWindow();
		const win = lastWindow();
		win.webContents.emit("did-fail-load", -3, "ABORTED", "file:///sub-frame", false);
		win.emit("ready-to-show");
		expect(win.show).toHaveBeenCalledTimes(1);
	});
});
