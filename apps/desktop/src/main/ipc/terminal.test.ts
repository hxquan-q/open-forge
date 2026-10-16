// Modified by The Open Forge contributors.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	handlers: new Map<string, (...args: unknown[]) => unknown>(),
	removeHandler: vi.fn(),
}));

vi.mock("electron", () => ({
	ipcMain: {
		handle: (channel: string, handler: (...args: unknown[]) => unknown) => mocks.handlers.set(channel, handler),
		removeHandler: mocks.removeHandler,
	},
}));

import { TERMINAL_CHANNELS, type TerminalEvent, type TerminalEventEnvelope } from "../../shared/terminal-ipc.js";
import type { TerminalService } from "../terminal/terminal-service.js";
import { disposeAllTerminals, registerTerminalIpc, setTerminalServiceForTests } from "./terminal.js";

interface FakeSender {
	readonly id: number;
	readonly sent: TerminalEventEnvelope[];
	isDestroyed(): boolean;
	on(event: string, listener: () => void): void;
	once(event: string, listener: () => void): void;
	removeListener(event: string, listener: () => void): void;
	listenerCount(event: string): number;
	send(channel: string, envelope: TerminalEventEnvelope): void;
	destroy(): void;
	emit(event: string): void;
}

/**
 * 受控 WebContents 替身，监听表按 EventEmitter 语义维护：`once` 触发即摘除、
 * `removeListener` 按身份过滤、`listenerCount` 可读。少了这三样，「导航后重开留下
 * 几个监听」就量不出来，BUG-0115 的复现也就无从断言。
 */
function fakeSender(id = 1): FakeSender {
	interface Entry {
		readonly listener: () => void;
		readonly once: boolean;
	}
	const listeners = new Map<string, Entry[]>();
	let destroyed = false;

	const register = (event: string, listener: () => void, once: boolean): void => {
		listeners.set(event, [...(listeners.get(event) ?? []), { listener, once }]);
	};

	return {
		id,
		sent: [],
		isDestroyed: () => destroyed,
		on(event, listener) {
			register(event, listener, false);
		},
		once(event, listener) {
			register(event, listener, true);
		},
		removeListener(event, listener) {
			listeners.set(
				event,
				(listeners.get(event) ?? []).filter((entry) => entry.listener !== listener),
			);
		},
		listenerCount(event) {
			return (listeners.get(event) ?? []).length;
		},
		send(_channel, envelope) {
			this.sent.push(envelope);
		},
		destroy() {
			destroyed = true;
			this.emit("destroyed");
		},
		emit(event) {
			// 真实 EventEmitter 先摘 once 再调用：反过来的话，监听器内部的
			// removeListener 与自动摘除会互相干扰，替身就不再可信。
			for (const entry of [...(listeners.get(event) ?? [])]) {
				if (entry.once) this.removeListener(event, entry.listener);
				entry.listener();
			}
		},
	};
}

function fakeSession() {
	const subscribers = new Set<(event: TerminalEvent) => void>();
	return {
		subscribers,
		written: [] as string[],
		resizes: [] as Array<[number, number]>,
		foreground: null as string | null,
		subscribe(listener: (event: TerminalEvent) => void) {
			subscribers.add(listener);
			return () => subscribers.delete(listener);
		},
		write(data: string) {
			this.written.push(data);
		},
		resize(cols: number, rows: number) {
			this.resizes.push([cols, rows]);
		},
		foregroundProcess() {
			return this.foreground ?? undefined;
		},
		emit(event: TerminalEvent) {
			for (const listener of subscribers) listener(event);
		},
	};
}

function fakeService(session: ReturnType<typeof fakeSession>) {
	return {
		opened: [] as unknown[],
		disposed: [] as string[],
		disposedOwners: [] as number[],
		disposeAllCalls: 0,
		capabilities: () => ({ localPty: true }),
		async open(ownerId: number, request: unknown) {
			this.opened.push({ ownerId, request });
			return { terminalId: "t1", backend: "local" as const, replay: "boot\n", replayTruncated: false };
		},
		get: () => session,
		dispose(terminalId: string) {
			this.disposed.push(terminalId);
		},
		disposeOwnedBy(ownerId: number) {
			this.disposedOwners.push(ownerId);
		},
		disposeAll() {
			this.disposeAllCalls += 1;
		},
	};
}

