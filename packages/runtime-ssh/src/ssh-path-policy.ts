// Modified by The Open Forge contributors.
import type { EditPathPolicy, ReadPathPolicy, WritePathPolicy } from "@vetta/runtime-node/coding";
import { normalizeRemotePath } from "@vetta/ssh-transport";

/**
 * 远端文件路径策略。
 *
 * 仅当当前会话显式绑定本机 Code 项目 AI 工作区时，读/写/编辑工具按远端项目根与该工作区虚拟根收敛；
 * 其他 SSH 会话保留既有行为。远端路径始终按 POSIX、大小写敏感语义比较。
 */
const PROTECTED_SUBDIRECTORIES = [".vetta/skills", ".agents/skills"];

export function createSshPathPolicies(
	remoteCwd: string,
	options: { readonly workspaceToolRoot?: string } = {},
): {
	readPathPolicy: ReadPathPolicy;
	searchPathPolicy: ReadPathPolicy;
	editPathPolicy: EditPathPolicy;
	writePathPolicy: WritePathPolicy;
} {
	const root = normalizeRemotePath(remoteCwd);
	const workspaceRoot = options.workspaceToolRoot?.replace(/\/+$/, "");
	const protectedRoots = PROTECTED_SUBDIRECTORIES.map((suffix) => `${root}/${suffix}`);
	const getRejectionReason = (absolutePath: string): string | undefined => {
		if (workspaceRoot !== undefined) {
			const workspacePath = absolutePath === workspaceRoot || absolutePath.startsWith(`${workspaceRoot}/`);
			const segments = absolutePath.slice(workspacePath ? workspaceRoot.length : 0).split("/");
			if (segments.includes("..")) return `Access denied: path escapes its authorized root: "${absolutePath}".`;
			if (!workspacePath) {
				const target = normalizeRemotePath(absolutePath);
				if (target !== root && !target.startsWith(`${root}/`)) {
					return `Access denied: SSH Code file tools are limited to the current project and its local AI workspace: "${absolutePath}".`;
				}
			}
		}

		const target = normalizeRemotePath(absolutePath);
		for (const protectedRoot of protectedRoots) {
			if (target === protectedRoot || target.startsWith(`${protectedRoot}/`)) {
				return `${protectedRoot} is managed by Vetta and is read-only.`;
			}
		}
		return undefined;
	};
	const searchPathPolicy: ReadPathPolicy = {
		getRejectionReason: (absolutePath) => {
			if (workspaceRoot === undefined) return undefined;
			if (absolutePath === workspaceRoot || absolutePath.startsWith(`${workspaceRoot}/`)) {
				return "Search tools run on the SSH host; use read, write, or edit for the local project AI workspace.";
			}
			const target = normalizeRemotePath(absolutePath);
			if (target.split("/").includes("..") || (target !== root && !target.startsWith(`${root}/`))) {
				return `Access denied: SSH search tools are limited to the current project: "${absolutePath}".`;
			}
			return undefined;
		},
	};
	return {
		readPathPolicy: { getRejectionReason },
		searchPathPolicy,
		editPathPolicy: { getRejectionReason },
		writePathPolicy: { getRejectionReason },
	};
}
