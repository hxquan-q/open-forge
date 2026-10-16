// Modified by The Open Forge contributors.
import { join } from "node:path";
import type {
	CodingAgentPromptRuntimeSourceContext,
	CodingAgentPromptRuntimeSources,
} from "@vetta/coding-agent/composition";
import { getAgentDir, getSceneDir, getUserSkillsDir, getVettaHomePath } from "@vetta/coding-agent/config";
import {
	configureThemeRuntime,
	detectColorMode,
	detectTerminalBackground,
	loadThemeFromContent,
} from "@vetta/coding-agent/extensions";
import { createCodingAgentNodeExtensionFactoryLoader } from "@vetta/coding-agent/host-services";
import {
	createResourcePackageRuntime,
	createSessionResourceRuntime,
	type ResourceSettingsPort,
	type SessionResourceRuntime,
	type SessionResourceRuntimeOptions,
} from "@vetta/coding-agent/resources";
import { createSettingsRuntimeFromStorage, type SettingsRuntime } from "@vetta/coding-agent/settings";
import {
	createProjectResourceAccess,
	type ProjectResourceAccess,
	resolveProjectSettingsPath,
} from "@vetta/runtime-desktop";
import {
	createNodeCommandExecutor,
	createNodeResourcePackageHost,
	NodeScopedTextStorage,
	nodeTextFileWatchPort,
} from "@vetta/runtime-node/host";
import { isSshProjectUri, parseProjectLocation } from "@vetta/ssh-transport";
import { resolveDesktopBrandName } from "../../shared/desktop-brand.js";
import { getAppLanguage } from "../i18n/index.js";
import { getAppLogger } from "../logger.js";
import { getSshConnection } from "../ssh/ssh-runtime.js";

const log = getAppLogger("session-resources");

interface DesktopResourceRuntimeScope {
	readonly cwd: string;
	readonly agentDir: string;
	readonly settings: ResourceSettingsPort;
}

interface CreateDesktopSessionResourceRuntimeOptions
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
		>,
		DesktopResourceRuntimeScope {
	/** 拿到本次装配的资源访问端口，供调用方读取远端读取统计（BUG-0125 取证）。 */
	readonly onResourceAccess?: (access: ProjectResourceAccess) => void;
}

export function createDesktopSettingsRuntime(cwd: string, agentDir: string): SettingsRuntime {
	return createSettingsRuntimeFromStorage(
		new NodeScopedTextStorage({
			global: join(agentDir, "settings.json"),
			project: resolveProjectSettingsPath(cwd, agentDir),
		}),
		{
			clearOnShrink: process.env.PI_CLEAR_ON_SHRINK === "1",
			showHardwareCursor: process.env.PI_HARDWARE_CURSOR === "1",
		},
	);
}

