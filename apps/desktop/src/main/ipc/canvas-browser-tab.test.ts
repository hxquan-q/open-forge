// Copyright The Open Forge contributors.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	handlers: new Map<string, (...args: unknown[]) => unknown>(),
	removeHandler: vi.fn(),
}));

vi.mock("electron", () => ({
	ipcMain: {
		handle: (channel: string, handler: (...args: unknown[]) => unknown) => mocks.handlers.set(channel, handler),
		removeHandler: mocks.removeHandler,
	},
}));

const { registerBrowserTabIpc } = await import("./browser-tab.js");
const { registerCanvasIpc } = await import("./canvas.js");

describe("canvas and browser-tab IPC stubs", () => {
	beforeEach(() => {
		mocks.handlers.clear();
		mocks.removeHandler.mockClear();
	});

	it("注册全部 canvas channel 并返回 unimplemented", async () => {
		const teardown = registerCanvasIpc();
		for (const channel of [
			"vetta:canvas:list",
			"vetta:canvas:get",
			"vetta:canvas:save-to-project",
			"vetta:canvas:delete",
		]) {
			const handler = mocks.handlers.get(channel);
			expect(handler).toBeDefined();
			await expect(handler?.({})).resolves.toEqual({
				ok: false,
				code: "unimplemented",
				message: "canvas is not implemented",
			});
		}
		teardown();
		expect(mocks.removeHandler).toHaveBeenCalledTimes(4);
	});

	it("注册 browser-tab 桥与截图裁剪 channel 并返回 unimplemented", async () => {
		const teardown = registerBrowserTabIpc();
		for (const channel of [
			"vetta:browser-tab:session",
			"vetta:browser-tab:set-picker",
			"vetta:browser-tab:crop-screenshot",
		]) {
			const handler = mocks.handlers.get(channel);
			expect(handler).toBeDefined();
			await expect(handler?.({})).resolves.toEqual({
				ok: false,
				code: "unimplemented",
				message: "browserTab is not implemented",
			});
		}
		teardown();
		expect(mocks.removeHandler).toHaveBeenCalledTimes(3);
	});
});
