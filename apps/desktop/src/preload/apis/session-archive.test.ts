// Copyright The Open Forge contributors.
import type { IpcRenderer } from "electron";
import { describe, expect, it, vi } from "vitest";
import { createSessionArchiveApi } from "./session-archive.js";

describe("session archive preload contract", () => {
	it("sends export, exportProject and import on their own channels", async () => {
		const invoke = vi.fn(async () => undefined);
		const ipc = { invoke } as unknown as IpcRenderer;
		const sessionArchive = createSessionArchiveApi(ipc).sessionArchive;

		await sessionArchive.export({ sessionPath: "C:/s/a.jsonl", passphrase: "pw" });
		await sessionArchive.exportProject({ cwd: "C:/repo", passphrase: "", defaultFileName: "repo" });
		await sessionArchive.import({ passphrase: "pw" });

		expect(invoke).toHaveBeenNthCalledWith(1, "vetta:session-archive:export", {
			sessionPath: "C:/s/a.jsonl",
			passphrase: "pw",
		});
		expect(invoke).toHaveBeenNthCalledWith(2, "vetta:session-archive:export-project", {
			cwd: "C:/repo",
			passphrase: "",
			defaultFileName: "repo",
		});
		expect(invoke).toHaveBeenNthCalledWith(3, "vetta:session-archive:import", { passphrase: "pw" });
	});
});
