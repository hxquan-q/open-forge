// Copyright The Open Forge contributors.
import type { PortLike } from "@vetta/host-protocol";
import type { MessagePortMain } from "electron";

/**
 * MessagePortMain → PortLike 适配（TASK-0463）：两侧端口（preload 的 Electron
 * MessagePort 与主进程 MessagePortMain）同为 EventEmitter 风格，桥接层不感知 Electron。
 * MessagePortMain 的 on/once 重载与 PortLike 的消息监听形状结构兼容，经 unknown 收窄。
 */
export function toPortLike(port: MessagePortMain): PortLike {
	const emitter = port as unknown as {
		on(event: string, listener: (event: { data: unknown }) => void): unknown;
		once(event: string, listener: (event: { data: unknown }) => void): unknown;
		postMessage(message: unknown): void;
		start(): void;
		close(): void;
	};
	return {
		on: (event, listener) => emitter.on(event, listener),
		once: (event, listener) => emitter.once(event, listener),
		postMessage: (message) => emitter.postMessage(message),
		start: () => emitter.start(),
		close: () => emitter.close(),
	};
}
