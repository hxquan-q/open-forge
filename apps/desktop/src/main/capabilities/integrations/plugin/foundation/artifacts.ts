import { FOUNDATION_ARTIFACT_CAPABILITIES, type PersistedArtifact } from "@vetta-org/capability-sdk";
import { desktopTaskActivityService } from "../../../../task-activity/task-activity-service.js";
import { PLUGIN_CAPABILITY_PERMISSIONS, type PluginCapabilitySessionAccess } from "../types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function qualifyDestination(access: PluginCapabilitySessionAccess, sessionId: string, input: unknown): unknown {
	if (!isRecord(input) || !isRecord(input.destination)) return input;
	const session = access.session(sessionId, { permission: PLUGIN_CAPABILITY_PERMISSIONS.MEDIA_GENERATE });
	if (input.destination.type === "plugin-blob") {
		access.session(sessionId, { permission: PLUGIN_CAPABILITY_PERMISSIONS.STORAGE_WRITE });
		const { blobId, ...destination } = input.destination;
		return {
			...input,
			ownerId: session.pluginId,
			destination: { ...destination, type: "storage-blob", namespace: session.pluginId, id: blobId },
		};
	}
	if (input.destination.type === "workspace-file") {
		access.session(sessionId, { permission: PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_WRITE });
		return {
			...input,
			ownerId: session.pluginId,
			destination: { ...input.destination, type: "filesystem" },
		};
	}
	return { ...input, ownerId: session.pluginId };
}

export const pluginArtifactMethods = {
	persistArtifact(this: PluginCapabilitySessionAccess, sessionId: string, input: unknown): Promise<PersistedArtifact> {
		const qualified = qualifyDestination(this, sessionId, input);
		return this.client(sessionId, { permission: PLUGIN_CAPABILITY_PERMISSIONS.MEDIA_GENERATE }).invoke(
			FOUNDATION_ARTIFACT_CAPABILITIES.PERSIST,
			FOUNDATION_ARTIFACT_CAPABILITIES.PERSIST.parseInput(qualified),
		);
	},

	readTaskArtifactText(
		this: PluginCapabilitySessionAccess,
		sessionId: string,
		taskSessionId: string,
		artifactId: string,
		version: number,
		rendererType: string,
	): Promise<string> {
		const session = this.session(sessionId, { permission: PLUGIN_CAPABILITY_PERMISSIONS.ARTIFACT_RENDERER });
		this.session(sessionId, { permission: PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_READ });
		return desktopTaskActivityService.readArtifactRendererText(session.pluginId, {
			taskSessionId,
			artifactId,
			version,
			rendererType,
		});
	},

	readTaskArtifactBytes(
		this: PluginCapabilitySessionAccess,
		sessionId: string,
		taskSessionId: string,
		artifactId: string,
		version: number,
		rendererType: string,
	): Promise<ArrayBuffer> {
		const session = this.session(sessionId, { permission: PLUGIN_CAPABILITY_PERMISSIONS.ARTIFACT_RENDERER });
		this.session(sessionId, { permission: PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_READ });
		return desktopTaskActivityService.readArtifactRendererBytes(session.pluginId, {
			taskSessionId,
			artifactId,
			version,
			rendererType,
		});
	},

	async releaseArtifact(this: PluginCapabilitySessionAccess, sessionId: string, artifactId: string): Promise<void> {
		const session = this.session(sessionId, { permission: PLUGIN_CAPABILITY_PERMISSIONS.MEDIA_GENERATE });
		await session.access.client.invoke(FOUNDATION_ARTIFACT_CAPABILITIES.RELEASE, {
			ownerId: session.pluginId,
			artifactId,
		});
	},
};

export type PluginArtifactMethods = typeof pluginArtifactMethods;
