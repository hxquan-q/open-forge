// Copyright The Open Forge contributors.

import type { ModelsHostMethods, SettingsHostMethods } from "@vetta/host-protocol";
import { createHostClient, type HostClient } from "@vetta/host-protocol/client";
import type { IpcRenderer } from "electron";
import { HOST_REQUEST_CHANNEL } from "../shared/host-ipc.js";

/** preload 侧 Host 客户端：transport 为单一 IPC channel，Phase 3 换 MessagePort 时只改这里（ADR-0152）。 */
export type DesktopHostClient = HostClient<SettingsHostMethods & ModelsHostMethods>;

export function createDesktopHostClient(ipc: IpcRenderer): DesktopHostClient {
	return createHostClient<SettingsHostMethods & ModelsHostMethods>((request) =>
		ipc.invoke(HOST_REQUEST_CHANNEL, request),
	);
}
