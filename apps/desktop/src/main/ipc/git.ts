// Modified by The Open Forge contributors.

import { isAbsolute, resolve } from "node:path";
import { ipcMain } from "electron";
import type { GitRepoStatusResult } from "../../preload/api-types/git.js";
import { getGitRepoStatus } from "../git/git-repo-status.js";

const CHANNEL = "vetta:git:repo-status";

/** 只读 git 仓库状态：cwd 必须是本地绝对路径；失败一律 null，不向渲染层抛错。 */
export function registerGitIpc(): () => void {
	ipcMain.handle(CHANNEL, (_event, cwd: unknown): Promise<GitRepoStatusResult> => {
		const result =
			typeof cwd === "string" && isAbsolute(cwd) ? getGitRepoStatus(resolve(cwd)) : Promise.resolve(null);
		return result.catch(() => null);
	});
	return () => ipcMain.removeHandler(CHANNEL);
}
