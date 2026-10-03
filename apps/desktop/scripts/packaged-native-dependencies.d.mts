// Modified by The Open Forge contributors.
export interface PackagedNativeDependencies {
	required: string[];
	optional: string[];
	asarUnpack: string[];
}

export interface PackagedNativeDependencyOptions {
	speechInputEnabled?: boolean;
}

export function resolvePackagedNativeDependencies(
	platformFamilies: Set<string>,
	options?: PackagedNativeDependencyOptions,
): PackagedNativeDependencies;

export function resolveMainBundleExternals(options?: PackagedNativeDependencyOptions): string[];

export const DEVELOPMENT_WORKSPACE_EXTERNAL: RegExp;
