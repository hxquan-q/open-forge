// Copyright The Open Forge contributors.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasPreviewOpener } from "./canvas.js";

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

vi.mock("../window-manager.js", () => ({
	getMainWindow: () => null,
}));

const { registerBrowserTabIpc } = await import("./browser-tab.js");
const { registerCanvasIpc } = await import("./canvas.js");
const { resetInAppBrowserSessionControllerForTests } = await import(
	"../browser-automation/webview-session-controller.js"
);

const descriptor = {
	schemaVersion: 1 as const,
	artifactId: "artifact-1",
	kind: "document" as const,
	status: "generated" as const,
	title: "Notes",
	uri: "file:///tmp/v1.md",
	version: 1,
	sourceSessionId: "session-1",
	createdAt: 1,
	updatedAt: 1,
};

describe("canvas and browser-tab IPC stubs", () => {
	beforeEach(() => {
		mocks.handlers.clear();
		mocks.removeHandler.mockClear();
		resetInAppBrowserSessionControllerForTests();
	});

	it("注册全部 canvas channel，并由注入宿主返回列表与错误形状", async () => {
		const host = {
			listWorkspace: vi.fn(async () => [{ descriptor, missing: false, externalUpdate: false }]),
			getWorkspace: vi.fn(async () => ({
				ok: true as const,
				view: { descriptor, missing: false, externalUpdate: false },
				content: "# Hello",
				contentType: "text/markdown",
			})),
			applyUpdate: vi.fn(async () => ({ ok: true as const, descriptor: { ...descriptor, version: 2 } })),
			saveToProject: vi.fn(async () => ({ ok: true as const, descriptor: { ...descriptor, version: 2 } })),
			deleteWorkspaceArtifact: vi.fn(async () => undefined),
		};
		const preview = vi.fn<CanvasPreviewOpener>(async () => ({
			ok: true,
			url: "http://127.0.0.1:41234/canvas/token/artifact-1/index.html",
		}));
		const teardown = registerCanvasIpc({ host, preview });
		const list = mocks.handlers.get("vetta:canvas:list");
		const get = mocks.handlers.get("vetta:canvas:get");
		const update = mocks.handlers.get("vetta:canvas:update");
		const save = mocks.handlers.get("vetta:canvas:save-to-project");
		const remove = mocks.handlers.get("vetta:canvas:delete");
		const openInBrowser = mocks.handlers.get("vetta:canvas:open-in-browser");
		expect(list).toBeDefined();
		expect(update).toBeDefined();
		await expect(list?.({}, { workspaceId: "C:/proj" })).resolves.toEqual({
			ok: true,
			items: [{ descriptor, missing: false, externalUpdate: false }],
		});
		await expect(get?.({}, { workspaceId: "C:/proj", artifactId: "artifact-1" })).resolves.toMatchObject({
			ok: true,
			content: "# Hello",
		});
		await expect(
			update?.({}, { workspaceId: "C:/proj", artifactId: "artifact-1", baseVersion: 1, content: "edited" }),
		).resolves.toMatchObject({ ok: true, descriptor: { version: 2 } });
		expect(host.applyUpdate).toHaveBeenCalledWith({
			workspaceId: "C:/proj",
			artifactId: "artifact-1",
			baseVersion: 1,
			content: "edited",
			signal: expect.anything(),
		});
		await expect(
			save?.({}, { workspaceId: "C:/proj", artifactId: "artifact-1", targetPath: "C:/proj/docs/notes.md" }),
		).resolves.toMatchObject({ ok: true, descriptor: { version: 2 } });
		await expect(remove?.({}, { workspaceId: "C:/proj", artifactId: "artifact-1" })).resolves.toEqual({ ok: true });
		await expect(openInBrowser?.({}, { workspaceId: "C:/proj", artifactId: "artifact-1" })).resolves.toEqual({
			ok: true,
			url: "http://127.0.0.1:41234/canvas/token/artifact-1/index.html",
		});
		expect(preview).toHaveBeenCalledWith({ workspaceId: "C:/proj", artifactId: "artifact-1" });
		await expect(openInBrowser?.({}, { workspaceId: "C:/proj" })).resolves.toEqual({
			ok: false,
			code: "invalid_input",
			message: "workspaceId and artifactId are required",
		});
		preview.mockResolvedValueOnce({ ok: false, code: "missing_file", message: "no html version" });
		await expect(openInBrowser?.({}, { workspaceId: "C:/proj", artifactId: "artifact-1" })).resolves.toEqual({
			ok: false,
			code: "missing_file",
			message: "no html version",
		});
		await expect(list?.({}, {})).resolves.toEqual({
			ok: false,
			code: "invalid_input",
			message: "workspaceId is required",
		});
		expect(host.listWorkspace).toHaveBeenCalledWith("C:/proj");
		teardown();
		expect(mocks.removeHandler).toHaveBeenCalledTimes(6);
	});

	it("用户写入缺字段回 invalid_input，宿主拒绝时原样透出 stale_version", async () => {
		const host = {
			listWorkspace: vi.fn(async () => []),
			getWorkspace: vi.fn(async () => ({ ok: false as const, code: "missing_file" as const, message: "gone" })),
			applyUpdate: vi.fn(async () => ({
				ok: false as const,
				error: {
					ok: false as const,
					code: "stale_version" as const,
					message: "artifact version is stale",
					action: "update" as const,
					artifactId: "artifact-1",
					baseVersion: 1,
					currentVersion: 2,
				},
			})),
			saveToProject: vi.fn(async () => ({ ok: false as const, code: "conflict" as const, message: "exists" })),
			deleteWorkspaceArtifact: vi.fn(async () => undefined),
		};
		registerCanvasIpc({ host });
		const update = mocks.handlers.get("vetta:canvas:update");

		await expect(update?.({}, { workspaceId: "C:/proj", artifactId: "artifact-1", content: "x" })).resolves.toEqual({
			ok: false,
			code: "invalid_input",
			message: "workspaceId, artifactId, baseVersion and content are required",
		});
		await expect(
			update?.({}, { workspaceId: "C:/proj", artifactId: "artifact-1", baseVersion: 1, content: "" }),
		).resolves.toEqual({ ok: false, code: "stale_version", message: "artifact version is stale" });
	});

	it("把 browser-tab 桥接到 WebView 会话控制器", async () => {
		const teardown = registerBrowserTabIpc();
		const sessionHandler = mocks.handlers.get("vetta:browser-tab:session");
		await expect(sessionHandler?.({}, { workspaceId: "ws-1" })).resolves.toEqual({
			ok: true,
			session: {
				workspaceId: "ws-1",
				pageUrl: "",
				title: "",
				pageRevision: 0,
				pickerEnabled: false,
			},
		});
		const pickerHandler = mocks.handlers.get("vetta:browser-tab:set-picker");
		await expect(pickerHandler?.({}, { workspaceId: "ws-1", enabled: true })).resolves.toEqual({
			ok: true,
			pickerEnabled: true,
		});
		const cropHandler = mocks.handlers.get("vetta:browser-tab:crop-screenshot");
		await expect(
			cropHandler?.({}, { workspaceId: "ws-1", rect: { x: 1, y: 2, width: 3, height: 4 }, devicePixelRatio: 1 }),
		).resolves.toMatchObject({ ok: false, code: "no_browser_session" });
		const liveEditHandler = mocks.handlers.get("vetta:browser-tab:live-edit");
		await expect(
			liveEditHandler?.(
				{},
				{
					workspaceId: "ws-1",
					elementRef: { domPath: "html/body/div[1]", pageRevision: 0 },
					action: { type: "apply", edit: { kind: "style", property: "color", value: "red" } },
				},
			),
		).resolves.toMatchObject({ ok: false, code: "no_browser_session" });
		teardown();
		expect(mocks.removeHandler).toHaveBeenCalledTimes(4);
	});
});
