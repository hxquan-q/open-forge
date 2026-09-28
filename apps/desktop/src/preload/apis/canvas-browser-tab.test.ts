// Copyright The Open Forge contributors.
import type { IpcRenderer } from "electron";
import { describe, expect, it, vi } from "vitest";
import { createBrowserTabApi } from "./browser-tab.js";
import { createCanvasApi } from "./canvas.js";

describe("canvas / browserTab preload 桩", () => {
	it("把 window.vetta.canvas 接到冻结的 channel", async () => {
		const invoke = vi.fn(async () => ({ ok: false, code: "unimplemented", message: "canvas is not implemented" }));
		const api = createCanvasApi({ invoke } as unknown as IpcRenderer);
		await expect(api.canvas.list({ workspaceId: "ws-1" })).resolves.toMatchObject({ code: "unimplemented" });
		expect(invoke).toHaveBeenCalledWith("vetta:canvas:list", { workspaceId: "ws-1" });
		await api.canvas.get({ workspaceId: "ws-1", artifactId: "art-1" });
		expect(invoke).toHaveBeenCalledWith("vetta:canvas:get", { workspaceId: "ws-1", artifactId: "art-1" });
		await api.canvas.openInBrowser({ workspaceId: "ws-1", artifactId: "art-1" });
		expect(invoke).toHaveBeenCalledWith("vetta:canvas:open-in-browser", { workspaceId: "ws-1", artifactId: "art-1" });
		await api.canvas.saveToProject({ workspaceId: "ws-1", artifactId: "art-1", targetPath: "docs/a.md" });
		expect(invoke).toHaveBeenCalledWith("vetta:canvas:save-to-project", {
			workspaceId: "ws-1",
			artifactId: "art-1",
			targetPath: "docs/a.md",
		});
		await api.canvas.delete({ workspaceId: "ws-1", artifactId: "art-1" });
		expect(invoke).toHaveBeenCalledWith("vetta:canvas:delete", { workspaceId: "ws-1", artifactId: "art-1" });
	});

	it("把 window.vetta.browserTab 接到 picker / 会话 / 裁剪 channel", async () => {
		const invoke = vi.fn(async () => ({
			ok: false,
			code: "unimplemented",
			message: "browserTab is not implemented",
		}));
		const on = vi.fn();
		const removeListener = vi.fn();
		const api = createBrowserTabApi({ invoke, on, removeListener } as unknown as IpcRenderer);
		await api.browserTab.getSession({ workspaceId: "ws-1" });
		expect(invoke).toHaveBeenCalledWith("vetta:browser-tab:session", { workspaceId: "ws-1" });
		await api.browserTab.setPicker({ workspaceId: "ws-1", enabled: true });
		expect(invoke).toHaveBeenCalledWith("vetta:browser-tab:set-picker", { workspaceId: "ws-1", enabled: true });
		await api.browserTab.cropScreenshot({
			workspaceId: "ws-1",
			rect: { x: 1, y: 2, width: 3, height: 4 },
			devicePixelRatio: 2,
		});
		expect(invoke).toHaveBeenCalledWith("vetta:browser-tab:crop-screenshot", {
			workspaceId: "ws-1",
			rect: { x: 1, y: 2, width: 3, height: 4 },
			devicePixelRatio: 2,
		});
		const unsubscribe = api.browserTab.onEvent(() => {});
		expect(on).toHaveBeenCalledWith("vetta:browser-tab:event", expect.any(Function));
		unsubscribe();
		expect(removeListener).toHaveBeenCalledWith("vetta:browser-tab:event", expect.any(Function));
	});
});
