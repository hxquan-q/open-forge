// Copyright The Open Forge contributors.
import type { HostTransport } from "./client.js";
import type { HostRequest, HostResponse } from "./envelope.js";
import { HOST_PROTOCOL_ERROR_CODES } from "./errors.js";

/**
 * MessagePort 形状的最小合同（EventEmitter 风格）：Electron 主进程 `MessagePortMain`、
 * preload 侧 renderer MessagePort 与测试内存端口都满足；本模块不依赖 Electron。
 */
export interface PortLike {
	on(event: "message" | "close", listener: (event: { data: unknown }) => void): unknown;
	once(event: "message", listener: (event: { data: unknown }) => void): unknown;
	postMessage(message: unknown): void;
	start?(): void;
	close?(): void;
}

/** 端口帧：请求与响应都带单调关联 id，乱序响应按 id 配对。 */
interface PortFrame {
	readonly id: number;
	readonly request?: HostRequest;
	readonly response?: HostResponse;
}

function asFrame(value: unknown): PortFrame | undefined {
	if (!value || typeof value !== "object") return undefined;
	const frame = value as Record<string, unknown>;
	if (typeof frame.id !== "number" || !Number.isInteger(frame.id) || frame.id <= 0) return undefined;
	return frame as unknown as PortFrame;
}

/** 客户端：把一个端口包装成 HostTransport（与 ipc.invoke 等实现同签名，ADR-0152）。 */
export function portHostTransport(port: PortLike): HostTransport {
	let sequence = 0;
	const pending = new Map<number, { resolve: (response: HostResponse) => void; reject: (error: Error) => void }>();
	const fail = (message: string): void => {
		for (const entry of pending.values()) entry.reject(new Error(message));
		pending.clear();
	};
	port.on("close", () => fail("host port closed"));
	port.on("message", (event) => {
		const frame = asFrame(event.data);
		if (!frame) return;
		const entry = pending.get(frame.id);
		if (!entry || frame.response === undefined) return;
		pending.delete(frame.id);
		entry.resolve(frame.response);
	});
	port.start?.();
	return (request) =>
		new Promise<HostResponse>((resolve, reject) => {
			const id = ++sequence;
			pending.set(id, { resolve, reject });
			port.postMessage({ id, request } satisfies PortFrame);
		});
}

/** 服务端：把端口上的每个请求帧交给 dispatcher 并回写响应帧；畸形帧静默丢弃。 */
export function serveHostOnPort(port: PortLike, handle: (request: unknown) => Promise<HostResponse>): () => void {
	const listener = (event: { data: unknown }): void => {
		const frame = asFrame(event.data);
		if (!frame || frame.request === undefined) return;
		void handle(frame.request)
			.catch(
				(error): HostResponse => ({
					ok: false,
					error: {
						code: HOST_PROTOCOL_ERROR_CODES.INTERNAL,
						message: error instanceof Error ? error.message : String(error),
					},
				}),
			)
			.then((response) => {
				port.postMessage({ id: frame.id, response } satisfies PortFrame);
			});
	};
	port.on("message", listener);
	port.start?.();
	return () => {
		port.close?.();
	};
}
