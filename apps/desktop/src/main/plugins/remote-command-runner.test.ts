import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLoopbackSshConnection, toLoopbackRemotePath } from "@vetta/ssh-transport/testing";
import { describe, expect, it, vi } from "vitest";

const connection = createLoopbackSshConnection();
vi.mock("../ssh/ssh-runtime.js", () => ({ getSshConnection: () => connection }));

const { runRemotePluginCommand } = await import("./remote-command-runner.js");

function createRemoteRepository(): string {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "vetta-remote-repo-")));
	execFileSync("git", ["init", "-q"], { cwd: root });
	writeFileSync(join(root, "it's new.txt"), "x");
	return root;
}

const limits = { env: undefined, timeoutMs: 20_000, maxBufferBytes: 1024 * 1024 };

// 回环 SSH 顶替脚本是 /bin/sh POSIX shell，win32 下无 shebang 执行与合法远端 POSIX 路径。
describe("插件命令在远程项目所在的机器上执行", () => {
	it("Git 面板的探测命令在远端仓库里回答「是仓库」，并看得到那里的改动", async () => {
		const root = createRemoteRepository();
		const cwd = `ssh://build-01${toLoopbackRemotePath(root)}`;

		const inside = await runRemotePluginCommand({
			...limits,
			file: "git",
			args: ["rev-parse", "--is-inside-work-tree"],
			cwd,
		});
		expect(inside).toMatchObject({ exitCode: 0, stdout: "true\n" });

		const status = await runRemotePluginCommand({ ...limits, file: "git", args: ["status", "--porcelain"], cwd });
		expect(status.stdout).toContain("it's new.txt");
	});

	it("参数里的 shell 元字符按字面量到达命令", async () => {
		const root = createRemoteRepository();
		const result = await runRemotePluginCommand({
			...limits,
			file: "printf",
			args: ["%s|", "$HOME", "a b", "x;y", "`id`"],
			cwd: `ssh://build-01${toLoopbackRemotePath(root)}`,
		});
		expect(result.stdout).toBe("$HOME|a b|x;y|`id`|");
	});

	it("非零退出照常返回，由插件自己检查退出码", async () => {
		const root = realpathSync(mkdtempSync(join(tmpdir(), "vetta-remote-plain-")));
		const result = await runRemotePluginCommand({
			...limits,
			file: "git",
			args: ["rev-parse", "--is-inside-work-tree"],
			cwd: `ssh://build-01${toLoopbackRemotePath(root)}`,
		});
		expect(result.exitCode).not.toBe(0);
	});

	it("远端没有这个命令时，失败方式与本机「可执行文件不存在」一致", async () => {
		const root = createRemoteRepository();
		await expect(
			runRemotePluginCommand({
				...limits,
				file: "vetta-no-such-command",
				args: [],
				cwd: `ssh://build-01${toLoopbackRemotePath(root)}`,
			}),
		).rejects.toThrow(/Command failed to start: vetta-no-such-command \(ENOENT/);
	});

	it("只透传插件显式给出的环境变量", async () => {
		const root = createRemoteRepository();
		const result = await runRemotePluginCommand({
			...limits,
			env: { VETTA_PLUGIN_FLAG: "on" },
			file: "sh",
			args: ["-c", 'printf %s "$VETTA_PLUGIN_FLAG"'],
			cwd: `ssh://build-01${toLoopbackRemotePath(root)}`,
		});
		expect(result.stdout).toBe("on");
	});
});
