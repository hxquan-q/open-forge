// Copyright The Open Forge contributors.
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCodeProjectFilePolicies } from "./code-project-file-policy.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
	for (const root of temporaryRoots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe("createCodeProjectFilePolicies", () => {
	it("allows only the current project root and its AI workspace", async () => {
		const { project, workspace, outside } = await fixture();
		const policies = createCodeProjectFilePolicies(project, workspace, {
			edit: { getRejectionReason: () => undefined },
			write: { getRejectionReason: () => undefined },
		});

		expect(policies.read.getRejectionReason(join(project, "src", "index.ts"))).toBeUndefined();
		expect(policies.edit.getRejectionReason(join(project, "src", "index.ts"))).toBeUndefined();
		expect(policies.write.getRejectionReason(join(workspace, "project-config.md"))).toBeUndefined();
		expect(policies.read.getRejectionReason(join(outside, "secret.txt"))).toContain("limited to the current project");
	});

	it("rejects a project symlink that resolves outside both authorized roots", async () => {
		const { project, workspace, outside } = await fixture();
		const target = join(outside, "secret.txt");
		await writeFile(target, "secret");
		const linkedDirectory = join(project, "linked-directory");
		await symlink(outside, linkedDirectory, process.platform === "win32" ? "junction" : "dir");
		const policies = createCodeProjectFilePolicies(project, workspace, {
			edit: { getRejectionReason: () => undefined },
			write: { getRejectionReason: () => undefined },
		});

		expect(policies.read.getRejectionReason(join(linkedDirectory, "secret.txt"))).toContain(
			"limited to the current project",
		);
		expect(policies.write.getRejectionReason(join(linkedDirectory, "secret.txt"))).toContain(
			"limited to the current project",
		);
	});
});

async function fixture(): Promise<{ readonly project: string; readonly workspace: string; readonly outside: string }> {
	const root = await mkdtemp(join(tmpdir(), "code-project-file-policy-"));
	temporaryRoots.push(root);
	const project = join(root, "project");
	const workspace = join(root, "ai-workspace");
	const outside = join(root, "other-project");
	await Promise.all([mkdir(project), mkdir(workspace), mkdir(outside)]);
	await mkdir(join(project, "src"));
	return { project, workspace, outside };
}
