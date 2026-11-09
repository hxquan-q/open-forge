// Copyright The Open Forge contributors.
import { HOST_PROTOCOL_ERROR_CODES, HostProtocolError, type PortLike } from "@vetta/host-protocol/client";
import type { IpcRenderer } from "electron";
import { describe, expect, it, vi } from "vitest";
import { HOST_PORT_CHANNEL, HOST_PORT_REQUEST_CHANNEL, HOST_REQUEST_CHANNEL } from "../shared/host-ipc.js";
import { createDesktopHostClient } from "./host-transport.js";

function fakeIpc(response: unknown): {
	ipc: IpcRenderer;
	invoke: ReturnType<typeof vi.fn>;
	send: ReturnType<typeof vi.fn>;
	deliverPort: (port: unknown) => void;
} {
	const invoke = vi.fn(async () => response);
	const send = vi.fn();
	const portListeners: Array<(event: unknown) => void> = [];
	const ipc = {
		invoke,
		send,
		on: (channel: string, listener: (event: unknown) => void) => {
			if (channel === HOST_PORT_CHANNEL) portListeners.push(listener);
		},
	} as unknown as IpcRenderer;
	return {
		ipc,
		invoke,
		send,
		deliverPort: (port) => {
			for (const listener of portListeners) listener({ ports: [port] });
		},
	};
}

/** 客户端侧内存端口：只实现 PortLike 需要的形状。 */
function fakePort(): PortLike & { frames: unknown[]; emitFrame: (frame: unknown) => void; emitClose: () => void } {
	const listeners = new Map<string, Array<(event: { data: unknown }) => void>>();
	const port = {
		on: (event: "message" | "close", listener: (event: { data: unknown }) => void) => {
			const list = listeners.get(event) ?? [];
			list.push(listener);
			listeners.set(event, list);
		},
		once: (event: "message" | "close", listener: (event: { data: unknown }) => void) => {
			const wrapped = (message: { data: unknown }): void => {
				const list = listeners.get(event) ?? [];
				listeners.set(
					event,
					list.filter((entry) => entry !== wrapped),
				);
				listener(message);
			};
			port.on(event, wrapped);
		},
		start: vi.fn(),
		close: vi.fn(),
		postMessage: (message: unknown) => {
			port.frames.push(message);
		},
		frames: [] as unknown[],
		emitFrame: (frame: unknown) => {
			for (const listener of [...(listeners.get("message") ?? [])]) listener({ data: frame });
		},
		emitClose: () => {
			for (const listener of [...(listeners.get("close") ?? [])]) listener({ data: null });
		},
	} as unknown as PortLike & { frames: unknown[]; emitFrame: (frame: unknown) => void; emitClose: () => void };
	return port;
}

describe("preload host transport", () => {
	it("sends the request envelope over the single host channel and unwraps results", async () => {
		const { ipc, invoke } = fakeIpc({ ok: true, result: "websocket" });
		await expect(
			createDesktopHostClient(ipc).call("settings.setModelTransport", { transport: "websocket" }),
		).resolves.toBe("websocket");
		expect(invoke).toHaveBeenCalledWith(HOST_REQUEST_CHANNEL, {
			method: "settings.setModelTransport",
			params: { transport: "websocket" },
		});
	});

	it("rethrows error envelopes as HostProtocolError with a stable code", async () => {
		const { ipc } = fakeIpc({ ok: false, error: { code: "INVALID_PARAMS", message: "bad transport" } });
		const failure = createDesktopHostClient(ipc).call("settings.getModelTransport", {});
		await expect(failure).rejects.toBeInstanceOf(HostProtocolError);
		await expect(failure).rejects.toMatchObject({ code: HOST_PROTOCOL_ERROR_CODES.INVALID_PARAMS });
	});

	it("requests a message port once and switches to it when delivered", async () => {
		const { ipc, invoke, send, deliverPort } = fakeIpc({ ok: true, result: "sse" });
		const client = createDesktopHostClient(ipc);
		await expect(client.call("settings.getModelTransport", {})).resolves.toBe("sse");
		expect(send).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenCalledWith(HOST_PORT_REQUEST_CHANNEL);

		const port = fakePort();
		deliverPort(port);
		// 端口送达后的调用走端口帧（id 递增），不再打 ipc.invoke。
		const pending = client.call("settings.getServerUrl", {});
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(port.frames).toEqual([{ id: 1, request: { method: "settings.getServerUrl", params: {} } }]);
		port.emitFrame({ id: 1, response: { ok: true, result: "https://server.example.test" } });
		await expect(pending).resolves.toBe("https://server.example.test");
		expect(invoke).toHaveBeenCalledTimes(1);
	});

	it("falls back to the invoke channel after the port closes", async () => {
		const { ipc, invoke, send, deliverPort } = fakeIpc({ ok: true, result: "auto" });
		const client = createDesktopHostClient(ipc);
		const port = fakePort();
		deliverPort(port);
		port.emitClose();
		await expect(client.call("settings.getSessionInterruptContinue", {})).resolves.toBe("auto");
		expect(send).toHaveBeenCalledWith(HOST_PORT_REQUEST_CHANNEL);
		expect(invoke).toHaveBeenCalledWith(HOST_REQUEST_CHANNEL, {
			method: "settings.getSessionInterruptContinue",
			params: {},
		});
	});
});
