// Copyright The Open Forge contributors.
import { Value } from "@sinclair/typebox/value";
import type { WebContents } from "electron";
import { ipcMain } from "electron";
import { COMPUTER_USE_CHANNELS, ComputerControlSchema, type ComputerUseApi } from "../../shared/computer-use.js";

export function assertComputerUseSender(event: Electron.IpcMainInvokeEvent, main: WebContents): void {
	if (event.sender !== main || event.senderFrame !== main.mainFrame) throw new Error("unauthorized");
}

export function registerComputerUseIpc(
	main: WebContents,
	service: Pick<ComputerUseApi, "state" | "control">,
): () => void {
	ipcMain.handle(COMPUTER_USE_CHANNELS.state, (event) => {
		assertComputerUseSender(event, main);
		return service.state();
	});
	ipcMain.handle(COMPUTER_USE_CHANNELS.control, (event, value: unknown) => {
		assertComputerUseSender(event, main);
		if (!Value.Check(ComputerControlSchema, value)) throw new Error("invalid_input");
		return service.control(value);
	});
	return () => {
		ipcMain.removeHandler(COMPUTER_USE_CHANNELS.state);
		ipcMain.removeHandler(COMPUTER_USE_CHANNELS.control);
	};
}
