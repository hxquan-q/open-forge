// Copyright The Open Forge contributors.
import type { IpcRenderer } from "electron";
import { COMPUTER_USE_CHANNELS } from "../../shared/computer-use.js";
import type { DesktopApi } from "../api.js";
import { onIpcEvent } from "./helper.js";

export function createComputerUseApi(ipc: IpcRenderer): Pick<DesktopApi, "computerUse"> {
	return {
		computerUse: {
			state: () => ipc.invoke(COMPUTER_USE_CHANNELS.state),
			control: (command) => ipc.invoke(COMPUTER_USE_CHANNELS.control, command),
			onChanged: (handler) => onIpcEvent(ipc, COMPUTER_USE_CHANNELS.changed, handler),
		},
	};
}
