// Modified by The Open Forge contributors.
import type {
	EventBus,
	ExtensionCommandExecutor,
	ExtensionFactory,
	ExtensionFactoryLoader,
	LoadExtensionsResult,
} from "../../extensions/index.js";
import type { Theme } from "../../theme/index.js";
import type { PromptTemplate } from "../prompts/index.js";
import type { Skill } from "../skills/index.js";
import type { ResourceDiagnostic } from "./diagnostics.js";
import type { ProjectResourceTrustDecision, ProjectResourceTrustPort } from "./project-resource-trust.js";
import type { ResourceAccessPort } from "./resource-access.js";
import type { ResourcePackageRuntime, ResourcePathMetadata, ResourceSettingsPort } from "./resource-source.js";

export interface ResourceExtensionPaths {
	skillPaths?: Array<{ path: string; metadata: ResourcePathMetadata }>;
	promptPaths?: Array<{ path: string; metadata: ResourcePathMetadata }>;
	themePaths?: Array<{ path: string; metadata: ResourcePathMetadata }>;
}

export interface SkillResourceLocations {
	readonly sceneDir: string;
	readonly managedSkillsDir: string;
	readonly manifestPath: string;
}

export type ThemeResourceParser = (path: string, content: string) => Theme;

export interface SessionResourceRuntime {
	getExtensions(): LoadExtensionsResult;
	getSkills(): { skills: Skill[]; diagnostics: ResourceDiagnostic[] };
	getPrompts(): { prompts: PromptTemplate[]; diagnostics: ResourceDiagnostic[] };
	getThemes(): { themes: Theme[]; diagnostics: ResourceDiagnostic[] };
	getAgentsFiles(): { agentsFiles: Array<{ path: string; content: string }> };
	getSystemPrompt(): string | undefined;
	getAppendSystemPrompt(): string[];
	getPathMetadata(): Map<string, ResourcePathMetadata>;
	/** 最近一次 reload 的项目资源信任判定（诊断/观测用）。 */
	getProjectResourceTrust(): ProjectResourceTrustDecision;
	extendResources(paths: ResourceExtensionPaths, signal?: AbortSignal): Promise<void>;
	setAdditionalSkillPaths(paths: string[], signal?: AbortSignal): Promise<void>;
	setRuntimeSkillPaths(paths: string[], signal?: AbortSignal): Promise<void>;
	setAdditionalExtensionPaths(paths: string[]): void;
	reloadSkills(signal?: AbortSignal): Promise<void>;
	reload(): Promise<void>;
	refreshSkillsIfChanged(signal?: AbortSignal): Promise<boolean>;
	refreshContextResourcesIfChanged(signal?: AbortSignal): Promise<boolean>;
}

export interface SessionResourceRuntimeOptions {
	cwd: string;
	agentDir: string;
	resourceAccess: ResourceAccessPort;
	themeParser: ThemeResourceParser;
	extensionFactoryLoader: ExtensionFactoryLoader;
	extensionCommandExecutor: ExtensionCommandExecutor;
	skillLocations: SkillResourceLocations;
	packages: ResourcePackageRuntime;
	settings?: ResourceSettingsPort;
	/**
	 * 工作区信任端口（GHSA-mqxh）：缺省时放行（域层中性），各组合根
	 * （sdk/cli/desktop）注入各自策略；判定为拒绝时项目级资源不安装不加载。
	 */
	projectResourceTrust?: ProjectResourceTrustPort;
	eventBus?: EventBus;
	additionalExtensionPaths?: string[];
	additionalSkillPaths?: string[];
	/** Dynamic host/plugin Skill paths known before the first reload. */
	runtimeSkillPaths?: string[];
	additionalPromptTemplatePaths?: string[];
	additionalThemePaths?: string[];
	extensionFactories?: ExtensionFactory[];
	noExtensions?: boolean;
	noSkills?: boolean;
	noPromptTemplates?: boolean;
	noThemes?: boolean;
	includeAgentSkills?: boolean;
	systemPrompt?: string;
	appendSystemPrompt?: string;
	extensionsOverride?: (base: LoadExtensionsResult) => LoadExtensionsResult;
	skillsOverride?: (base: { skills: Skill[]; diagnostics: ResourceDiagnostic[] }) => {
		skills: Skill[];
		diagnostics: ResourceDiagnostic[];
	};
	promptsOverride?: (base: { prompts: PromptTemplate[]; diagnostics: ResourceDiagnostic[] }) => {
		prompts: PromptTemplate[];
		diagnostics: ResourceDiagnostic[];
	};
	themesOverride?: (base: { themes: Theme[]; diagnostics: ResourceDiagnostic[] }) => {
		themes: Theme[];
		diagnostics: ResourceDiagnostic[];
	};
	agentsFilesOverride?: (base: { agentsFiles: Array<{ path: string; content: string }> }) => {
		agentsFiles: Array<{ path: string; content: string }>;
	};
	systemPromptOverride?: (base: string | undefined) => string | undefined;
	appendSystemPromptOverride?: (base: string[]) => string[];
}
