import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
	inspectArtifactRendererResource,
	readArtifactRendererBytes,
	readArtifactRendererText,
} from "./artifact-renderer-resource.js";

let temporaryRoot = "";
let projectRoot = "";
let outsideRoot = "";

async function createWorkspace(): Promise<void> {
	temporaryRoot = await mkdtemp(join(tmpdir(), "task-artifact-renderer-"));
	projectRoot = join(temporaryRoot, "project");
	outsideRoot = join(temporaryRoot, "outside");
	await Promise.all([mkdir(projectRoot), mkdir(outsideRoot)]);
}

afterEach(async () => {
	if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
	temporaryRoot = "";
});

describe("Artifact renderer resource authorization", () => {
	it("reads local absolute paths and file URIs only from the source session root", async () => {
		await createWorkspace();
		const artifactPath = join(projectRoot, "report.txt");
		await writeFile(artifactPath, "approved report", "utf8");

		expect(await inspectArtifactRendererResource(artifactPath, projectRoot)).toMatchObject({
			status: "available",
			sizeBytes: 15,
		});
		expect(await readArtifactRendererText(pathToFileURL(artifactPath).href, projectRoot)).toBe("approved report");
		expect(new TextDecoder().decode(await readArtifactRendererBytes(artifactPath, projectRoot))).toBe(
			"approved report",
		);
	});

	it("rejects traversal and symlink escapes before returning a readable resource", async () => {
		await createWorkspace();
		const outsideFile = join(outsideRoot, "private.txt");
		await writeFile(outsideFile, "outside project", "utf8");
		const traversingPath = resolve(projectRoot, "..", relative(temporaryRoot, outsideFile));
		const link = join(projectRoot, "linked");
		await symlink(outsideRoot, link, process.platform === "win32" ? "junction" : "dir");

		expect(await inspectArtifactRendererResource(traversingPath, projectRoot)).toMatchObject({
			status: "unavailable",
		});
		expect(await inspectArtifactRendererResource(join(link, "private.txt"), projectRoot)).toMatchObject({
			status: "unavailable",
		});
		await expect(readArtifactRendererText(join(link, "private.txt"), projectRoot)).rejects.toThrow(/unavailable/);
	});

	it("keeps missing files distinct from unsupported or unauthorized URIs", async () => {
		await createWorkspace();
		expect(await inspectArtifactRendererResource(join(projectRoot, "missing.txt"), projectRoot)).toMatchObject({
			status: "missing",
		});
		expect(await inspectArtifactRendererResource("https://example.invalid/report.txt", projectRoot)).toMatchObject({
			status: "unavailable",
		});
	});
});
