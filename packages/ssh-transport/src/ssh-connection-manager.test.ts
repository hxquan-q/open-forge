// Copyright The Open Forge contributors.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SshProcessRunner } from "./process-runner.js";
import type { RemotePlatform } from "./ssh-connection.js";
import { SshConnection } from "./ssh-connection.js";
import { SshConnectionManager } from "./ssh-connection-manager.js";
import type { SshConnectionStatus, SshHost } from "./ssh-host.js";

vi.mock("./ssh-connection.js", () => ({ SshConnection: vi.fn() }));

const HOST: SshHost = { id: "probe-host", label: "探测机", target: "probe-target", source: "manual" };
const OTHER: SshHost = { id: "other-host", label: "别的主机", target: "other-target", source: "manual" };

const PLATFORM: RemotePlatform = { os: "Linux", arch: "x86_64", statFlavor: "gnu" };

interface FakeConnection {
	readonly host: SshHost;
	/** 每次 probePlatform 调用一个新闸门，模拟未缓存的探测往返。 */
	readonly gates: Deferred<RemotePlatform>[];
	readonly probePlatform: ReturnType<typeof vi.fn>;
	readonly dispose: ReturnType<typeof vi.fn>;
}

interface Deferred<T> {
	readonly promise: Promise<T>;
	resolve(value: T): void;
	reject(error: unknown): void;
}

function createDeferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

/** 可控的 SshConnection 替身：probePlatform 挂在测试手动兑现的闸门上。 */
const instances: FakeConnection[] = [];

beforeEach(() => {
	instances.length = 0;
	// 注意用普通函数而不是箭头函数：manager 以 new 调用该 mock，箭头函数不可构造。
	// biome-ignore lint/complexity/useArrowFunction: manager 以 new 调用该 mock，箭头函数不可构造（Vitest 4 下直接抛 TypeError）
	vi.mocked(SshConnection).mockImplementation(function (host: SshHost) {
		const gates: Deferred<RemotePlatform>[] = [];
		const instance: FakeConnection = {
			host,
			gates,
			probePlatform: vi.fn(() => {
				const gate = createDeferred<RemotePlatform>();
				gates.push(gate);
				return gate.promise;
			}),
			dispose: vi.fn(),
		};
		instances.push(instance);
		return instance as unknown as SshConnection;
	} as unknown as typeof SshConnection);
});

function createManager(): { manager: SshConnectionManager; events: SshConnectionStatus[] } {
	const events: SshConnectionStatus[] = [];
	const runner: SshProcessRunner = {
		run: vi.fn(async () => ({ exitCode: 0, stdout: new Uint8Array(), stderr: "", aborted: false })),
	};
	const manager = new SshConnectionManager({
		runner,
		controlDirectory: "/tmp/ctrl",
		resolveHost: (hostId) => (hostId === HOST.id ? HOST : hostId === OTHER.id ? OTHER : undefined),
		onStatusChanged: (_hostId, status) => events.push(status),
	});
	return { manager, events };
}

describe("SSH 连接管理器：失效与迟到探测", () => {
	it("invalidate 后迟到的成功探测不能把状态改回 connected（BUG-0061）", async () => {
		const { manager, events } = createManager();
		const pending = manager.probe(HOST.id);
		manager.invalidate(HOST.id);
		expect(manager.getStatus(HOST.id)).toBe("disconnected");
		instances[0]?.gates[0].resolve(PLATFORM);
		await expect(pending).resolves.toBe("disconnected");
		expect(manager.getStatus(HOST.id)).toBe("disconnected");
		expect(events).toEqual(["connecting", "disconnected"]);
	});

	it("invalidate 后迟到的失败探测同样不写状态", async () => {
		const { manager, events } = createManager();
		const pending = manager.probe(HOST.id);
		manager.invalidate(HOST.id);
		instances[0]?.gates[0].reject(new Error("stale probe failed"));
		await pending;
		expect(manager.getStatus(HOST.id)).toBe("disconnected");
		expect(events).toEqual(["connecting", "disconnected"]);
	});

	it("新代次探测完成后，旧代次的迟到成功/失败都不能覆盖它", async () => {
		const { manager } = createManager();
		const stale = manager.probe(HOST.id);
		manager.invalidate(HOST.id);
		const fresh = manager.probe(HOST.id);
		instances[1]?.gates[0].resolve(PLATFORM);
		await expect(fresh).resolves.toBe("connected");
		instances[0]?.gates[0].resolve(PLATFORM);
		await stale;
		expect(manager.getStatus(HOST.id)).toBe("connected");
		instances[0]?.gates[0].reject(new Error("late failure on stale epoch"));
		expect(manager.getStatus(HOST.id)).toBe("connected");
	});

	it("被新一轮探测超越的旧结果不写状态", async () => {
		const { manager, events } = createManager();
		const first = manager.probe(HOST.id);
		const second = manager.probe(HOST.id);
		// 两次 probe 复用同一条连接，但各占一个探测闸门；旧的一轮先失败，
		// 只有最新一轮的结论能落到状态上。
		instances[0]?.gates[0].reject(new Error("old round failed"));
		await first;
		instances[0]?.gates[1].resolve(PLATFORM);
		await expect(second).resolves.toBe("connected");
		expect(manager.getStatus(HOST.id)).toBe("connected");
		expect(events).toEqual(["connecting", "connected"]);
	});

	it("探测失败置 unverifiable，之后可以恢复", async () => {
		const { manager } = createManager();
		const failing = manager.probe(HOST.id);
		instances[0]?.gates[0].reject(new Error("unreachable"));
		await expect(failing).resolves.toBe("unverifiable");
		const recovering = manager.probe(HOST.id);
		instances[0]?.gates[1].resolve(PLATFORM);
		await expect(recovering).resolves.toBe("connected");
	});

	it("invalidate 处置被丢弃的连接，不影响其他主机", () => {
		const { manager } = createManager();
		manager.connection(HOST.id);
		manager.connection(OTHER.id);
		manager.invalidate(HOST.id);
		expect(instances[0]?.dispose).toHaveBeenCalledTimes(1);
		expect(instances[1]?.dispose).not.toHaveBeenCalled();
		expect(manager.getStatus(OTHER.id)).toBe("disconnected");
	});

	it("同 target 重建拿到新连接对象，旧连接被处置", () => {
		const { manager } = createManager();
		const first = manager.connection(HOST.id);
		manager.invalidate(HOST.id);
		const second = manager.connection(HOST.id);
		expect(second).not.toBe(first);
		expect(instances[0]?.dispose).toHaveBeenCalledTimes(1);
	});
});
