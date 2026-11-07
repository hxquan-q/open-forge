// Copyright The Open Forge contributors.

import type {
	McpHostMethods,
	ModelsHostMethods,
	SessionDefaultsHostMethods,
	SessionHistoryHostMethods,
	SessionQueueHostMethods,
	SettingsHostMethods,
} from "@vetta/host-protocol";
import {
	createHostClient,
	type HostClient,
	type HostTransport,
	type PortLike,
	portHostTransport,
} from "@vetta/host-protocol/client";
import type { IpcRenderer } from "electron";
import { HOST_PORT_CHANNEL, HOST_PORT_REQUEST_CHANNEL, HOST_REQUEST_CHANNEL } from "../shared/host-ipc.js";

/** preload 侧 Host 客户端：MessagePort 为主通道、`ipc.invoke` 为引导期回退（TASK-0463，ADR-0152）。 */
export type DesktopHostClient = HostClient<
	SettingsHostMethods &
		ModelsHostMethods &
		McpHostMethods &
		SessionDefaultsHostMethods &
		SessionHistoryHostMethods &
		SessionQueueHostMethods
>;

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
	let handshakeStarted = false;

	const startHandshake = (): void => {
		if (handshakeStarted) return;
		handshakeStarted = true;
		ipc.on(HOST_PORT_CHANNEL, (event) => {
			const port = event.ports[0];
			if (!port) return;
			const like = portLikeOf(port);
			// 端口失效（对端关闭）即回退 invoke；本次会话不再重复握手。
			like.on("close", () => {
				portTransport = null;
			});
			portTransport = portHostTransport(like);
		});
		ipc.send(HOST_PORT_REQUEST_CHANNEL);
	};

	return createHostClient<
		SettingsHostMethods &
			ModelsHostMethods &
			McpHostMethods &
			SessionDefaultsHostMethods &
			SessionHistoryHostMethods &
			SessionQueueHostMethods
	>((request) => {
		startHandshake();
		return (portTransport ?? invokeTransport)(request);
	});
}
