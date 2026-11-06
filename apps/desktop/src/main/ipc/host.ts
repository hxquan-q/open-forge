// Copyright The Open Forge contributors.
import type { HostDispatcher } from "@vetta/host-protocol";
import { ipcMain } from "electron";
import { HOST_REQUEST_CHANNEL } from "../../shared/host-ipc.js";

/** Host 合同的 Electron IPC 桥：只转发信封，校验与分发归 HostDispatcher。 */
export function registerHostIpc(host: HostDispatcher): () => void {
	ipcMain.handle(HOST_REQUEST_CHANNEL, (_event, request: unknown) => host.handle(request));
	return () => {
		ipcMain.removeHandler(HOST_REQUEST_CHANNEL);
	};
}
