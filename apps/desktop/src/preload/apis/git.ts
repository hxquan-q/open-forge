// Modified by The Open Forge contributors.
import type { DesktopApi } from "../api.js";
import type { GitRepoStatusResult } from "../api-types/git.js";

export function createGitApi(ipc: Electron.IpcRenderer): Pick<DesktopApi, "git"> {
	return {
		git: {
			/** 只读仓库状态；非 git 仓库 / git 缺失返回 null。 */
			getRepoStatus: (cwd: string): Promise<GitRepoStatusResult> => ipc.invoke("vetta:git:repo-status", cwd),
		},
	};
}
