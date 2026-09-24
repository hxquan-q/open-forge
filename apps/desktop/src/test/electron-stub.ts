import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Vitest 下的 `electron` 解析目标。
 *
 * 非 Electron 进程里 `import { app } from "electron"` 只能拿到 npm 包的二进制路径字符串，
 * 命名导出全是 undefined——模块求值期一读 `app.isPackaged` 就崩。
 * 测试环境统一把 `electron` 解析到本 stub：覆盖各 main 模块在模块级/惰性调用中触达的导出，
 * 默认按「未打包开发实例」语义取值。需要特定行为的测试照旧 `vi.mock("electron")`，按 specifier
 * 拦截、优先于本 alias。
 */

const noop = (): void => {};

const emptyNativeImage = {
	isEmpty: () => true,
	toPNG: () => Buffer.alloc(0),
	toDataURL: () => "",
	getSize: () => ({ width: 0, height: 0 }),
	resize: () => emptyNativeImage,
};

const fakeSession = {
	on: noop,
	once: noop,
	setUserAgent: noop,
	clearCache: async () => {},
	clearStorageData: async () => {},
	webRequest: { onBeforeRequest: noop, onHeadersReceived: noop },
	protocol: undefined as unknown,
	setProxy: async () => {},
};

export const app = {
	isPackaged: false,
	getAppPath: () => process.cwd(),
	getPath: (name: string) => join(tmpdir(), `vetta-test-${name}`),
	setPath: noop,
	getName: () => "vetta-test",
	setName: noop,
	getVersion: () => "0.0.0-test",
	getLocale: () => "zh-CN",
	isReady: () => true,
	whenReady: async () => {},
	on: noop,
	once: noop,
	quit: noop,
	exit: noop,
	requestSingleInstanceLock: () => true,
	releaseSingleInstanceLock: noop,
	setAppUserModelId: noop,
	setAsDefaultProtocolClient: noop,
	commandLine: { appendSwitch: noop, appendArgument: noop },
	dock: { hide: noop, show: async () => {}, setIcon: noop },
	setLoginItemSettings: noop,
	getLoginItemSettings: () => ({ openAtLogin: false }),
};

export const ipcMain = {
	on: noop,
	once: noop,
	handle: noop,
	handleOnce: noop,
	removeHandler: noop,
	removeAllListeners: noop,
};

export const ipcRenderer = {
	invoke: async () => undefined,
	send: noop,
	on: noop,
	once: noop,
	removeAllListeners: noop,
	postMessage: noop,
};

export const contextBridge = { exposeInMainWorld: noop };

export const webContents = {
	getAllWebContents: () => [] as unknown[],
	fromId: () => undefined,
};

const fakeWebContents = {
	send: noop,
	on: noop,
	once: noop,
	postMessage: noop,
	executeJavaScript: async () => undefined,
	isDestroyed: () => true,
	setWindowOpenHandler: noop,
	openDevTools: noop,
	closeDevTools: noop,
	session: fakeSession,
};

export const BrowserWindow = class {
	static getAllWindows(): unknown[] {
		return [];
	}
	static fromWebContents(): undefined {
		return undefined;
	}
	webContents = fakeWebContents;
	on = noop;
	once = noop;
	isDestroyed = () => true;
	isVisible = () => false;
	close = noop;
	show = noop;
	hide = noop;
	focus = noop;
	loadURL = async () => {};
	loadFile = async () => {};
	setMenu = noop;
	setTitle = noop;
	getBounds = () => ({ x: 0, y: 0, width: 0, height: 0 });
	setBounds = noop;
};

export const Menu = {
	setApplicationMenu: noop,
	getApplicationMenu: () => null,
	buildFromTemplate: () => ({ popup: noop, closePopup: noop }),
};

export const MenuItem = class {};
export const Tray = class {
	on = noop;
	setToolTip = noop;
	setContextMenu = noop;
	destroy = noop;
};
export const Notification = class {
	static isSupported() {
		return false;
	}
	show = noop;
	on = noop;
};

export const session = {
	defaultSession: fakeSession,
	fromPartition: () => fakeSession,
};

export const protocol = {
	handle: noop,
	unhandle: noop,
	registerSchemesAsPrivileged: noop,
	registerFileProtocol: noop,
	registerStringProtocol: noop,
	registerBufferProtocol: noop,
	interceptFileProtocol: noop,
	isProtocolHandled: () => false,
	isProtocolRegistered: () => false,
};

export const dialog = {
	showOpenDialog: async () => ({ canceled: true, filePaths: [] as string[] }),
	showSaveDialog: async () => ({ canceled: true, filePath: undefined }),
	showMessageBox: async () => ({ response: 0 }),
	showErrorBox: noop,
};

export const shell = {
	openExternal: async () => {},
	openPath: async () => "",
	showItemInFolder: noop,
	trashItem: async () => {},
	beep: noop,
};

export const nativeImage = {
	createEmpty: () => emptyNativeImage,
	createFromPath: () => emptyNativeImage,
	createFromBuffer: () => emptyNativeImage,
	createFromDataURL: () => emptyNativeImage,
};

export const nativeTheme = {
	shouldUseDarkColors: false,
	themeSource: "system" as const,
	on: noop,
};

export const net = { fetch: (...args: Parameters<typeof fetch>) => fetch(...args) };

export const clipboard = {
	readText: () => "",
	writeText: noop,
	readImage: () => emptyNativeImage,
	writeImage: noop,
	clear: noop,
};

export const safeStorage = {
	isEncryptionAvailable: () => false,
	encryptString: (value: string) => Buffer.from(value, "utf8"),
	decryptString: (value: Buffer) => value.toString("utf8"),
};

const fakeDisplay = {
	id: 1,
	size: { width: 1920, height: 1080 },
	workAreaSize: { width: 1920, height: 1040 },
	scaleFactor: 1,
	bounds: { x: 0, y: 0, width: 1920, height: 1080 },
	workArea: { x: 0, y: 0, width: 1920, height: 1040 },
};

export const screen = {
	getPrimaryDisplay: () => fakeDisplay,
	getAllDisplays: () => [fakeDisplay],
	getCursorScreenPoint: () => ({ x: 0, y: 0 }),
	on: noop,
};

export const powerMonitor = { on: noop, getSystemIdleTime: () => 0 };

export const systemPreferences = {
	getAccentColor: () => "",
	isDarkMode: () => false,
	getColor: () => "#000000",
	on: noop,
};

export const globalShortcut = {
	register: () => true,
	unregister: noop,
	unregisterAll: noop,
	isRegistered: () => false,
};

export const desktopCapturer = { getSources: async () => [] };

export const utilityProcess = {
	fork: () => ({ on: noop, once: noop, postMessage: noop, kill: () => true }),
};

export const autoUpdater = {
	on: noop,
	checkForUpdates: noop,
	quitAndInstall: noop,
	setFeedURL: noop,
	getFeedURL: () => "",
};

export default {
	app,
	ipcMain,
	ipcRenderer,
	contextBridge,
	webContents,
	BrowserWindow,
	Menu,
	Tray,
	Notification,
	session,
	protocol,
	dialog,
	shell,
	nativeImage,
	nativeTheme,
	net,
	clipboard,
	safeStorage,
	screen,
	powerMonitor,
	systemPreferences,
	globalShortcut,
	desktopCapturer,
	utilityProcess,
	autoUpdater,
};
