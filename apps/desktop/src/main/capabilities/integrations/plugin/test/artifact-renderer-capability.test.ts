import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecordingAccessFactory } from "./helpers/recording-access-factory.js";

const artifactReads = vi.hoisted(() => ({
	readText: vi.fn(async () => "authorized artifact text"),
	readBytes: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
}));

vi.mock("../../../../task-activity/task-activity-service.js", () => ({
	desktopTaskActivityService: {
		readArtifactRendererText: artifactReads.readText,
		readArtifactRendererBytes: artifactReads.readBytes,
	},
}));

const { PLUGIN_CAPABILITY_PERMISSIONS, PluginCapabilityAdapter } = await import("../index.js");

describe("Plugin Artifact renderer capability", () => {
	beforeEach(() => {
		artifactReads.readText.mockClear();
		artifactReads.readBytes.mockClear();
	});

	it("reads a Task Artifact only when both renderer and filesystem-read permissions are granted", async () => {
		const permissions = [
			PLUGIN_CAPABILITY_PERMISSIONS.ARTIFACT_RENDERER,
			PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_READ,
		];
		const adapter = new PluginCapabilityAdapter(new RecordingAccessFactory(), {
			isOfficialPlugin: () => false,
			resolvePermissions: () => permissions,
		});
		const capabilitySessionId = adapter.openSession("artifact-viewer");

		await expect(
			adapter.readTaskArtifactText(capabilitySessionId, "task-session", "artifact-1", 2, "artifact-viewer:analysis"),
		).resolves.toBe("authorized artifact text");
		await expect(
			adapter.readTaskArtifactBytes(
				capabilitySessionId,
				"task-session",
				"artifact-1",
				2,
				"artifact-viewer:analysis",
			),
		).resolves.toEqual(new Uint8Array([1, 2, 3]).buffer);
		expect(artifactReads.readText).toHaveBeenCalledWith("artifact-viewer", {
			taskSessionId: "task-session",
			artifactId: "artifact-1",
			version: 2,
			rendererType: "artifact-viewer:analysis",
		});
	});

	it("denies reads after either permission is missing or the capability session is closed", async () => {
		const permissions: string[] = [PLUGIN_CAPABILITY_PERMISSIONS.ARTIFACT_RENDERER];
		const adapter = new PluginCapabilityAdapter(new RecordingAccessFactory(), {
			isOfficialPlugin: () => false,
			resolvePermissions: () => permissions,
		});
		const capabilitySessionId = adapter.openSession("artifact-viewer");
		// session() 权限闸是同步校验，与适配器其余方法的同步 throw 惯例一致。
		expect(() =>
			adapter.readTaskArtifactText(capabilitySessionId, "task-session", "artifact-1", 2, "artifact-viewer:analysis"),
		).toThrowError("Plugin capability permission denied: fs.read");
		expect(artifactReads.readText).not.toHaveBeenCalled();

		permissions.push(PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_READ);
		await adapter.closeSession(capabilitySessionId);
		expect(() =>
			adapter.readTaskArtifactText(capabilitySessionId, "task-session", "artifact-1", 2, "artifact-viewer:analysis"),
		).toThrowError("Plugin capability session is not active");
		expect(artifactReads.readText).not.toHaveBeenCalled();
	});
});
