import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseWorktreeList, runSetupCommand } from "./git.mjs";

const PORCELAIN = [
	"worktree C:/repo",
	"HEAD 1111111111111111111111111111111111111111",
	"branch refs/heads/main",
	"",
	"worktree C:/repo-wt/task-0094-review-snapshot",
	"HEAD 2222222222222222222222222222222222222222",
	"branch refs/heads/task/TASK-0094-review-snapshot",
	"",
	"worktree C:/repo-wt/detached",
	"HEAD 3333333333333333333333333333333333333333",
	"detached",
	"locked claude session",
	"",
	"worktree C:/repo-wt/bare-and-prunable",
	"HEAD 4444444444444444444444444444444444444444",
	"bare",
	"locked",
	"prunable gitdir file points to non-existent location",
	"",
].join("\n");

describe("worktree list parsing", () => {
	it("reads every worktree with its branch, lock and prunable state", () => {
		const worktrees = parseWorktreeList(PORCELAIN);
		expect(worktrees).toHaveLength(4);
		expect(worktrees[0]).toMatchObject({ path: "C:/repo", branch: "main", detached: false });
		expect(worktrees[1].branch).toBe("task/TASK-0094-review-snapshot");
		expect(worktrees[2]).toMatchObject({ detached: true, locked: "claude session" });
		expect(worktrees[3]).toMatchObject({
			bare: true,
			locked: "locked",
			prunable: "gitdir file points to non-existent location",
		});
	});

	it("tolerates a missing trailing blank line and CRLF output", () => {
		expect(parseWorktreeList("worktree C:/repo\r\nHEAD abc\r\nbranch refs/heads/main")).toEqual([
			{ path: "C:/repo", head: "abc", branch: "main", detached: false, bare: false, locked: null, prunable: null },
		]);
	});

	it("returns nothing for empty output rather than inventing a worktree", () => {
		expect(parseWorktreeList("")).toEqual([]);
	});
});

describe("setup command execution", () => {
	const cwd = tmpdir();

	it("passes the primary checkout and task id to the command", () => {
		const code = runSetupCommand(
			`node -e "process.exit(process.env.WORKTREE_ROOT_PATH === 'ROOT' && process.env.WORKTREE_TASK_ID === 'TASK-0200' ? 0 : 1)"`,
			{ cwd, primaryRoot: "ROOT", taskId: "TASK-0200" },
		);
		expect(code).toBe(0);
	});

	it("reports a failing command's exit code instead of throwing", () => {
		expect(runSetupCommand(`node -e "process.exit(3)"`, { cwd, primaryRoot: "ROOT", taskId: "TASK-0200" })).toBe(3);
		expect(runSetupCommand("definitely-not-a-real-command-xyz", { cwd, primaryRoot: cwd, taskId: "T" })).not.toBe(0);
	});

	it("runs the command inside the worktree it was given", () => {
		// macOS 的 /var 是指向 /private/var 的符号链接：chdir 后的 process.cwd() 会解析
		// 链接，而 env 里的路径保持传入形式，裸字符串比较在 macOS 上必然不等。两边都过
		// realpath 再比，比较的是「同一路径」这一合同本身。
		const code = runSetupCommand(
			`node -e "const fs=require('node:fs');process.exit(fs.realpathSync(process.cwd()) === fs.realpathSync(process.env.WORKTREE_ROOT_PATH) ? 0 : 1)"`,
			{
				cwd: join(tmpdir()),
				primaryRoot: join(tmpdir()),
				taskId: "T",
			},
		);
		expect(code).toBe(0);
	});
});
