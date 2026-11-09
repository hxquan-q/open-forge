// Copyright The Open Forge contributors.

import type {
	McpHostMethods,
	ModelsHostMethods,
	SessionCatalogHostMethods,
	SessionDefaultsHostMethods,
	SessionEventsHostMethods,
	SessionExecutionHostMethods,
	SessionGoalHostMethods,
	SessionHistoryHostMethods,
	SessionLifecycleHostMethods,
	SessionMcpTasksHostMethods,
	SessionPlanModeHostMethods,
	SessionQueueHostMethods,
	SessionRuntimeOpsHostMethods,
	SessionTitleHostMethods,
	SettingsHostMethods,
} from "@vetta/host-protocol";
import {
	createHostClient,
	type HostClient,
	type HostTransport,
	type PortLike,
	portHostEvents,
	portHostTransport,
} from "@vetta/host-protocol/client";
import type { IpcRenderer } from "electron";
import { HOST_PORT_CHANNEL, HOST_PORT_REQUEST_CHANNEL, HOST_REQUEST_CHANNEL } from "../shared/host-ipc.js";

type DesktopHostMethodMap = SettingsHostMethods &
	ModelsHostMethods &
	McpHostMethods &
	SessionCatalogHostMethods &
	SessionDefaultsHostMethods &
	SessionEventsHostMethods &
	SessionExecutionHostMethods &
	SessionGoalHostMethods &
	SessionHistoryHostMethods &
	SessionLifecycleHostMethods &
	SessionMcpTasksHostMethods &
	SessionPlanModeHostMethods &
	SessionQueueHostMethods &
	SessionRuntimeOpsHostMethods &
	SessionTitleHostMethods;

/** preload 侧 Host 客户端：MessagePort 为主通道、`ipc.invoke` 为引导期回退（TASK-0463，ADR-0152）。 */
export type DesktopHostClient = HostClient<DesktopHostMethodMap> & {
	/**
	 * 等待 MessagePort 就绪（TASK-0477）：引导期端口未到或已关闭返回 false，调用方回退旧 IPC；
	 * 超时同样返回 false，避免阻塞式订阅一直等握手。
	 */
	whenPortReady(timeoutMs?: number): Promise<boolean>;
	/** 在线端口上的事件面：按 subscriptionId 注册处理器；端口未就绪或已关闭返回 undefined。 */
	onHostEvent(subscriptionId: string, handler: (payload: unknown) => void): (() => void) | undefined;
};

/**
 * renderer 侧 Electron MessagePort 为 EventEmitter 风格（on/once/postMessage/start/close），
 * 结构上即 PortLike；经 unknown 收窄而不引入 electron 类型面。
 */
function portLikeOf(port: unknown): PortLike {
	return port as PortLike;
}

export function createDesktopHostClient(ipc: IpcRenderer): DesktopHostClient {
	const invokeTransport: HostTransport = (request) => ipc.invoke(HOST_REQUEST_CHANNEL, request);
	let portTransport: HostTransport | null = null;
	let portEvents: ReturnType<typeof portHostEvents> | null = null;
	let portClosed = false;
	let handshakeStarted = false;
	const readyWaiters = new Set<(ready: boolean) => void>();

	const settleReady = (ready: boolean): void => {
		for (const resolve of [...readyWaiters]) resolve(ready);
		readyWaiters.clear();
	};

	const startHandshake = (): void => {
		if (handshakeStarted) return;
		handshakeStarted = true;
		ipc.on(HOST_PORT_CHANNEL, (event) => {
			const port = event.ports[0];
			if (!port) return;
			const like = portLikeOf(port);
			// 端口失效（对端关闭）即回退 invoke；本次会话不再重复握手。
			like.on("close", () => {
				portClosed = true;
				portTransport = null;
				portEvents = null;
				settleReady(false);
			});
			portTransport = portHostTransport(like);
			portEvents = portHostEvents(like);
			settleReady(true);
		});
		ipc.send(HOST_PORT_REQUEST_CHANNEL);
	};

	const whenPortReady = (timeoutMs = 1500): Promise<boolean> => {
		if (portTransport) return Promise.resolve(true);
		if (portClosed) return Promise.resolve(false);
		return new Promise<boolean>((resolve) => {
			let timer: ReturnType<typeof setTimeout> | undefined;
			const settle = (ready: boolean): void => {
				if (timer !== undefined) clearTimeout(timer);
				readyWaiters.delete(settle);
				resolve(ready);
			};
			readyWaiters.add(settle);
			timer = setTimeout(() => settle(false), timeoutMs);
			startHandshake();
		});
	};

	const onHostEvent = (subscriptionId: string, handler: (payload: unknown) => void): (() => void) | undefined =>
		portEvents?.on(subscriptionId, handler);

	const client = createHostClient<DesktopHostMethodMap>((request) => {
		startHandshake();
		return (portTransport ?? invokeTransport)(request);
	});
	return Object.assign(client, { whenPortReady, onHostEvent });
}
