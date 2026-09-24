import type { InstalledPlugin } from "@preload/api";
import type { ArtifactRendererResourceBinding, RegisteredArtifactRenderer } from "@shared/store/atoms";
import type { PluginArtifactRendererContribution, PluginArtifactRendererSource } from "@vetta-org/plugin-sdk";
import Ajv from "ajv";
import type { ComponentProps } from "react";
import { createElement } from "react";
import { PluginI18nBoundary } from "./plugin-i18n";
import { createPluginPermissionApi, hasPluginPermission, warnSkippedPluginContribution } from "./plugin-permissions";

const artifactRendererAjv = new Ajv({ allErrors: true, strict: false, validateFormats: false });

export function createPluginArtifactRenderer<Schema extends PluginArtifactRendererContribution["schema"]>(
	plugin: InstalledPlugin,
	capabilitySessionId: string,
	contribution: PluginArtifactRendererContribution<Schema>,
): RegisteredArtifactRenderer | undefined {
	const permissionApi = createPluginPermissionApi(plugin);
	if (!hasPluginPermission(plugin, "ui.slot.artifact-renderer")) {
		warnSkippedPluginContribution(plugin, "ui.slot.artifact-renderer", "artifact renderer");
		return undefined;
	}
	if (typeof contribution.type !== "string" || contribution.type.trim().length === 0) {
		throw new Error("Artifact renderer type is required");
	}
	if (typeof contribution.component !== "function" && typeof contribution.component !== "object") {
		throw new Error("Artifact renderer component is invalid");
	}
	let validate: ReturnType<typeof artifactRendererAjv.compile>;
	try {
		validate = artifactRendererAjv.compile(contribution.schema);
	} catch (error) {
		console.warn(`Plugin ${plugin.id} skipped artifact renderer with invalid schema`, error);
		return undefined;
	}

	const type = contribution.type.trim();
	const validateDescriptor = (descriptor: unknown): boolean => validate(descriptor);
	const component: RegisteredArtifactRenderer["component"] = ({ descriptor, source }) => {
		if (!validateDescriptor(descriptor)) return null;
		const props: ComponentProps<typeof contribution.component> = {
			descriptor: descriptor as ComponentProps<typeof contribution.component>["descriptor"],
			source,
		};
		return createElement(PluginI18nBoundary, { pluginId: plugin.id }, createElement(contribution.component, props));
	};

	return {
		pluginId: plugin.id,
		type,
		canRead: permissionApi.has("fs.read"),
		validateDescriptor,
		component,
		createSource: (binding: ArtifactRendererResourceBinding): PluginArtifactRendererSource => ({
			sizeBytes: binding.sizeBytes,
			readText: () =>
				window.vetta.plugins.internalCapabilities.artifacts.readTaskArtifactText(
					capabilitySessionId,
					binding.taskSessionId,
					binding.artifactId,
					binding.version,
					binding.rendererType,
				),
			readBytes: () =>
				window.vetta.plugins.internalCapabilities.artifacts.readTaskArtifactBytes(
					capabilitySessionId,
					binding.taskSessionId,
					binding.artifactId,
					binding.version,
					binding.rendererType,
				),
		}),
	};
}
