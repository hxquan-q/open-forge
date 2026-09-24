// Copyright The Open Forge contributors.
import { type Static, type TSchema, Type } from "@sinclair/typebox";
import type { ComponentType } from "react";

export const PluginArtifactRendererDescriptorSchema = Type.Object({
	artifactId: Type.String({ minLength: 1 }),
	kind: Type.String({ minLength: 1 }),
	status: Type.String({ minLength: 1 }),
	title: Type.String(),
	version: Type.Integer({ minimum: 1 }),
	contentType: Type.Optional(Type.String()),
	checksum: Type.Optional(Type.String()),
	rendererType: Type.Optional(Type.String()),
	createdAt: Type.Number(),
	updatedAt: Type.Number(),
});

export type PluginArtifactRendererDescriptor = Static<typeof PluginArtifactRendererDescriptorSchema>;

export interface PluginArtifactRendererSource {
	readonly sizeBytes: number;
	readText(): Promise<string>;
	readBytes(): Promise<ArrayBuffer>;
}

export interface PluginArtifactRendererProps<Descriptor = PluginArtifactRendererDescriptor> {
	readonly descriptor: Descriptor;
	readonly source: PluginArtifactRendererSource;
}

export interface PluginArtifactRendererContribution<Schema extends TSchema = TSchema> {
	readonly type: string;
	readonly schema: Schema;
	readonly component: ComponentType<PluginArtifactRendererProps<Static<Schema>>>;
}
