// Modified by The Open Forge contributors.
import {
	createNodeCommandExecutor,
	createNodeResourcePackageHost,
	NodeProjectTrustStore,
	nodeTextFileWatchPort,
} from "@vetta/runtime-node/host";
import {
	PROJECT_RESOURCE_TRUST_CAPABILITY,
	type ProjectResourceTrustPort,
} from "../../resources/contracts/project-resource-trust.js";
import type {
	SessionResourceRuntime,
	SessionResourceRuntimeOptions,
} from "../../resources/contracts/resource-runtime.js";
import type { ResourceSettingsPort } from "../../resources/contracts/resource-source.js";
import { createResourcePackageRuntime } from "../../resources/packages/package-source-runtime.js";
import { createSessionResourceRuntime } from "../../resources/runtime/session-resource-runtime.js";
import {
	configureThemeRuntime,
	detectColorMode,
	detectTerminalBackground,
	loadThemeFromContent,
} from "../../theme/index.js";
import { createCodingAgentNodeExtensionFactoryLoader } from "../extensions/node-extension-factory-loader.js";
import { getSceneDir, getUserSkillsDir, getVettaHomePath } from "../node-config.js";

/**
 * 非交互默认信任策略（GHSA-mqxh 决策④）：
 * `OPENFORGE_TRUST_PROJECT=1` 显式信任；否则读取项目本地
 * `.vetta-local/trust.json`（桌面端「信任并记住」写入的同一授权），
 * 仍未信任则拒绝。store 读取异常按拒绝处理（fail closed）。
 */
export function createNonInteractiveProjectResourceTrustPort(
	options: { readonly env?: NodeJS.ProcessEnv } = {},
): ProjectResourceTrustPort {
	const env = options.env ?? process.env;
	return {
		async decideProjectResourceTrust(cwd) {
			if (env.OPENFORGE_TRUST_PROJECT === "1") return { trusted: true, reason: "env-override" };
			try {
				const store = new NodeProjectTrustStore({ projectRoot: cwd });
				if (await store.allows(PROJECT_RESOURCE_TRUST_CAPABILITY)) {
					return { trusted: true, reason: "trusted" };
				}
			} catch {
				// 读取失败按拒绝处理。
			}
			return { trusted: false, reason: "non-interactive-untrusted" };
		},
	};
}

export interface CreateCodingAgentSdkSessionResourceRuntimeOptions
	extends Omit<
		SessionResourceRuntimeOptions,
		| "cwd"
		| "agentDir"
		| "settings"
		| "packages"
		| "resourceAccess"
		| "themeParser"
		| "extensionFactoryLoader"
		| "extensionCommandExecutor"
		| "skillLocations"
	> {
	readonly cwd: string;
	readonly agentDir: string;
	readonly settings: ResourceSettingsPort;
}

export function createCodingAgentSdkSessionResourceRuntime(
	options: CreateCodingAgentSdkSessionResourceRuntimeOptions,
): SessionResourceRuntime {
	configureThemeRuntime({
		colorMode: detectColorMode(process.env),
		defaultThemeName: detectTerminalBackground(process.env),
		watcher: nodeTextFileWatchPort,
	});
	const host = createNodeResourcePackageHost();
	const packages = createResourcePackageRuntime({
		cwd: options.cwd,
		agentDir: options.agentDir,
		settings: options.settings,
		...host,
		managedSkillsDir: getUserSkillsDir(),
	});
	return createSessionResourceRuntime({
		...options,
		// 非交互宿主默认注入拒绝策略；显式传入的 projectResourceTrust 优先生效。
		projectResourceTrust: options.projectResourceTrust ?? createNonInteractiveProjectResourceTrustPort(),
		packages,
		resourceAccess: host.resourceAccess,
		themeParser: loadThemeFromContent,
		extensionFactoryLoader: createCodingAgentNodeExtensionFactoryLoader(),
		extensionCommandExecutor: createNodeCommandExecutor(),
		skillLocations: {
			sceneDir: getSceneDir(),
			managedSkillsDir: getUserSkillsDir(),
			manifestPath: host.resourceAccess.paths.join(getVettaHomePath(), "skills-manifest.json"),
		},
	});
}
