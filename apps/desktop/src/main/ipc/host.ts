// Copyright The Open Forge contributors.

import { fileURLToPath } from "node:url";
import type { HostDispatcher } from "@vetta/host-protocol";
import { SETTINGS_HOST_METHODS, serveHostOnPort } from "@vetta/host-protocol";
import { type IpcMainEvent, ipcMain, MessageChannelMain, type MessagePortMain, utilityProcess } from "electron";
import { HOST_PORT_CHANNEL, HOST_PORT_REQUEST_CHANNEL, HOST_REQUEST_CHANNEL } from "../../shared/host-ipc.js";
import { toPortLike } from "../host/host-port-bridge.js";
import {
	createHostProcessService,
	type HostProcessService,
	settingsDomainProxy,
} from "../host/host-process-service.js";

/** 子进程不可用时的静态降级服务（fork 失败不阻断其余领域）。 */
const unavailableService: HostProcessService = {
	request: async () => ({
		ok: false,
		error: { code: "HOST_UNAVAILABLE", message: "host process is unavailable (fork failed)" },
	}),
	dispose: () => {},
};

function forkHostProcess() {
	return utilityProcess.fork(fileURLToPath(new URL(/* @vite-ignore */ "./host-process.js", import.meta.url)), [], {
		serviceName: "vetta-host-process",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

/**
 * Host 合同的 Electron IPC 桥（TASK-0463/0464）：settings 域由 host 子进程承载并经代理挂到
 * 本 dispatcher；`vetta:host:request` 保留为回退入口；preload 经 HOST_PORT_REQUEST 握手后走
 * MessagePort。校验与分发归 HostDispatcher。
 */
export function registerHostIpc(host: HostDispatcher): () => void {
	let service: HostProcessService;
	try {
		const { port1, port2 } = new MessageChannelMain();
		service = createHostProcessService({
			child: forkHostProcess(),
			port1,
			port2,
			toPortLike: (port) => toPortLike(port as MessagePortMain),
		});
	} catch {
		service = unavailableService;
	}
	host.register(SETTINGS_HOST_METHODS, settingsDomainProxy(service));

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
		service.dispose();
	};
}
