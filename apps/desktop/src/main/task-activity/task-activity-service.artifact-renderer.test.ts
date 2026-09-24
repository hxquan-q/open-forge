import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ArtifactDescriptor, RuntimeSessionTaskState } from "@vetta/runtime-core/task";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
	getTaskState: vi.fn<(...args: string[]) => RuntimeSessionTaskState>(),
	getSessionPath: vi.fn<(...args: string[]) => string | undefined>(),
}));

vi.mock("../runtime.js", () => ({ getSharedRuntime: () => runtime }));

const { desktopTaskActivityService } = await import("./task-activity-service.js");

const SESSION_ID = "session-artifact-renderer";
let temporaryRoot = "";
let projectRoot = "";
let sessionPath = "";
let artifact: ArtifactDescriptor;
let state: RuntimeSessionTaskState;

function createArtifact(uri: string, overrides: Partial<ArtifactDescriptor> = {}): ArtifactDescriptor {
	return {
		schemaVersion: 1,
		artifactId: "artifact-1",
		kind: "analysis",
		status: "generated",
		title: "Summary",
		uri,
		version: 1,
		sourceSessionId: SESSION_ID,
		contentType: "text/plain",
		createdAt: 10,
		updatedAt: 20,
		...overrides,
	};
}

beforeEach(async () => {
	temporaryRoot = await mkdtemp(join(tmpdir(), "task-artifact-renderer-service-"));
	projectRoot = join(temporaryRoot, "project");
	sessionPath = join(temporaryRoot, "session.jsonl");
	await mkdir(projectRoot);
	await writeFile(sessionPath, `${JSON.stringify({ type: "session", cwd: projectRoot })}\n`, "utf8");
	await writeFile(join(projectRoot, "report.txt"), "approved report", "utf8");
	artifact = createArtifact("report.txt");
	state = { tasks: [], artifacts: [artifact], pendingApprovals: [], approvalDecisions: new Map() };
	runtime.getTaskState.mockReset().mockImplementation(() => state);
	runtime.getSessionPath.mockReset().mockReturnValue(sessionPath);
});

afterEach(async () => {
	if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
	temporaryRoot = "";
});

describe("Task Artifact renderer resource access", () => {
	it("returns a URI-free view and reads only the matching source Artifact", async () => {
		const views = await desktopTaskActivityService.getArtifactViews(SESSION_ID);
		expect(views).toMatchObject([
			{
				taskSessionId: SESSION_ID,
				sourceSessionId: SESSION_ID,
				descriptor: { artifactId: "artifact-1", kind: "analysis", title: "Summary" },
				rendererStatus: "available",
				sizeBytes: 15,
			},
		]);
		expect("uri" in (views[0]?.descriptor ?? {})).toBe(false);
		await expect(
			desktopTaskActivityService.readArtifactRendererText("plugin", {
				taskSessionId: SESSION_ID,
				artifactId: "artifact-1",
				version: 1,
				rendererType: "analysis",
			}),
		).resolves.toBe("approved report");
	});

	it("rejects a URI outside the source Session root and renderer type mismatches", async () => {
		const outsidePath = join(temporaryRoot, "outside.txt");
		await writeFile(outsidePath, "private", "utf8");
		artifact = createArtifact("../outside.txt");
		state = { ...state, artifacts: [artifact] };
		const views = await desktopTaskActivityService.getArtifactViews(SESSION_ID);
		expect(views[0]?.rendererStatus).toBe("unavailable");
		await expect(
			desktopTaskActivityService.readArtifactRendererText("plugin", {
				taskSessionId: SESSION_ID,
				artifactId: "artifact-1",
				version: 1,
				rendererType: "analysis",
			}),
		).rejects.toThrow(/outside its source project/);

		artifact = createArtifact("report.txt", { rendererType: "plugin:analysis-view" });
		state = { ...state, artifacts: [artifact] };
		await expect(
			desktopTaskActivityService.readArtifactRendererText("plugin", {
				taskSessionId: SESSION_ID,
				artifactId: "artifact-1",
				version: 1,
				rendererType: "analysis",
			}),
		).rejects.toThrow(/not authorized/);
	});

	it("rejects stale versions and released source Sessions", async () => {
		await expect(
			desktopTaskActivityService.readArtifactRendererText("plugin", {
				taskSessionId: SESSION_ID,
				artifactId: "artifact-1",
				version: 2,
				rendererType: "analysis",
			}),
		).rejects.toThrow(/missing or has changed/);

		runtime.getSessionPath.mockReturnValue(undefined);
		await expect(
			desktopTaskActivityService.readArtifactRendererText("plugin", {
				taskSessionId: SESSION_ID,
				artifactId: "artifact-1",
				version: 1,
				rendererType: "analysis",
			}),
		).rejects.toThrow(/outside its source project/);
	});
});
