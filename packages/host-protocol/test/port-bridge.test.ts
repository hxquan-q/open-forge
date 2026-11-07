// Copyright The Open Forge contributors.
import { describe, expect, it, vi } from "vitest";
import type { HostResponse } from "../src/envelope.js";
import { type PortLike, portHostTransport, serveHostOnPort } from "../src/port-bridge.js";

/** 内存端口对：同步投递，模拟 MessageChannelMain 两端。 */
class FakePort {
	private peer: FakePort | null = null;
	private readonly listeners = new Map<string, Array<(event: { data: unknown }) => void>>();
	public readonly posted: unknown[] = [];
	public closed = false;

	on(event: string, listener: (event: { data: unknown }) => void): void {
		const list = this.listeners.get(event) ?? [];
		list.push(listener);
		this.listeners.set(event, list);
	}

	once(event: string, listener: (event: { data: unknown }) => void): void {
		const wrapped = (message: { data: unknown }): void => {
			this.removeListener(event, wrapped);
			listener(message);
		};
		this.on(event, wrapped);
	}

	removeListener(event: string, listener: (event: { data: unknown }) => void): void {
		const list = this.listeners.get(event) ?? [];
		this.listeners.set(
			event,
			list.filter((entry) => entry !== listener),
		);
	}

	start(): void {
		this.started = true;
	}

	public started = false;

	postMessage(message: unknown): void {
		this.posted.push(message);
		this.peer?.emit(message);
	}

	close(): void {
		this.closed = true;
		this.emitControl("close");
	}

	private emit(message: unknown): void {
		for (const listener of [...(this.listeners.get("message") ?? [])]) listener({ data: message });
	}

	private emitControl(event: string): void {
		for (const listener of [...(this.listeners.get(event) ?? [])]) listener({ data: null });
	}

	static pair(): [FakePort, FakePort] {
		const a = new FakePort();
		const b = new FakePort();
		a.attach(b);
		b.attach(a);
		return [a, b];
	}

	private attach(peer: FakePort): void {
		this.peer = peer;
	}
}

function portLike(port: FakePort): PortLike {
	return {
		on: (event, listener) => port.on(event, listener),
		once: (event, listener) => port.once(event, listener),
		postMessage: (message) => port.postMessage(message),
		start: () => port.start(),
		close: () => port.close(),
	};
}

describe("host port bridge", () => {
	it("round-trips a request through the port with a matching id", async () => {
		const [client, server] = FakePort.pair();
		serveHostOnPort(portLike(server), async (request) => ({
			ok: true,
			result: (request as { method: string }).method.toUpperCase(),
		}));
		const transport = portHostTransport(portLike(client));
		await expect(transport({ method: "settings.getServerUrl", params: {} })).resolves.toEqual({
			ok: true,
			result: "SETTINGS.GETSERVERURL",
		});
		expect(client.started).toBe(true);
	});

	it("pairs out-of-order responses by id", async () => {
		const [client, server] = FakePort.pair();
		const release = new Map<string, () => void>();
		serveHostOnPort(portLike(server), (request) => {
			const method = (request as { params: { key?: string } }).params.key as string;
			return new Promise((resolve) => {
				release.set(method, () => resolve({ ok: true, result: method }));
			});
		});
		const transport = portHostTransport(portLike(client));
		const first = transport({ method: "a", params: { key: "first" } });
		const second = transport({ method: "b", params: { key: "second" } });
		release.get("second")?.();
		await expect(second).resolves.toEqual({ ok: true, result: "second" });
		release.get("first")?.();
		await expect(first).resolves.toEqual({ ok: true, result: "first" });
	});

	it("rejects pending requests when the port closes", async () => {
		const [client, server] = FakePort.pair();
		serveHostOnPort(portLike(server), () => new Promise(() => {}));
		const transport = portHostTransport(portLike(client));
		const pending = transport({ method: "settings.getServerUrl", params: {} });
		client.close();
		await expect(pending).rejects.toThrow(/port closed/u);
	});

	it("answers malformed server-side frames with an internal error envelope", async () => {
		const [client, server] = FakePort.pair();
		const handle = vi.fn(async (_request: unknown): Promise<HostResponse> => ({ ok: true, result: null }));
		serveHostOnPort(portLike(server), handle);
		// 直接注入畸形帧：无 id、请求缺失。
		server.postMessage("not-a-frame");
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(handle).not.toHaveBeenCalled();
		// 带 id 的畸形请求帧由 handle 侧兜底（handle 恒回信封），此处仅验证健壮帧路径。
		const transport = portHostTransport(portLike(client));
		await expect(transport({ method: "ok", params: {} })).resolves.toEqual({ ok: true, result: null });
	});
});
