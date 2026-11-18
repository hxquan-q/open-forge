// Copyright The Open Forge contributors.
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SshConnection } from "@vetta/ssh-transport";
import { afterEach, describe, expect, it } from "vitest";
import { createSshEditOperations, createSshReadOperations, createSshWriteOperations } from "./ssh-file-operations.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
	for (const root of temporaryRoots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe("SSH file operations for a local project AI workspace", () => {
	it("routes the session virtual root to local storage for read, edit, and write", async () => {
		const root = await mkdtemp(join(tmpdir(), "ssh-local-code-workspace-"));
		temporaryRoots.push(root);
		const workspace = { directory: root, toolRoot: "vetta-workspace://project-id/" };
		const filePath = `${workspace.toolRoot}project-config.md`;
		await writeFile(join(root, "project-config.md"), "original");
		const connection = {} as SshConnection;
		const read = createSshReadOperations(connection, { localWorkspace: workspace });
		const write = createSshWriteOperations(connection, { localWorkspace: workspace });
		const edit = createSshEditOperations(connection, { localWorkspace: workspace });

		expect((await read.readFile(filePath)).toString("utf8")).toBe("original");
		expect((await edit.readFile(filePath)).toString("utf8")).toBe("original");
		await edit.writeFile(filePath, "updated");
		await write.mkdir(`${workspace.toolRoot}notes`);
		await write.writeFile(`${workspace.toolRoot}notes/requirements.md`, "notes");

		expect(await readFile(join(root, "project-config.md"), "utf8")).toBe("updated");
		expect(await readFile(join(root, "notes", "requirements.md"), "utf8")).toBe("notes");
	});

	it("rejects virtual paths that traverse outside the local workspace", async () => {
		const root = await mkdtemp(join(tmpdir(), "ssh-local-code-workspace-"));
		temporaryRoots.push(root);
		const workspace = { directory: root, toolRoot: "vetta-workspace://project-id/" };
		const read = createSshReadOperations({} as SshConnection, { localWorkspace: workspace });

		await expect(read.readFile(`${workspace.toolRoot}../outside.txt`)).rejects.toThrow(
			"outside the project AI workspace",
		);
	});

	it("rejects a local workspace symlink that points outside the workspace root", async () => {
		const root = await mkdtemp(join(tmpdir(), "ssh-local-code-workspace-"));
		const outside = await mkdtemp(join(tmpdir(), "ssh-local-code-outside-"));
		temporaryRoots.push(root, outside);
		const workspace = { directory: root, toolRoot: "vetta-workspace://project-id/" };
		await writeFile(join(outside, "secret.txt"), "secret");
		await symlink(outside, join(root, "escape"), process.platform === "win32" ? "junction" : "dir");
		const read = createSshReadOperations({} as SshConnection, { localWorkspace: workspace });

		await expect(read.readFile(`${workspace.toolRoot}escape/secret.txt`)).rejects.toThrow(
			"outside the project AI workspace",
		);
	});
});
