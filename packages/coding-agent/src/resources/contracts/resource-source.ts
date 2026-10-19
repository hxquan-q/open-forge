// Modified by The Open Forge contributors.
export type ResourceScope = "user" | "project" | "temporary";

export type ResourceKind = "extensions" | "skills" | "prompts" | "themes";

export type ResourcePackageSource =
	| string
	| {
			source: string;
			extensions?: string[];
			skills?: string[];
			prompts?: string[];
			themes?: string[];
	  };

export interface ResourceSettingsSnapshot {
	packages?: ResourcePackageSource[];
	extensions?: string[];
	skills?: string[];
	prompts?: string[];
	themes?: string[];
}

export interface ResourceSettingsPort {
	getGlobalSettings(): ResourceSettingsSnapshot;
	getProjectSettings(): ResourceSettingsSnapshot;
	setPackages(packages: ResourcePackageSource[]): void;
	setProjectPackages(packages: ResourcePackageSource[]): void;
}

export interface ResourcePathMetadata {
	source: string;
	scope: ResourceScope;
	origin: "package" | "top-level";
	baseDir?: string;
}

export interface ResolvedResourcePath {
	path: string;
	enabled: boolean;
	metadata: ResourcePathMetadata;
}

export type ResolvedResourcePaths = Record<ResourceKind, ResolvedResourcePath[]>;

export type MissingResourceSourceAction = "install" | "skip" | "error";

export interface ResourcePackageProgressEvent {
	type: "start" | "progress" | "complete" | "error";
	action: "install" | "remove" | "update" | "clone" | "pull";
	source: string;
	message?: string;
}

export type ResourcePackageProgressListener = (event: ResourcePackageProgressEvent) => void;

export interface ResourcePackageCommandPort {
	run(command: string, args: string[], options?: { cwd?: string }): Promise<void>;
}

/** Host-owned file operations required by package installation transactions. */
export interface ResourcePackageFilePort {
	stat(path: string): Promise<{ kind: "file" | "directory" | "other" } | undefined>;
	readText(path: string): Promise<string>;
	ensureDirectory(path: string, options?: { readonly mode?: number }): Promise<void>;
	ensureTextFile(path: string, content: string): Promise<void>;
	removeTree(path: string): Promise<void>;
	readDirectory(path: string): Promise<readonly string[]>;
}

/** Host-owned directory facts used by the package location policy. */
export interface ResourcePackageLocationFacts {
	readonly homeDirectory: string;
	readonly temporaryDirectory: string;
	readonly getGlobalNpmRoot: () => string;
}

/** Host-provided stable digest used to preserve resource package cache paths. */
export interface ResourcePackageDigestPort {
	sha256Hex(value: string): string;
}

export interface ResourcePackageRegistryPort {
	getLatestVersion(packageName: string): Promise<string>;
}

export interface ResourcePackageEnvironmentPort {
	isOffline(): boolean;
}

export interface ResourcePackageRuntime {
	/**
	 * `projectScope: false` 时跳过项目级来源：不安装 project 包、不投影
	 * `<cwd>/.vetta` 的配置与自动发现资源（工作区信任未通过时使用，GHSA-mqxh）。
	 */
	resolve(
		onMissing?: (source: string) => Promise<MissingResourceSourceAction>,
		options?: { readonly projectScope?: boolean },
	): Promise<ResolvedResourcePaths>;
	resolveAdditionalSources(
		sources: string[],
		options?: { local?: boolean; temporary?: boolean },
	): Promise<ResolvedResourcePaths>;
	install(source: string, options?: { local?: boolean }): Promise<void>;
	remove(source: string, options?: { local?: boolean }): Promise<void>;
	update(source?: string): Promise<void>;
	addSource(source: string, options?: { local?: boolean }): boolean;
	removeSource(source: string, options?: { local?: boolean }): boolean;
	setProgressListener(listener: ResourcePackageProgressListener | undefined): void;
	getInstalledPath(source: string, scope: "user" | "project"): Promise<string | undefined>;
}
