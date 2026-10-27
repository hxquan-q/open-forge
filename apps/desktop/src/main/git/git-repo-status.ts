// Modified by The Open Forge contributors.

import { execFile } from "node:child_process";
import { isAbsolute } from "node:path";
import { promisify } from "node:util";
import type { GitRepoChange, GitRepoStatusResult } from "../../preload/api-types/git.js";

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 4000;

/** porcelain v1 行 → 变更条目；不可解析的行静默跳过（宁可少列不错列）。 */
export function parsePorcelainStatusLine(line: string): GitRepoChange | null {
	if (!line.trim()) return null;
	const xy = line.slice(0, 2);
	const rest = line.slice(3);
	if (rest.trim() === "") return null;
	// "R  old -> new" 取新路径展示；其余原样。
	if (xy[0] === "R" || xy[1] === "R") {
		const target = rest.includes(" -> ") ? rest.split(" -> ").pop()!.trim() : rest.trim();
		return { path: target, status: "renamed" };
	}
	if (xy === "??") return { path: rest.trim(), status: "untracked" };
	if (xy.includes("A")) return { path: rest.trim(), status: "added" };
	if (xy.includes("D")) return { path: rest.trim(), status: "deleted" };
	return { path: rest.trim(), status: "modified" };
}

export function parsePorcelainStatus(output: string): readonly GitRepoChange[] {
	return output
		.split("\n")
		.map((line) => parsePorcelainStatusLine(line))
		.filter((change): change is GitRepoChange => change !== null);
}

/** `git status -b --porcelain` 首行 "## branch...origin/x [ahead 1]" → 分支名；detached 给 null。 */
export function parseStatusBranchLine(line: string): string | null {
	const branch = /^## (?!No branch)(\S+)/.exec(line.trim());
	return branch ? branch[1] : null;
}

async function git(cwd: string, args: readonly string[]): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync("git", args, {
			cwd,
			timeout: GIT_TIMEOUT_MS,
			windowsHide: true,
			maxBuffer: 4 * 1024 * 1024,
		});
		return stdout;
	} catch {
		return null;
	}
}

/**
 * 读取 cwd 的分支与变更列表（演示级：PATH 上的系统 git，只读命令）。
 * 非 git 仓库 / git 缺失 / 命令失败返回 null。
 */
export async function getGitRepoStatus(cwd: string): Promise<GitRepoStatusResult> {
	if (!isAbsolute(cwd)) return null;
	const statusOut = await git(cwd, ["status", "-b", "--porcelain=v1", "--untracked-files=all"]);
	if (statusOut === null) return null;
	const lines = statusOut.split("\n");
	const branchLine = lines.find((line) => line.startsWith("## ")) ?? "";
	const parsedBranch = parseStatusBranchLine(branchLine);
	if (parsedBranch) return { branch: parsedBranch, head: "", changes: parseBranchless(lines) };
	// detached HEAD：## HEAD (no branch)——拿短 SHA 当展示名。
	const rev = await git(cwd, ["rev-parse", "--short", "HEAD"]);
	if (rev === null) return null;
	return { branch: `HEAD (${rev.trim()})`, head: rev.trim(), changes: parseBranchless(lines) };
}

function parseBranchless(lines: readonly string[]): readonly GitRepoChange[] {
	return parsePorcelainStatus(lines.filter((line) => !line.startsWith("## ")).join("\n"));
}
