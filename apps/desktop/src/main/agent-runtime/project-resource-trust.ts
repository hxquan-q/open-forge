// Modified by The Open Forge contributors.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_RESOURCE_TRUST_CAPABILITY, type ProjectResourceTrustPort } from "@vetta/coding-agent/resources";
import { NodeProjectTrustStore } from "@vetta/runtime-node/host";
import { mainT } from "../i18n/index.js";
import { getAppLogger } from "../logger.js";

const log = getAppLogger("project-trust");

export type ProjectTrustDialogChoice = "remember" | "once" | "deny";

export interface ProjectTrustStoreLike {
	allows(capability: string): Promise<boolean>;
	grant(input: { readonly capabilities: readonly string[] }): Promise<unknown>;
}

export interface DesktopProjectResourceTrustOptions {
	readonly env?: NodeJS.ProcessEnv;
	/** 依赖注入（测试替换）；缺省使用 Electron 原生对话框。 */
	readonly showDialog?: (cwd: string) => Promise<ProjectTrustDialogChoice>;
	readonly createTrustStore?: (projectRoot: string) => ProjectTrustStoreLike;
}

/**
 * 桌面端项目资源信任策略（GHSA-mqxh 决策③④）：
 * 远端项目（ssh:// URI）与非显式信任的本机未决项目默认拒绝；本机项目在
 * 首次解析项目资源时弹一次原生对话框（信任并记住 / 仅本次 / 拒绝），
 * 「记住」写入 `.vetta-local/trust.json`（NodeProjectTrustStore），按路径生效。
 */
export function createDesktopProjectResourceTrustPort(
	options: DesktopProjectResourceTrustOptions = {},
): ProjectResourceTrustPort {
	const env = options.env ?? process.env;
	const showDialog = options.showDialog ?? defaultShowTrustDialog;
	const createTrustStore =
		options.createTrustStore ?? ((projectRoot: string) => new NodeProjectTrustStore({ projectRoot }));
	return {
		async decideProjectResourceTrust(cwd) {
			// 远端项目的资源在远端执行，本机对话框无法代表远端信任语义：按
			// 非交互默认拒绝，远端可通过 OPENFORGE_TRUST_PROJECT=1 显式放行。
			if (cwd.startsWith("ssh://")) return { trusted: false, reason: "remote-project-non-interactive" };
			if (env.OPENFORGE_TRUST_PROJECT === "1") return { trusted: true, reason: "env-override" };
			const store = createTrustStore(cwd);
			try {
				if (await store.allows(PROJECT_RESOURCE_TRUST_CAPABILITY)) {
					return { trusted: true, reason: "trusted" };
				}
			} catch (error) {
				log.warn(`trust store 读取失败，按拒绝处理: ${error instanceof Error ? error.message : String(error)}`);
				return { trusted: false, reason: "trust-store-error" };
			}
			if (!projectHasLocalResources(cwd)) return { trusted: true, reason: "no-project-resources" };
			const choice = await showDialog(cwd);
			switch (choice) {
				case "remember":
					try {
						await store.grant({ capabilities: [PROJECT_RESOURCE_TRUST_CAPABILITY] });
						return { trusted: true, reason: "trusted" };
					} catch (error) {
						log.warn(
							`trust store 写入失败，本次按拒绝处理: ${error instanceof Error ? error.message : String(error)}`,
						);
						return { trusted: false, reason: "grant-failed" };
					}
				case "once":
					return { trusted: true, reason: "trust-once" };
				default:
					return { trusted: false, reason: "user-denied" };
			}
		},
	};
}

/** 项目级资源目录存在才值得打扰用户；空仓库直接放行（无可加载内容）。 */
function projectHasLocalResources(cwd: string): boolean {
	const configDir = join(cwd, ".vetta");
	for (const name of ["extensions", "skills", "prompts", "themes", "packages"]) {
		if (existsSync(join(configDir, name))) return true;
	}
	return false;
}

async function defaultShowTrustDialog(cwd: string): Promise<ProjectTrustDialogChoice> {
	const { dialog } = await import("electron");
	const { response } = await dialog.showMessageBox({
		type: "question",
		title: mainT("projectTrust.title"),
		message: mainT("projectTrust.message"),
		detail: mainT("projectTrust.detail", { path: cwd }),
		buttons: [mainT("projectTrust.remember"), mainT("projectTrust.once"), mainT("projectTrust.deny")],
		defaultId: 2,
		cancelId: 2,
		noLink: true,
	});
	return response === 0 ? "remember" : response === 1 ? "once" : "deny";
}
