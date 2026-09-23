// Modified by The Open Forge contributors.
// @vitest-environment jsdom

import { expect, it, vi } from "vitest";
import type { DesktopApi } from "./api.js";

const expose = vi.hoisted(() => vi.fn<(name: string, api: DesktopApi) => void>());
vi.mock("@sentry/electron/preload-namespaced", () => ({ hookupIpc: vi.fn() }));
vi.mock("@sentry/electron/renderer", () => ({ init: vi.fn() }));
vi.mock("electron", () => ({
	contextBridge: { exposeInMainWorld: expose },
	ipcRenderer: { on: vi.fn(), send: vi.fn(), sendSync: vi.fn(() => "en"), invoke: vi.fn(), removeListener: vi.fn() },
	webUtils: { getPathForFile: vi.fn() },
}));

it("exposes the Desktop bridge without Agent configuration or diagnostic APIs", async () => {
	await import("./index.js");
	const [name, api] = expose.mock.calls[0]!;
	expect(name).toBe("vetta");
	expect(api).not.toHaveProperty("agentConfiguration");
	expect(api).not.toHaveProperty("agentTraces");
	expect(api.session.create).toBeTypeOf("function");
	expect(api.session.prompt).toBeTypeOf("function");
	expect(api.canvas.list).toBeTypeOf("function");
	expect(api.canvas.get).toBeTypeOf("function");
	expect(api.canvas.saveToProject).toBeTypeOf("function");
	expect(api.canvas.delete).toBeTypeOf("function");
	expect(api.browserTab.getSession).toBeTypeOf("function");
	expect(api.browserTab.setPicker).toBeTypeOf("function");
	expect(api.browserTab.cropScreenshot).toBeTypeOf("function");
	expect(api.browserTab.onEvent).toBeTypeOf("function");
});
