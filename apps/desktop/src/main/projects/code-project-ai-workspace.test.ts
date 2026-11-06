// Copyright The Open Forge contributors.
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { resolveCodeProjectAiWorkspace } from "@vetta/runtime-desktop";
import { afterEach, describe, expect, it } from "vitest";
import {
	ensureCodeProjectAiWorkspace,
	type LegacyProjectFilePort,
	readCodeProjectConfig,
	writeCodeProjectConfig,
} from "./code-project-ai-workspace.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
	for (const root of temporaryRoots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe("ensureCodeProjectAiWorkspace Memory/Journal migration", () => {
	it("copies each legacy file before removing its source", async () => {
		const { project, vettaHome } = await fixture();
		const files = memoryFiles({ "MEMORY.md": "memory", "JOURNAL.md": "journal" });

		const workspace = await ensureCodeProjectAiWorkspace(project, { vettaHome, legacyFiles: files.port });

		expect(workspace.migration).toEqual({ "MEMORY.md": "migrated", "JOURNAL.md": "migrated" });
		expect(await readFile(join(workspace.directory, "MEMORY.md"), "utf8")).toBe("memory");
		expect(await readFile(join(workspace.directory, "JOURNAL.md"), "utf8")).toBe("journal");
		expect(files.sources.size).toBe(0);
	});

	it("does not overwrite a destination conflict or remove its source, while migrating the other file", async () => {
		const { project, vettaHome } = await fixture();
		const directory = resolveCodeProjectAiWorkspace(project, { vettaHome }).directory;
		await mkdir(directory, { recursive: true });
		await writeFile(join(directory, "MEMORY.md"), "existing destination");
		const files = memoryFiles({ "MEMORY.md": "legacy memory", "JOURNAL.md": "legacy journal" });

		const workspace = await ensureCodeProjectAiWorkspace(project, { vettaHome, legacyFiles: files.port });

		expect(workspace.migration).toEqual({ "MEMORY.md": "conflict", "JOURNAL.md": "migrated" });
		expect(await readFile(join(directory, "MEMORY.md"), "utf8")).toBe("existing destination");
		expect(files.sources.get("MEMORY.md")).toBe("legacy memory");
		expect(files.sources.has("JOURNAL.md")).toBe(false);
	});

	it("keeps a failed source and continues the independent file migration", async () => {
		const { project, vettaHome } = await fixture();
		const sources = new Map([["JOURNAL.md", "journal"]]);
		const files: LegacyProjectFilePort = {
			read: async (_cwd, fileName) => {
				if (fileName === "MEMORY.md") throw new Error("read failed");
				const content = sources.get(fileName);
				return content === undefined ? undefined : Buffer.from(content);
			},
			remove: async (_cwd, fileName) => {
				sources.delete(fileName);
			},
		};

		const workspace = await ensureCodeProjectAiWorkspace(project, { vettaHome, legacyFiles: files });

		expect(workspace.migration).toEqual({ "MEMORY.md": "copy-failed", "JOURNAL.md": "migrated" });
		expect(await readFile(join(workspace.directory, "JOURNAL.md"), "utf8")).toBe("journal");
		expect(sources.get("JOURNAL.md")).toBeUndefined();
	});

	it("keeps the old source when cleanup fails after the destination copy", async () => {
		const { project, vettaHome } = await fixture();
		const files: LegacyProjectFilePort = {
			read: async () => Buffer.from("legacy"),
			remove: async () => {
				throw new Error("remove failed");
			},
		};

		const workspace = await ensureCodeProjectAiWorkspace(project, { vettaHome, legacyFiles: files });

		expect(workspace.migration["MEMORY.md"]).toBe("source-retained");
		expect(await readFile(join(workspace.directory, "MEMORY.md"), "utf8")).toBe("legacy");
	});

	it("rejects a workspace directory that is a symlink", async () => {
		const { project, vettaHome } = await fixture();
		const directory = resolveCodeProjectAiWorkspace(project, { vettaHome }).directory;
		const outside = join(vettaHome, "outside");
		await mkdir(dirname(directory), { recursive: true });
		await mkdir(outside, { recursive: true });
		await symlink(outside, directory, process.platform === "win32" ? "junction" : "dir");

		await expect(ensureCodeProjectAiWorkspace(project, { vettaHome })).rejects.toThrow("real directory");
	});

	it("does not migrate the old project-local configuration file", async () => {
		const { project, vettaHome } = await fixture();
		const oldConfig = join(project, ".vetta", "allstar", "project-config.md");
		await mkdir(dirname(oldConfig), { recursive: true });
		await writeFile(oldConfig, "legacy project config");

		expect(await readCodeProjectConfig(project, { vettaHome })).toEqual({ exists: false, content: "" });
		expect(await readFile(oldConfig, "utf8")).toBe("legacy project config");
	});

	it("preserves arbitrary project config text, including an explicitly empty file", async () => {
		const { project, vettaHome } = await fixture();
		const options = { vettaHome };
		const original = "# Project\n\n  arbitrary text\n";

		expect(await readCodeProjectConfig(project, options)).toEqual({ exists: false, content: "" });
		await writeCodeProjectConfig(project, original, options);
		expect(await readCodeProjectConfig(project, options)).toEqual({ exists: true, content: original });

		await writeCodeProjectConfig(project, "", options);
		expect(await readCodeProjectConfig(project, options)).toEqual({ exists: true, content: "" });
	});
});

async function fixture(): Promise<{ readonly project: string; readonly vettaHome: string }> {
	const root = await mkdtemp(join(tmpdir(), "code-project-workspace-"));
	temporaryRoots.push(root);
	const project = join(root, "project");
	const vettaHome = join(root, "vetta-home");
	return { project, vettaHome };
}

function memoryFiles(initial: Readonly<Record<string, string>>): {
	readonly port: LegacyProjectFilePort;
	readonly sources: Map<string, string>;
} {
	const sources = new Map(Object.entries(initial));
	return {
		sources,
		port: {
			read: async (_cwd, fileName) => {
				const content = sources.get(fileName);
				return content === undefined ? undefined : Buffer.from(content);
			},
			remove: async (_cwd, fileName) => {
				sources.delete(fileName);
			},
		},
	};
}
