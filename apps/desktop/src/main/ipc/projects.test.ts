// Copyright The Open Forge contributors.
import { beforeEach, describe, expect, it, vi } from "vitest";

const ipc = vi.hoisted(() => ({
	handlers: new Map<string, (...args: unknown[]) => unknown>(),
	removed: [] as string[],
}));
const codeConfig = vi.hoisted(() => ({
	read: vi.fn(async (projectCwd: string) => ({ exists: true, content: `config:${projectCwd}` })),
	write: vi.fn(async (_projectCwd: string, _content: string) => undefined),
}));

vi.mock("electron", () => ({
	ipcMain: {
		handle: (channel: string, handler: (...args: unknown[]) => unknown) => ipc.handlers.set(channel, handler),
		removeHandler: (channel: string) => ipc.removed.push(channel),
	},
}));
vi.mock("../projects/code-project-ai-workspace.js", () => ({
	readCodeProjectConfig: codeConfig.read,
	writeCodeProjectConfig: codeConfig.write,
}));
vi.mock("../projects/project-service-instance.js", () => ({
	getDesktopProjectService: () => ({
		list: vi.fn(),
		create: vi.fn(),
		open: vi.fn(),
		rename: vi.fn(),
		archive: vi.fn(),
		unarchive: vi.fn(),
		remove: vi.fn(),
	}),
}));

import { registerProjectsIpc } from "./projects.js";

describe("Code project workspace IPC", () => {
	beforeEach(() => {
		ipc.handlers.clear();
		ipc.removed.length = 0;
		codeConfig.read.mockClear();
		codeConfig.write.mockClear();
	});

	it("round-trips project identity and raw text through the workspace service", async () => {
		const teardown = registerProjectsIpc();
		const read = ipc.handlers.get("vetta:projects:read-code-config");
		const write = ipc.handlers.get("vetta:projects:write-code-config");
		if (!read || !write) throw new Error("Code project config handlers were not registered");

		await expect(read({}, "C:/project")).resolves.toEqual({ exists: true, content: "config:C:/project" });
		await expect(
			write({}, { projectCwd: "ssh://build-a/srv/project", content: "\n arbitrary\n" }),
		).resolves.toBeUndefined();

		expect(codeConfig.read).toHaveBeenCalledWith("C:/project");
		expect(codeConfig.write).toHaveBeenCalledWith("ssh://build-a/srv/project", "\n arbitrary\n");
		teardown();
		expect(ipc.removed).toContain("vetta:projects:write-code-config");
	});

	it("rejects malformed config writes at the IPC boundary", async () => {
		registerProjectsIpc();
		const write = ipc.handlers.get("vetta:projects:write-code-config");
		if (!write) throw new Error("Code project config handler was not registered");

		expect(() => write({}, { projectCwd: "C:/project", content: 1 })).toThrow("Invalid content");
		expect(codeConfig.write).not.toHaveBeenCalled();
	});
});
