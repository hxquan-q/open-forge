// Modified by The Open Forge contributors.
import { ipcMain, type WebContents } from "electron";
import {
	clampTerminalSize,
	type OpenTerminalRequest,
	type OpenTerminalResult,
	TERMINAL_CHANNELS,
	type TerminalCapabilities,
} from "../../shared/terminal-ipc.js";
import { TerminalSnapshotStore } from "../terminal/snapshot-store.js";
import { TerminalService } from "../terminal/terminal-service.js";

/**
 * 终端 IPC：只做参数校验与转发，会话表、缓冲、忙闲状态都在 `main/terminal/`。
 *
 * 输出走单一 EVENT 频道多路复用，订阅在 open 时随 webContents 一起建立——
 * 渲染进程崩溃或导航时收不到 close，只能靠 webContents 的生命周期兜底回收 PTY。
 * 三种兜底事件与订阅按 owner 登记成组，任一事件触发时整组解绑。
 */

let service: TerminalService | undefined;
let snapshots: TerminalSnapshotStore | undefined;

function snapshotStore(): TerminalSnapshotStore {
	if (!snapshots) snapshots = new TerminalSnapshotStore();
	return snapshots;
}

function terminalService(): TerminalService {
	if (!service) service = new TerminalService();
	return service;
}

/**
 * 退出前回收所有 PTY。
 *
 * 不能只靠 `registerTerminalIpc` 返回的 teardown：那个只在窗口 `closed` 时跑，而
 * `before-quit` 是 `preventDefault()` → 清理 → `app.exit(0)`，窗口根本没被关过，
 * `closed` 不会触发。结果是退出时没有任何人给终端里的进程发信号，用户看到应用关了，
 * 服务还在后台跑着。
 */
export function disposeAllTerminals(): void {
	service?.disposeAll();
}

/** 仅供测试注入 fake service。 */
export function setTerminalServiceForTests(next: TerminalService | undefined): void {
	service = next;
}

function requireString(value: unknown, field: string): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`terminal: ${field} must be a non-empty string`);
	}
	return value;
}

function parseOpenRequest(value: unknown): OpenTerminalRequest {
	if (typeof value !== "object" || value === null) throw new Error("terminal: open request must be an object");
	const input = value as Record<string, unknown>;
	const cwd = requireString(input.cwd, "cwd");
	const size = clampTerminalSize(Number(input.cols), Number(input.rows));
	return { cwd, cols: size.cols, rows: size.rows };
}

/** 单次 write 的上限：正常输入远小于此，超大载荷只可能是坏调用。 */
const MAX_WRITE_LENGTH = 1024 * 1024;

/** 快照上报的上限；主进程还会再按字节截断一次。 */
const MAX_SNAPSHOT_LENGTH = 4 * 1024 * 1024;

/**
 * 一个 owner（渲染进程 WebContents）登记的解绑动作。
 *
 * 监听与订阅必须成组解绑：`once` 只摘掉自己那一条，导航先到时另外两个监听会留下，
 * 下次 open 再注册一组，监听数量就随导航轮次线性上涨（BUG-0115）。把「注册了哪些」
 * 记成一组，才有地方一次性撤销。
 */
interface OwnerEntry {
	/** terminalId → 撤销该订阅的函数；同一 terminalId 只保留最新一条。 */
	readonly subscriptions: Map<string, () => void>;
	/** 幂等：摘掉本次登记的三个生命周期监听，并撤销该 sender 的全部事件订阅。 */
	detach(): void;
}

/** 撤销某个 terminalId 的订阅；没登记过就是空操作。 */
function detachSubscription(subscriptions: Map<string, () => void> | undefined, terminalId: string): void {
	if (!subscriptions) return;
	const unsubscribe = subscriptions.get(terminalId);
	if (!unsubscribe) return;
	unsubscribe();
	subscriptions.delete(terminalId);
}

function attachSubscription(sender: WebContents, terminalId: string, subscriptions: Map<string, () => void>): void {
	// 同一 terminalId 的旧订阅先撤：重开同一个终端时不能让两路转发同时活着。
	detachSubscription(subscriptions, terminalId);
	const session = terminalService().get(terminalId);
	if (!session) return;
	const unsubscribe = session.subscribe((event) => {
		if (sender.isDestroyed()) return;
		sender.send(TERMINAL_CHANNELS.EVENT, { terminalId, event });
	});
	// 会话随 owner 一起回收；这里只登记事件转发的解绑，避免往已销毁的帧里灌数据。
	subscriptions.set(terminalId, unsubscribe);
}