export function createDesktopSessionResourceRuntime(
	options: CreateDesktopSessionResourceRuntimeOptions,
): SessionResourceRuntime {
	// 宿主专属回调不外传：核心运行时的 options 只认自己的合同。
	const { onResourceAccess, ...sessionRuntimeOptions } = options;
	configureThemeRuntime({
		colorMode: detectColorMode(process.env),
		defaultThemeName: detectTerminalBackground(process.env),
		watcher: nodeTextFileWatchPort,
	});
	const nodeHost = createNodeResourcePackageHost();
	// 同一个端口同时服务本地与远程项目：`ssh://` 路径读远端，其余读本机。远程项目的 cwd
	// 是 URI，由它派生的每条路径（向上找 AGENTS.md、拼项目技能目录）因此都落到远端；
	// 交给纯本机端口的话，URI 会被解析到本机进程 cwd 之下，再沿本机祖先目录向上读。
	const host = { ...nodeHost, resourceAccess: createProjectResourceAccess(nodeHost.resourceAccess, getSshConnection) };
	onResourceAccess?.(host.resourceAccess);
	const packages = createResourcePackageRuntime({
		cwd: sessionRuntimeOptions.cwd,
		agentDir: sessionRuntimeOptions.agentDir,
		settings: sessionRuntimeOptions.settings,
		...host,
		managedSkillsDir: getUserSkillsDir(),
	});
	const runtime = createSessionResourceRuntime({
		...sessionRuntimeOptions,
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
	return runtime;
}

/**
 * 远程项目的资源在发现阶段带着 `ssh://<hostId>/…` 形态的路径——那是宿主用来决定「去哪台
 * 机器读」的内部表示。交给模型之前必须换成远端上的绝对路径：模型拿路径去喂 read 和 bash，
 * 而这两个工具就跑在那台机器上。原样给 URI 的话，`bash "$SKILL_DIR/scripts/run.sh"` 会
 * 去执行一个名叫 `ssh:` 的目录下的脚本。
 *
 * 只改对外读出的视图，运行时内部仍用 URI 作为资源身份。因此包装只在模型面向的装配处套一层
 * （`createDesktopPromptRuntimeSources`），不做进通用构造：宿主自己的消费者要的恰恰是没被
 * 改写的 URI——技能列表拿 `filePath` 去本机读展示图标，而远端绝对路径在宿主上根本不存在，
 * 只有 URI 才让「这条路径属于远程」可判定。
 */
function presentRemotePathsAsSeenByTools(runtime: SessionResourceRuntime): SessionResourceRuntime {
	return new Proxy(runtime, {
		get(target, property, receiver) {
			if (property === "getSkills") {
				return () => {
					const result = target.getSkills();
					return {
						...result,
						skills: result.skills.map((skill) => ({
							...skill,
							filePath: toToolFacingPath(skill.filePath),
							baseDir: toToolFacingPath(skill.baseDir),
						})),
					};
				};
			}
			if (property === "getAgentsFiles") {
				return () => ({
					agentsFiles: target.getAgentsFiles().agentsFiles.map((file) => ({
						...file,
						path: toToolFacingPath(file.path),
					})),
				});
			}
			const value: unknown = Reflect.get(target, property, receiver);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
}

function toToolFacingPath(path: string): string {
	if (!isSshProjectUri(path)) return path;
	const location = parseProjectLocation(path);
	return location.kind === "ssh" ? location.remotePath : path;
}

export async function createDesktopPromptRuntimeSources(
	context: CodingAgentPromptRuntimeSourceContext,
): Promise<CodingAgentPromptRuntimeSources> {
	const agentDir = context.agentDir ?? getAgentDir();
	const settingsSource = createDesktopSettingsRuntime(context.cwd, agentDir);
	// 模型会把这里的 `baseDir`/`filePath` 直接交给远端的 read 与 bash，所以只有这一层装配
	// 换成远端绝对路径视图；技能列表等宿主消费者走 `createDesktopSessionResourceRuntime`。
	let accessHandle: ProjectResourceAccess | undefined;
	const resourceSource = presentRemotePathsAsSeenByTools(
		createDesktopSessionResourceRuntime({
			cwd: context.cwd,
			agentDir,
			settings: settingsSource,
			includeAgentSkills: context.sessionOptions.includeAgentSkills,
			runtimeSkillPaths: [...context.runtimeSkillPaths],
			noExtensions: true,
			noPromptTemplates: true,
			noThemes: true,
			onResourceAccess: (access) => {
				accessHandle = access;
			},
		}),
	);
	const reloadStartedAt = performance.now();
	await resourceSource.reload();
	// 远端读取观测（BUG-0125）：`reload()` 就是 prompt-runtime 阶段的全部远端 I/O 出口，
	// 把阶段耗时与远端操作数/耗时分解并排落盘，才能判定该阶段慢在「逐次远端读」还是
	// 「等待某共享事件」。本机读不计入；无 handle 时按 0 记录，不改变任何行为。
	const remoteStats = accessHandle?.readRemoteStats();
	log.info("session resources reloaded", {
		cwd: context.cwd,
		durationMs: Math.round(performance.now() - reloadStartedAt),
		remoteOperations: remoteStats?.operations ?? 0,
		remoteTotalMs: Math.round(remoteStats?.totalMs ?? 0),
		remoteByOperation: remoteStats?.byOperation,
	});
	return { resourceSource, settingsSource, brandName: resolveDesktopBrandName(getAppLanguage()) };
}

export function createDesktopSkillResourceRuntime(options: {
	readonly cwd?: string;
	readonly includeAgentSkills: boolean;
	readonly additionalSkillPaths: string[];
}): SessionResourceRuntime {
	const cwd = options.cwd ?? process.cwd();
	const agentDir = getAgentDir();
	return createDesktopSessionResourceRuntime({
		cwd,
		agentDir,
		settings: createDesktopSettingsRuntime(cwd, agentDir),
		includeAgentSkills: options.includeAgentSkills,
		additionalSkillPaths: options.additionalSkillPaths,
		noExtensions: true,
		noPromptTemplates: true,
		noThemes: true,
	});
}
