// Copyright The Open Forge contributors.
import { type PortLike, SETTINGS_HOST_METHODS, serveHostOnPort } from "@vetta/host-protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";

let document: Record<string, unknown>;
vi.mock("../agent-settings/settings-document-store.js", () => ({
	readAgentSettingsDocument: () => document,
	updateAgentSettingsDocument: (mutate: (settings: Record<string, unknown>) => void) => mutate(document),
}));
vi.mock("../constants.js", () => ({
	DEFAULT_SERVER_URL: "https://server.example.test",
	DEFAULT_SITE_URL: "https://site.example.test",
}));

const { createHostProcessService, settingsDomainProxy } = await import("./host-process-service.js");
type HostChildProcess = import("./host-process-service.js").HostChildProcess;
const { settingsHostDomain } = await import("./settings-domain.js");
const { HostDispatcher, HostOwnerRegistry } = await import("@vetta/host-protocol");

/** 内存端口对：双向同步投递，两端都满足 PortLike（on 写本端表，postMessage 投对端表）。 */
function portPair(): [PortLike & { emitFrame(f: unknown): void }, PortLike] {
	const makeSide = (
		own: Map<string, Array<(event: { data: unknown }) => void>>,
		peer: Map<string, Array<(event: { data: unknown }) => void>>,
	): PortLike & { emitFrame(f: unknown): void } => ({
		on: (event, listener) => {
			const list = own.get(event) ?? [];
			list.push(listener);
			own.set(event, list);
		},
		once: (event, listener) => {
			const wrapped = (message: { data: unknown }): void => {
				const list = own.get(event) ?? [];
				own.set(
					event,
					list.filter((entry) => entry !== wrapped),
				);
				listener(message);
			};
			const list = own.get(event) ?? [];
			list.push(wrapped);
			own.set(event, list);
		},
		postMessage: (message) => {
			for (const listener of [...(peer.get("message") ?? [])]) listener({ data: message });
		},
		start: () => {},
		close: () => {
			for (const listener of [...(own.get("close") ?? [])]) listener({ data: null });
		},
		emitFrame: (frame) => {
			for (const listener of [...(own.get("message") ?? [])]) listener({ data: frame });
		},
	});
	const leftMap = new Map<string, Array<(event: { data: unknown }) => void>>();
	const rightMap = new Map<string, Array<(event: { data: unknown }) => void>>();
	return [makeSide(leftMap, rightMap), makeSide(rightMap, leftMap)];
}

interface FakeChild extends HostChildProcess {
	deliverPorts(): void;
	exit(): void;
}

function fakeChild(portForChild: PortLike): FakeChild {
	const exitListeners: Array<(code: number) => void> = [];
	const child = {
		postMessage: vi.fn((_message: unknown, _transfer?: unknown[]) => {}),
		on: (event: "exit", listener: (code: number) => void) => {
			if (event === "exit") exitListeners.push(listener);
		},
		kill: vi.fn(() => true),
		deliverPorts() {
			// 模拟子进程入口：把收到的端口接到本地 dispatcher。
			serveHostOnPort(portForChild, (request) => childHost.handle(request));
		},
		exit() {
			for (const listener of exitListeners) listener(1);
		},
	};
	const childHost = new HostDispatcher(new HostOwnerRegistry());
	childHost.register(SETTINGS_HOST_METHODS, settingsHostDomain);
	return child as FakeChild;
}

describe("host process service", () => {
	beforeEach(() => {
		document = {};
	});

	it("forwards settings calls to the child dispatcher over the port", async () => {
		const [mainPort, childPort] = portPair();
		const child = fakeChild(childPort);
		const service = createHostProcessService({
			child,
			port1: childPort,
			port2: mainPort,
			toPortLike: (port) => port as PortLike,
		});
		child.deliverPorts();
		await expect(service.request({ method: "settings.getServerUrl", params: {} })).resolves.toEqual({
			ok: true,
			result: "https://server.example.test",
		});
		await expect(
			service.request({ method: "settings.setModelTransport", params: { transport: "websocket" } }),
		).resolves.toEqual({ ok: true, result: "websocket" });
		expect(document.transport).toBe("websocket");
		// 代理实现直接调用路径（handler 签名带 context，测试里以窄化签名调用）。
		const proxy = settingsDomainProxy(service);
		await expect((proxy.getServerUrl as () => Promise<string>)()).resolves.toBe("https://server.example.test");
	});

	it("maps child error envelopes to HostProtocolError codes", async () => {
		const [mainPort, childPort] = portPair();
		const child = fakeChild(childPort);
		const service = createHostProcessService({
			child,
			port1: childPort,
			port2: mainPort,
			toPortLike: (port) => port as PortLike,
		});
		child.deliverPorts();
		const response = await service.request({ method: "settings.setModelTransport", params: { transport: "socket" } });
		expect(response).toMatchObject({ ok: false, error: { code: "INVALID_PARAMS" } });
		const proxy = settingsDomainProxy(service);
		await expect(
			(proxy.setModelTransport as (params: { transport: string }) => Promise<string>)({
				transport: "socket",
			}),
		).rejects.toMatchObject({ code: "INVALID_PARAMS" });
	});

	it("answers HOST_UNAVAILABLE after the child exits and disposes on demand", async () => {
		const [mainPort, childPort] = portPair();
		const child = fakeChild(childPort);
		const service = createHostProcessService({
			child,
			port1: childPort,
			port2: mainPort,
			toPortLike: (port) => port as PortLike,
		});
		child.deliverPorts();
		child.exit();
		const response = await service.request({ method: "settings.getServerUrl", params: {} });
		expect(response).toMatchObject({ ok: false, error: { code: "HOST_UNAVAILABLE" } });
		service.dispose();
		expect(child.kill).toHaveBeenCalled();
	});
});
