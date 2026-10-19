// Modified by The Open Forge contributors.
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { getVettaHomePath } from "@vetta/action-rpc";

const CONFIG_PATH = join(getVettaHomePath(), "desktop-config.json");
/** 默认工作区根（数据根/workspace）；设置页「恢复默认」与渲染端初始化经 IPC 取此值，不硬编码品牌路径。 */
export const DEFAULT_WORKSPACE_PATH = join(getVettaHomePath(), "workspace");

function expandTilde(p: string): string {
	if (p.startsWith("~/") || p === "~") {
		return join(homedir(), p.slice(1));
	}
	return p;
}

export async function getWorkspacePath(): Promise<string> {
	try {
		const raw = await readFile(CONFIG_PATH, "utf8");
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		if (typeof parsed.workspacePath === "string") {
			return expandTilde(parsed.workspacePath);
		}
	} catch {
		// ignore
	}
	return DEFAULT_WORKSPACE_PATH;
}
