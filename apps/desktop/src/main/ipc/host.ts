// Copyright The Open Forge contributors.
import type { HostDispatcher } from "@vetta/host-protocol";
import { serveHostOnPort } from "@vetta/host-protocol";
import { type IpcMainEvent, ipcMain, MessageChannelMain, type MessagePortMain } from "electron";
import { HOST_PORT_CHANNEL, HOST_PORT_REQUEST_CHANNEL, HOST_REQUEST_CHANNEL } from "../../shared/host-ipc.js";
import { toPortLike } from "../host/host-port-bridge.js";

/**
 * Host 合同的 Electron IPC 桥：`vetta:host:request` 保留为回退入口；preload 经
 * HOST_PORT_REQUEST 握手后，每个调用方获得独立 MessageChannelMain 端口对，
 * 请求走 MessagePort（TASK-0463，Phase 3 第一步）。校验与分发归 HostDispatcher。
 */
export function registerHostIpc(host: HostDispatcher): () => void {
	const served = new Set<MessagePortMain>();

	const handlePortRequest = (event: IpcMainEvent): void => {
		if (event.sender.isDestroyed()) return;
		const { port1, port2 } = new MessageChannelMain();
		served.add(port2);
		port2.on("close", () => served.delete(port2));
		serveHostOnPort(toPortLike(port2), (request) => host.handle(request));
		event.sender.postMessage(HOST_PORT_CHANNEL, null, [port1]);
	};

	ipcMain.on(HOST_PORT_REQUEST_CHANNEL, handlePortRequest);
	const invokeHandler = (_event: unknown, request: unknown) => host.handle(request);
	ipcMain.handle(HOST_REQUEST_CHANNEL, invokeHandler);

	return () => {
		ipcMain.removeHandler(HOST_REQUEST_CHANNEL);
		ipcMain.removeListener(HOST_PORT_REQUEST_CHANNEL, handlePortRequest);
		for (const port of served) port.close();
		served.clear();
	};
}
