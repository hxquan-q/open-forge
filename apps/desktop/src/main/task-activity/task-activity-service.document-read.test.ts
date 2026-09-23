// Copyright The Open Forge contributors.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ArtifactDescriptor, RuntimeSessionTaskState } from "@vetta/runtime-core/task";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
	getTaskState: vi.fn<(...args: string[]) => RuntimeSessionTaskState>(),
	getSessionPath: vi.fn<(...args: string[]) => string | undefined>(),
}));

vi.mock("../runtime.js", () => ({ getSharedRuntime: () => runtime }));

const { desktopTaskActivityService } = await import("./task-activity-service.js");

function createArtifact(uri: string, overrides: Partial<ArtifactDescriptor> = {}): ArtifactDescriptor {
	return {
		schemaVersion: 1,
		artifactId: "artifact-1",
		kind: "document",
		status: "generated",
		title: "纪要.md",
		uri,
		version: 1,
		sourceSessionId: "session-1",
		contentType: "text/markdown",
		createdAt: 10,
		updatedAt: 20,
		...overrides,
	};
}

describe("Task Activity document read", () => {
	let root = "";

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "task-document-read-"));
		runtime.getTaskState.mockReset();
		runtime.getSessionPath.mockReset();
	});

	afterEach(async () => {
		if (root) await rm(root, { recursive: true, force: true });
		root = "";
	});

	it("读取本机产物正文，超长时截断", async () => {
		const path = join(root, "notes.md");
		await writeFile(path, "会议纪要正文", "utf8");
		runtime.getTaskState.mockReturnValue({
			tasks: [],
			artifacts: [createArtifact(pathToFileURL(path).href)],
			pendingApprovals: [],
			approvalDecisions: new Map(),
		});

		await expect(desktopTaskActivityService.readArtifact("session-1", "artifact-1")).resolves.toEqual({
			status: "ok",
			content: "会议纪要正文",
			truncated: false,
			contentType: "text/markdown",
			title: "纪要.md",
		});
	});

	it("找不到产物或源文件时返回对应失败分支", async () => {
		runtime.getTaskState.mockReturnValue({
			tasks: [],
			artifacts: [createArtifact(join(root, "missing.md"))],
			pendingApprovals: [],
			approvalDecisions: new Map(),
		});

		await expect(desktopTaskActivityService.readArtifact("session-1", "artifact-404")).resolves.toEqual({
			status: "not-found",
			artifactId: "artifact-404",
		});
		await expect(desktopTaskActivityService.readArtifact("session-1", "artifact-1")).resolves.toEqual({
			status: "source-missing",
			artifactId: "artifact-1",
		});
	});
});
