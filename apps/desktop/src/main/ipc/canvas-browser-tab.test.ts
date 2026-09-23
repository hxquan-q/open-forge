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
			saveToProject: vi.fn(async () => ({ ok: true as const, descriptor: { ...descriptor, version: 2 } })),
			deleteWorkspaceArtifact: vi.fn(async () => undefined),
		};
		const teardown = registerCanvasIpc({ host });
		const list = mocks.handlers.get("vetta:canvas:list");
		const get = mocks.handlers.get("vetta:canvas:get");
		const save = mocks.handlers.get("vetta:canvas:save-to-project");
		const remove = mocks.handlers.get("vetta:canvas:delete");
		expect(list).toBeDefined();
		await expect(list?.({}, { workspaceId: "C:/proj" })).resolves.toEqual({
			ok: true,
			items: [{ descriptor, missing: false, externalUpdate: false }],
		});
		await expect(get?.({}, { workspaceId: "C:/proj", artifactId: "artifact-1" })).resolves.toMatchObject({
			ok: true,
			content: "# Hello",
		});
		await expect(
			save?.({}, { workspaceId: "C:/proj", artifactId: "artifact-1", targetPath: "C:/proj/docs/notes.md" }),
		).resolves.toMatchObject({ ok: true, descriptor: { version: 2 } });
		await expect(remove?.({}, { workspaceId: "C:/proj", artifactId: "artifact-1" })).resolves.toEqual({ ok: true });
		await expect(list?.({}, {})).resolves.toEqual({
			ok: false,
			code: "invalid_input",
			message: "workspaceId is required",
		});
		expect(host.listWorkspace).toHaveBeenCalledWith("C:/proj");
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