function invoke(channel: string, sender: FakeSender, ...args: unknown[]): unknown {
	const handler = mocks.handlers.get(channel);
	if (!handler) throw new Error(`no handler for ${channel}`);
	return handler({ sender }, ...args);
}

const OPEN_REQUEST = { cwd: "/repo", cols: 80, rows: 24 };

/** 从公开的 OPEN handler 打开一个终端，和渲染进程走的是同一条路。 */
function openTerminal(sender: FakeSender): Promise<unknown> {
	return Promise.resolve(invoke(TERMINAL_CHANNELS.OPEN, sender, OPEN_REQUEST));
}

let session: ReturnType<typeof fakeSession>;
let service: ReturnType<typeof fakeService>;
let teardown: () => void;

beforeEach(() => {
	mocks.handlers.clear();
	mocks.removeHandler.mockClear();
	session = fakeSession();
	service = fakeService(session);
	setTerminalServiceForTests(service as unknown as TerminalService);
	teardown = registerTerminalIpc();
});

describe("terminal ipc 合同", () => {
	it("注册除 EVENT 之外的全部 channel（EVENT 是 main→renderer 推送）", () => {
		const registered = [...mocks.handlers.keys()].sort();
		const expected = Object.values(TERMINAL_CHANNELS)
			.filter((channel) => channel !== TERMINAL_CHANNELS.EVENT)
			.sort();

		expect(registered).toEqual(expected);
	});

	it("open 返回订阅前的输出，随后增量走单一 EVENT 频道", async () => {
		const sender = fakeSender();
		const result = await invoke(TERMINAL_CHANNELS.OPEN, sender, { cwd: "/repo", cols: 80, rows: 24 });

		expect(result).toMatchObject({ terminalId: "t1", replay: "boot\n" });
		session.emit({ kind: "data", data: "later\n" });
		expect(sender.sent).toEqual([{ terminalId: "t1", event: { kind: "data", data: "later\n" } }]);
	});

	it("渲染帧销毁后不再往里灌数据，并整批回收该 owner 的终端", async () => {
		const sender = fakeSender(7);
		await invoke(TERMINAL_CHANNELS.OPEN, sender, { cwd: "/repo", cols: 80, rows: 24 });

		sender.destroy();
		session.emit({ kind: "data", data: "after destroy" });

		expect(sender.sent).toEqual([]);
		expect(service.disposedOwners).toContain(7);
	});

	it("拒绝坏参数：cwd 必须非空字符串，write 必须是字符串", async () => {
		const sender = fakeSender();

		await expect(Promise.resolve(invoke(TERMINAL_CHANNELS.OPEN, sender, { cols: 80, rows: 24 }))).rejects.toThrow(
			/cwd/,
		);
		expect(() => invoke(TERMINAL_CHANNELS.WRITE, sender, "t1", 42)).toThrow(/string/);
		expect(() => invoke(TERMINAL_CHANNELS.WRITE, sender, "", "ls")).toThrow(/terminalId/);
	});

	it("open 与 resize 都把越界尺寸夹回合法区间", async () => {
		const sender = fakeSender();
		await invoke(TERMINAL_CHANNELS.OPEN, sender, { cwd: "/repo", cols: -5, rows: 1e9 });
		invoke(TERMINAL_CHANNELS.RESIZE, sender, "t1", Number.NaN, 5000);

		expect(service.opened[0]).toMatchObject({ request: { cols: 2, rows: 1000 } });
		expect(session.resizes).toEqual([[2, 1000]]);
	});

	it("前台进程问不出来时回 null，供关闭确认走保守分支", () => {
		const sender = fakeSender();

		expect(invoke(TERMINAL_CHANNELS.FOREGROUND, sender, "t1")).toBeNull();
		session.foreground = "vim";
		expect(invoke(TERMINAL_CHANNELS.FOREGROUND, sender, "t1")).toBe("vim");
	});

	it("渲染进程崩溃时也整批回收：WebContents 还在，既不 destroyed 也不 navigate", async () => {
		const sender = fakeSender(9);
		await invoke(TERMINAL_CHANNELS.OPEN, sender, { cwd: "/repo", cols: 80, rows: 24 });

		sender.emit("render-process-gone");

		expect(service.disposedOwners).toContain(9);
	});

	it("导航后重开终端不累积生命周期监听：数量有界且不随轮次增长", async () => {
		const sender = fakeSender(11);

		await openTerminal(sender);
		expect(sender.listenerCount("destroyed")).toBe(1);

		for (let round = 0; round < 12; round += 1) {
			sender.emit("did-navigate");
			await openTerminal(sender);
		}

		// 旧实现里 release 只清 Set，导航后重开又注册一次，destroyed 会涨到 13。
		expect(sender.listenerCount("destroyed")).toBe(1);
		expect(sender.listenerCount("did-navigate")).toBe(1);
		expect(sender.listenerCount("render-process-gone")).toBe(1);
	});

	it("反复打开关闭终端同样不累积监听，关闭后旧订阅不再转发", async () => {
		const sender = fakeSender(5);

		for (let round = 0; round < 12; round += 1) {
			await openTerminal(sender);
			invoke(TERMINAL_CHANNELS.CLOSE, sender, "t1");
		}

		// 旧实现里 CLOSE 只 dispose 会话，open 时登记的监听一直留着。
		expect(sender.listenerCount("destroyed")).toBe(1);
		expect(sender.listenerCount("did-navigate")).toBe(1);
		// 替身的 dispose 只记录调用，不像真实 TerminalSession 那样清监听表；这样量的是
		// IPC 层有没有撤销自己登记的那份订阅。
		expect(session.subscribers.size).toBe(0);

		session.emit({ kind: "data", data: "after close" });
		expect(sender.sent).toEqual([]);
		expect(service.disposed).toContain("t1");
	});

	it("重开同一个终端只留一路转发，同一份输出不会送两遍", async () => {
		const sender = fakeSender(41);

		await openTerminal(sender);
		await openTerminal(sender);
		session.emit({ kind: "data", data: "once\n" });

		expect(sender.sent).toHaveLength(1);
	});

	it("导航释放后再打开，新一轮 owner 仍能被整批回收", async () => {
		const sender = fakeSender(21);

		await openTerminal(sender);
		sender.emit("did-navigate");
		await openTerminal(sender);
		sender.emit("render-process-gone");

		expect(service.disposedOwners).toEqual([21, 21]);
	});

	it("teardown 摘掉生命周期监听，残留监听不再回头改状态", async () => {
		const sender = fakeSender(3);
		await openTerminal(sender);

		teardown();

		expect(sender.listenerCount("destroyed")).toBe(0);
		expect(sender.listenerCount("did-navigate")).toBe(0);
		expect(sender.listenerCount("render-process-gone")).toBe(0);
		expect(session.subscribers.size).toBe(0);

		sender.emit("did-navigate");
		expect(service.disposedOwners).toEqual([]);
	});

	it("退出清理不经过 teardown 也能杀光终端", async () => {
		// `before-quit` 是 preventDefault → 清理 → app.exit(0)，窗口没被关过，
		// teardown 挂的那个 `closed` 不会触发；这条路必须自己能收尸。
		await invoke(TERMINAL_CHANNELS.OPEN, fakeSender(), { cwd: "/repo", cols: 80, rows: 24 });

		disposeAllTerminals();

		expect(service.disposeAllCalls).toBe(1);
	});

	it("teardown 摘掉 handler 并杀光残留终端", () => {
		teardown();

		expect(mocks.removeHandler).toHaveBeenCalledWith(TERMINAL_CHANNELS.OPEN);
		expect(mocks.removeHandler).not.toHaveBeenCalledWith(TERMINAL_CHANNELS.EVENT);
		expect(service.disposeAllCalls).toBe(1);
	});
});
