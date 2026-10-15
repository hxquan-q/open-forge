// Modified by The Open Forge contributors.
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createNodeSshProcessRunner, openSshCommand, runSshCommand } from "./node-process-runner.js";
import type { SshChannelInvocation, SshProcessChannel, SshProcessRunner } from "./process-runner.js";
import { SshConnection, type SshConnectionOptions } from "./ssh-connection.js";

/**
 * 一条「连到本机」的 SSH 连接，不需要 sshd。仅供测试使用。
 *
 * 顶替 `ssh` 的脚本只认最后一个参数并把它交给 `/bin/sh -c`——这正是 sshd 对远端命令做的
 * 事。于是「远端」就是本机的一个临时目录，命令构造、两层引用、字节往返与退出码都跑在真实
 * shell 上：测试证明的是功能真的可用，而不是我们拼出了预期的字符串、调用了自己写的 mock。
 * 它已经抓出过 BSD stat 不解释 `\t` 这类只有真跑才会暴露的问题。
 *
 * Windows 上没有 shebang 执行，也没有 `/bin/sh`：改用 PATH 里的 Git Bash（`bash`）执行同一条
 * 远端命令——shell 语义仍是真实 POSIX shell，只是拿掉了 perl setsid 那层 POSIX 进程组模拟
 * （取消清理本来就按平台降级）。找不到 bash 时显式抛错，不把「没跑过」当成「通过」。
 */
export function createLoopbackSshConnection(
	hostId = "loopback",
	options: Pick<SshConnectionOptions, "helper"> = {},
): SshConnection {
	const directory = mkdtempSync(join(tmpdir(), "vetta-loopback-ssh-"));
	// 「远端」有自己的家目录：helper 会往 ~/.cache 里装东西，不能装进开发者真实的家目录。
	const home = join(directory, "home");
	mkdirSync(home);
	const runner: SshProcessRunner =
		process.platform === "win32" ? createWindowsBashLoopbackRunner(home) : createPosixLoopbackRunner(directory, home);
	return new SshConnection(
		{ id: hostId, label: hostId, target: hostId, source: "manual" },
		{
			// 固定 locale：stat/find 的本地化输出会让解析落空（远端命令已按 LC_ALL=C 自锁，
			// 这里把宿主环境也对齐）。HOME 指向临时目录，别污染开发者真实的家。
			runner,
			controlPath: join(directory, "cp"),
			...options,
		},
	);
}

/** POSIX：伪造的 `ssh` 脚本 + 真实 node runner，保留 ControlMaster/取消的完整进程语义。 */
function createPosixLoopbackRunner(directory: string, home: string): SshProcessRunner {
	const fakeSsh = join(directory, "ssh");
	// sshd 为每条无 pty 的会话调用 setsid()；远端命令的「整组终止」依赖这一点。回环里用 perl
	// 补上同样的一步，否则命令会落在测试运行器自己的进程组里。没有 perl 时不建新会话——
	// 终止逻辑自带保险，只会退化为杀单个进程，不会误伤。
	writeFileSync(
		fakeSsh,
		[
			"#!/bin/sh",
			"for last; do :; done",
			"if command -v perl >/dev/null 2>&1; then",
			"  exec perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' /bin/sh -c \"$last\"",
			"fi",
			'exec /bin/sh -c "$last"',
			"",
		].join("\n"),
	);
	chmodSync(fakeSsh, 0o755);
	return createNodeSshProcessRunner({
		sshBinary: fakeSsh,
		// 固定 /bin/sh 当登录 shell：开发者自己的 zsh profile 既慢，又让结果因人而异。
		baseEnv: { ...process.env, SHELL: "/bin/sh", HOME: home, LANG: "C", LC_ALL: "C" },
	});
}

/**
 * Windows：把 `ssh ... -- target <远端命令>` 翻译成 `bash -c <远端命令>`，复用命令级执行
 * 管线（stdout/stderr/stdin/取消/超时与 POSIX 路径同一条代码路径）。
 */
function createWindowsBashLoopbackRunner(home: string): SshProcessRunner {
	const bash = resolveWindowsBash();
	const baseEnv: NodeJS.ProcessEnv = {
		...process.env,
		HOME: home,
		LANG: "C",
		LC_ALL: "C",
		// exec() 的用户命令经 `$SHELL -l -c` 执行：给绝对 MSYS 路径，避免宿主 PATH 里找不到裸 bash。
		SHELL: "/usr/bin/bash",
	};
	const translate = (argv: readonly string[]): string[] => {
		// buildSshArgv 的契约：`--` 后是 target，再后（若有）是远端命令；转发 argv 没有命令。
		const separator = argv.indexOf("--");
		if (separator < 0 || separator + 2 >= argv.length) {
			throw new Error("Windows SSH 回环只支持带远端命令的 argv（端口转发不在回环范围）。");
		}
		return [bash, "-c", argv[argv.length - 1] as string];
	};
	return {
		run: (invocation) => runSshCommand(translate(invocation.argv), baseEnv, invocation),
		open: (invocation: SshChannelInvocation): SshProcessChannel =>
			openSshCommand(translate(invocation.argv), baseEnv, invocation),
	};
}

/** 定位 Git Bash；缺位时抛出明确的前置缺失错误，而不是静默跳过测试。 */
function resolveWindowsBash(): string {
	const probe = spawnSync("bash", ["-c", "exit 0"], { encoding: "utf8" });
	if (probe.error === undefined) return "bash";
	throw new Error(
		"Windows SSH 回环需要 PATH 里的 Git Bash（bash）执行真实 POSIX shell 命令；" +
			"请安装 Git for Windows 或把 bash 加入 PATH 后重跑，不能把该套件当作已测试。",
	);
}

/**
 * 把本机 Windows 路径换成回环「远端」可用的 MSYS 根形式（`C:\Users\x` → `/c/Users/x`）：
 * 远端合同要求绝对路径以 `/` 开头（URI 解析、realPath 判定都依赖），而 MSYS 的
 * `cd`/工具链又只认 `/c/…` 或 `C:/…`——带前导斜杠的 `/C:/…` 两头不讨好。POSIX 原样返回。
 */
export function toLoopbackRemotePath(path: string): string {
	if (process.platform !== "win32") return path;
	if (/^[a-zA-Z]:[\\/]/.test(path)) {
		const drive = path[0]?.toLowerCase() ?? "c";
		return `/${drive}${path.slice(2).replace(/\\/g, "/")}`;
	}
	return path.replace(/\\/g, "/");
}

let builtHelper: string | undefined | null = null;

/**
 * 编译一份本机平台的远端 helper 供端到端测试使用；没有 Go 工具链时返回 undefined，
 * 调用方据此跳过。同一进程内只编一次。
 */
export function buildSshHelperForTests(): string | undefined {
	if (builtHelper !== null) return builtHelper;
	const source = resolve(dirname(fileURLToPath(import.meta.url)), "../../../apps/ssh-helper");
	const output = join(mkdtempSync(join(tmpdir(), "openforge-helper-build-")), "openforge-ssh-helper");
	const result = spawnSync("go", ["build", "-o", output, "./cmd/openforge-ssh-helper"], {
		cwd: source,
		env: { ...process.env, CGO_ENABLED: "0" },
	});
	builtHelper = result.status === 0 ? output : undefined;
	return builtHelper;
}
