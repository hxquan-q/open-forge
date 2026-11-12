// Copyright The Open Forge contributors.
import type { IpcMainInvokeEvent, IpcRenderer, WebContents } from "electron";
import { describe, expect, it, vi } from "vitest";
import { createComputerUseApi } from "../../preload/apis/computer-use.js";
import { COMPUTER_USE_CHANNELS } from "../../shared/computer-use.js";
import { ComputerUseController } from "../computer-use/controller.js";
import { registerComputerUseIpc } from "./computer-use.js";

const { handlers } = vi.hoisted(() => ({
	handlers: new Map<string, (event: IpcMainInvokeEvent, input?: unknown) => unknown>(),
}));
vi.mock("electron", () => ({
	ipcMain: {
		handle: (channel: string, handler: (event: IpcMainInvokeEvent, input?: unknown) => unknown) =>
			handlers.set(channel, handler),
		removeHandler: (channel: string) => handlers.delete(channel),
	},
}));

function fixture() {
	const frame = {};
	const main = { mainFrame: frame } as unknown as WebContents;
	const event = { sender: main, senderFrame: frame } as unknown as IpcMainInvokeEvent;
	const controller = new ComputerUseController({
		supported: true,
		backend: { invoke: async () => ({ ok: true }), interrupt: async () => {}, dispose: async () => {} },
		ledger: { load: async () => [], save: async () => {} },
		display: {
			read: () => ({ hidden: false, topmost: false }),
			update: () => {},
			yield: () => () => {},
			exclude: () => () => {},
		},
		validateSession: async () => true,
	});
	const dispose = registerComputerUseIpc(main, {
		state: () => controller.state(),
		control: (command) => controller.control(command),
	});
	const ipc = {
		invoke: async (channel: string, input?: unknown) => handlers.get(channel)?.(event, input),
	} as unknown as IpcRenderer;
	return { controller, dispose, api: createComputerUseApi(ipc).computerUse, main, event };
}

describe("computer use preload to main contract", () => {
	it("uses the same channels and real controller to enable and disable desktop access", async () => {
		const f = fixture();
		try {
			expect((await f.api.state()).enabled).toBe(false);
			expect((await f.api.control({ action: "enable", enabled: true })).phase).toBe("idle");
			expect((await f.api.control({ action: "enable", enabled: false })).enabled).toBe(false);
		} finally {
			f.dispose();
		}
		expect(handlers.size).toBe(0);
	});
	it("rejects malformed data, plugin frames and non-main windows before business execution", () => {
		const f = fixture();
		try {
			const control = handlers.get(COMPUTER_USE_CHANNELS.control)!;
			expect(() => control(f.event, { action: "enable", enabled: true, code: "print(1)" })).toThrow("invalid_input");
			expect(() =>
				control({ ...f.event, senderFrame: {} } as IpcMainInvokeEvent, { action: "enable", enabled: true }),
			).toThrow("unauthorized");
			expect(() =>
				control({ ...f.event, sender: {} } as IpcMainInvokeEvent, { action: "enable", enabled: true }),
			).toThrow("unauthorized");
		} finally {
			f.dispose();
		}
	});
});