export function registerTerminalIpc(): () => void {
	const owners = new Map<WebContents, OwnerEntry>();

	const trackOwner = (sender: WebContents): OwnerEntry => {
		const existing = owners.get(sender);
		if (existing) return existing;

		const subscriptions = new Map<string, () => void>();

		function detach(): void {
			// 三个事件里任意一个先到，另外两个也要摘掉；`once` 只摘自己那一条。
			sender.removeListener("destroyed", release);
			sender.removeListener("did-navigate", release);
			sender.removeListener("render-process-gone", release);
			for (const unsubscribe of subscriptions.values()) unsubscribe();
			subscriptions.clear();
		}

		function release(): void {
			detach();
			owners.delete(sender);
			terminalService().disposeOwnedBy(sender.id);
		}

		sender.on("destroyed", release);
		sender.on("did-navigate", release);
		// 渲染进程崩溃时 WebContents 还活着，既不 destroyed 也不 navigate；不接这一条的话
		// 那一批 PTY 要挂到用户手动刷新为止。
		sender.on("render-process-gone", release);

		const entry: OwnerEntry = { subscriptions, detach };
		owners.set(sender, entry);
		return entry;
	};

	ipcMain.handle(TERMINAL_CHANNELS.CAPABILITIES, (): TerminalCapabilities => terminalService().capabilities());

	ipcMain.handle(TERMINAL_CHANNELS.OPEN, async (event, request: unknown): Promise<OpenTerminalResult> => {
		const parsed = parseOpenRequest(request);
		const owner = trackOwner(event.sender);
		const result = await terminalService().open(event.sender.id, parsed);
		attachSubscription(event.sender, result.terminalId, owner.subscriptions);
		return result;
	});

	ipcMain.handle(TERMINAL_CHANNELS.WRITE, (_event, terminalId: unknown, data: unknown) => {
		const id = requireString(terminalId, "terminalId");
		if (typeof data !== "string") throw new Error("terminal: data must be a string");
		if (data.length > MAX_WRITE_LENGTH) throw new Error("terminal: data too large");
		terminalService().get(id)?.write(data);
	});

	ipcMain.handle(TERMINAL_CHANNELS.RESIZE, (_event, terminalId: unknown, cols: unknown, rows: unknown) => {
		const id = requireString(terminalId, "terminalId");
		const size = clampTerminalSize(Number(cols), Number(rows));
		terminalService().get(id)?.resize(size.cols, size.rows);
	});

	ipcMain.handle(TERMINAL_CHANNELS.FOREGROUND, (_event, terminalId: unknown): string | null => {
		const id = requireString(terminalId, "terminalId");
		return terminalService().get(id)?.foregroundProcess() ?? null;
	});

	ipcMain.handle(TERMINAL_CHANNELS.CLOSE, (event, terminalId: unknown) => {
		const id = requireString(terminalId, "terminalId");
		// 显式关闭也要撤掉订阅登记：会话没了，转发闭包不该继续挂在这个 WebContents 上。
		detachSubscription(owners.get(event.sender)?.subscriptions, id);
		terminalService().dispose(id);
	});

	ipcMain.handle(TERMINAL_CHANNELS.SNAPSHOT_SAVE, async (_event, tabId: unknown, text: unknown) => {
		const id = requireString(tabId, "tabId");
		if (typeof text !== "string") throw new Error("terminal: snapshot text must be a string");
		// 上报过大就截断而不是报错：快照是尽力而为的东西，丢一部分好过丢整份。
		await snapshotStore().save(id, text.slice(-MAX_SNAPSHOT_LENGTH));
	});

	ipcMain.handle(TERMINAL_CHANNELS.SNAPSHOT_LOAD, async (_event, tabId: unknown): Promise<string | null> => {
		const id = requireString(tabId, "tabId");
		return (await snapshotStore().load(id)) ?? null;
	});

	return () => {
		for (const channel of Object.values(TERMINAL_CHANNELS)) {
			if (channel === TERMINAL_CHANNELS.EVENT) continue;
			ipcMain.removeHandler(channel);
		}
		// 模块卸载后残留的监听仍会按旧的 owner 关系回收终端；先成组摘掉再收尾。
		for (const owner of [...owners.values()]) owner.detach();
		owners.clear();
		terminalService().disposeAll();
	};
}
