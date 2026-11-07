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

/** 端口帧：请求与响应都带单调关联 id，乱序响应按 id 配对；event 帧承载订阅事件（TASK-0477）。 */
interface PortFrame {
	readonly id: number;
	readonly request?: HostRequest;
	readonly response?: HostResponse;
	readonly event?: PortHostEventFrame;
}

interface PortHostEventFrame {
	readonly subscriptionId: string;
	readonly payload: unknown;
}

/** host 侧事件发射器：经端口下发订阅事件；订阅语义（注册/清理）由域实现负责。 */
export interface HostEventSink {
	emitEvent(subscriptionId: string, payload: unknown): void;
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

/** 服务端句柄：stop 关闭端口；events 供服务端在请求处理外推送订阅事件。 */
export interface ServeHostPortHandle {
	readonly events: HostEventSink;
	stop(): void;
}

/**
 * 服务端：把端口上的每个请求帧交给 dispatcher 并回写响应帧；畸形帧静默丢弃。
 * handle 收到连接级事件发射器——订阅类方法经 ctx.events 推送，非订阅路径忽略。
 */
export function serveHostOnPort(
	port: PortLike,
	handle: (request: unknown, events: HostEventSink) => Promise<HostResponse>,
): ServeHostPortHandle {
	let eventSequence = 0;
	const sink: HostEventSink = {
		emitEvent: (subscriptionId, payload) => {
			const id = ++eventSequence;
			port.postMessage({ id, event: { subscriptionId, payload } } satisfies PortFrame);
		},
	};
	const listener = (event: { data: unknown }): void => {
		const frame = asFrame(event.data);
		if (!frame || frame.request === undefined) return;
		void handle(frame.request, sink)
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
	return {
		events: sink,
		stop: () => {
			port.close?.();
		},
	};
}

/** 客户端事件面：按 subscriptionId 分发端口上的事件帧；返回退订函数。 */
export function portHostEvents(port: PortLike): {
	on(subscriptionId: string, handler: (payload: unknown) => void): () => void;
} {
	const handlers = new Map<string, (payload: unknown) => void>();
	port.on("message", (event) => {
		const frame = asFrame(event.data);
		if (!frame || frame.event === undefined) return;
		const handler = handlers.get(frame.event.subscriptionId);
		handler?.(frame.event.payload);
	});
	return {
		on: (subscriptionId, handler) => {
			handlers.set(subscriptionId, handler);
			return () => {
				if (handlers.get(subscriptionId) === handler) handlers.delete(subscriptionId);
			};
		},
	};
}
