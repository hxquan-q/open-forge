// Modified by The Open Forge contributors.
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import type {
	SshChannelInvocation,
	SshProcessChannel,
	SshProcessInvocation,
	SshProcessResult,
	SshProcessRunner,
} from "./process-runner.js";

export interface NodeSshProcessRunnerOptions {
	/** `ssh` 可执行文件。默认用 PATH 里的 `ssh`。 */
	readonly sshBinary?: string;
	/** 基础环境。默认继承当前进程。 */
	readonly baseEnv?: NodeJS.ProcessEnv;
}

/** `ssh -O exit` 自己的期限：master 不在或不可达时不该挂住调用方。 */
const MASTER_EXIT_TIMEOUT_MS = 10_000;

export interface NodeSshProcessRunner extends SshProcessRunner {
	/** 让对应 target 的 ControlMaster 退出；主机配置变更/删除时由连接层调用。 */
	invalidate(target: string): void;
}

/**
 * 用系统 OpenSSH 二进制执行命令。
 *
 * 选系统 ssh 而不是 ssh2 这类纯 JS 实现：`~/.ssh/config` 的 Include、Match、
 * ProxyJump、ProxyCommand、IdentityAgent、FIDO 安全密钥、GSSAPI 全部由它原生支持。
 * 用户只要 `ssh host` 能连上，Vetta 就能连上；自己实现这套等于长期追着 OpenSSH 的
 * 行为打补丁。
 */
export function createNodeSshProcessRunner(options: NodeSshProcessRunnerOptions = {}): NodeSshProcessRunner {
	const sshBinary = options.sshBinary ?? "ssh";
	// target → 最近一次见到的 ControlPath。执行器本身无状态，master 的生死在 OpenSSH
	// 那边；失效时按这条记录去关对应的 socket。
	const controlPaths = new Map<string, string>();
	const rememberControlPath = (argv: readonly string[]): void => {
		const target = argvTarget(argv);
		const controlPath = argvControlPath(argv);
		if (target !== undefined && controlPath !== undefined) controlPaths.set(target, controlPath);
	};
	return {
		run(invocation: SshProcessInvocation): Promise<SshProcessResult> {
			rememberControlPath(invocation.argv);
			return runSshCommand([sshBinary, ...invocation.argv], options.baseEnv ?? process.env, invocation);
		},
		open(invocation: SshChannelInvocation): SshProcessChannel {
			rememberControlPath(invocation.argv);
			return openSshCommand([sshBinary, ...invocation.argv], options.baseEnv ?? process.env, invocation);
		},
		invalidate(target: string): void {
			const controlPath = controlPaths.get(target);
			controlPaths.delete(target);
			if (controlPath === undefined) return;
			// `ssh -O exit` 让这条 ControlMaster 退出；master 可能本来就不在，失败吞掉，
			// 失败不能拖累调用方——下次连接会按需重建。
			void runSshCommand(
				[sshBinary, "-o", `ControlPath=${controlPath}`, "-O", "exit", "--", target],
				options.baseEnv ?? process.env,
				{ argv: [], timeoutMs: MASTER_EXIT_TIMEOUT_MS },
			).catch(() => undefined);
		},
	};
}

/** `--` 之后的第一个参数是目标主机；没有 `--` 或后面为空就不记录。 */
function argvTarget(argv: readonly string[]): string | undefined {
	const separator = argv.indexOf("--");
	if (separator < 0 || separator + 1 >= argv.length) return undefined;
	return argv[separator + 1];
}

function argvControlPath(argv: readonly string[]): string | undefined {
	for (let i = 0; i + 1 < argv.length; i += 1) {
		if (argv[i] === "-o" && argv[i + 1].startsWith("ControlPath=")) {
			return argv[i + 1].slice("ControlPath=".length);
		}
	}
	return undefined;
}

/**
 * 按完整命令表执行一次「远端」操作。与 {@link createNodeSshProcessRunner} 内部路径的
 * 区别只在命令本体：测试回环可以把自己翻译好的命令（例如 `bash -c <远端命令>`）交给
 * 同一套 stdout/stderr/stdin/取消/超时管线，而不是复制一份语义略有出入的实现。
 */
export function runSshCommand(
	command: readonly string[],
	baseEnv: NodeJS.ProcessEnv,
	invocation: SshProcessInvocation,
): Promise<SshProcessResult> {
	return new Promise((resolve, reject) => {
		if (invocation.signal?.aborted) {
			resolve({ exitCode: null, stdout: new Uint8Array(), stderr: "", aborted: true });
			return;
		}
		const ownsProcessGroup = process.platform !== "win32";
		const child = spawn(command[0] as string, command.slice(1), {
			env: { ...baseEnv, ...invocation.env },
			stdio: ["pipe", "pipe", "pipe"],
			detached: ownsProcessGroup,
		});

		const terminate = createProcessTerminator(child, ownsProcessGroup);
		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];
		let aborted = false;
		let timedOut = false;
		let settled = false;

		const stop = (reason: "signal" | "timeout"): void => {
			if (settled || aborted) return;
			aborted = true;
			timedOut = reason === "timeout";
			terminate();
		};

		const timer =
			invocation.timeoutMs === undefined ? undefined : setTimeout(() => stop("timeout"), invocation.timeoutMs);
		timer?.unref?.();
		const onAbort = (): void => stop("signal");
		invocation.signal?.addEventListener("abort", onAbort, { once: true });

		child.stdout.on("data", (chunk: Buffer) => {
			if (invocation.onStdout) invocation.onStdout(chunk);
			else stdoutChunks.push(chunk);
		});
		child.stderr.on("data", (chunk: Buffer) => {
			// stderr 只留尾部：错误分类只需要最后几行，而流式消费的长任务同样会写个不停。
			if (invocation.onStderr) {
				invocation.onStderr(chunk);
				keepTail(stderrChunks, chunk, STREAMED_STDERR_TAIL_BYTES);
			} else {
				stderrChunks.push(chunk);
			}
		});

		const finish = (exitCode: number | null): void => {
			if (settled) return;
			settled = true;
			if (timer !== undefined) clearTimeout(timer);
			invocation.signal?.removeEventListener("abort", onAbort);
			resolve({
				exitCode,
				stdout: Buffer.concat(stdoutChunks),
				stderr: Buffer.concat(stderrChunks).toString("utf8"),
				aborted,
				timedOut,
			});
		};

		child.on("error", (error) => {
			if (settled) return;
			settled = true;
			if (timer !== undefined) clearTimeout(timer);
			invocation.signal?.removeEventListener("abort", onAbort);
			reject(error);
		});
		// 用 close 而不是 exit：exit 可能早于 stdout 读完，那样会丢掉尾部输出。
		child.on("close", (code) => finish(code));
		// Abort can happen during spawn, before the listener was installed.
		if (invocation.signal?.aborted) stop("signal");

		if (invocation.stdin !== undefined) {
			// 远端命令可能在读完 stdin 前就退出（例如路径不存在），此时写入会 EPIPE。
			// 那不是本地错误，真正的原因在 stderr 和退出码里。
			child.stdin.on("error", () => {});
			child.stdin.end(invocation.stdin);
		} else {
			child.stdin.end();
		}
	});
}

/** 与 {@link runSshCommand} 同理的常驻通道版本：命令本体由调用方给出。 */
export function openSshCommand(
	command: readonly string[],
	baseEnv: NodeJS.ProcessEnv,
	invocation: SshChannelInvocation,
): SshProcessChannel {
	const ownsProcessGroup = process.platform !== "win32";
	const child = spawn(command[0] as string, command.slice(1), {
		env: { ...baseEnv, ...invocation.env },
		stdio: ["pipe", "pipe", "pipe"],
		detached: ownsProcessGroup,
	});
	const terminate = createProcessTerminator(child, ownsProcessGroup);
	const stderrChunks: Buffer[] = [];
	child.stdout.on("data", (chunk: Buffer) => invocation.onStdout(chunk));
	child.stderr.on("data", (chunk: Buffer) => keepTail(stderrChunks, chunk, STREAMED_STDERR_TAIL_BYTES));
	// 对端先走一步时写入会 EPIPE；真正的原因在退出码和 stderr 里，由 exited 报告。
	child.stdin.on("error", () => {});
	const exited = new Promise<{ exitCode: number | null; stderr: string }>((resolve) => {
		const finish = (exitCode: number | null): void =>
			resolve({ exitCode, stderr: Buffer.concat(stderrChunks).toString("utf8") });
		// 启动失败（找不到 ssh）只有 error 没有 close。
		child.once("error", () => finish(null));
		child.once("close", (code) => finish(code));
	});
	return {
		write: (data) => {
			if (child.stdin.writable) child.stdin.write(data);
		},
		writeAsync: (data) =>
			new Promise((resolve) => {
				if (!child.stdin.writable) {
					resolve();
					return;
				}
				let settled = false;
				const finish = (): void => {
					if (!settled) {
						settled = true;
						resolve();
					}
				};
				// drain 是回调与「写缓存清空」两者的后到者：false 分支等 drain，true 分支
				// 回调即到。close/error（进程被杀）也必须放行，否则取消一个上传会挂死。
				child.stdin.once("close", finish);
				child.stdin.once("error", finish);
				if (child.stdin.write(data)) finish();
				else child.stdin.once("drain", finish);
			}),
		end: () => child.stdin.end(),
		kill: terminate,
		exited,
	};
}

/** Own only this spawned process group, never the caller's or a remote task's group. */
function createProcessTerminator(child: ChildProcess, ownsProcessGroup: boolean): () => void {
	let closed = false;
	let stopping = false;
	let escalation: ReturnType<typeof setTimeout> | undefined;
	const finish = (): void => {
		closed = true;
		if (escalation !== undefined) clearTimeout(escalation);
	};
	child.once("close", finish);
	child.once("error", finish);
	return () => {
		// exitCode/killed only describe the parent. Descendants may still hold its pipes.
		if (closed || stopping) return;
		stopping = true;
		escalation = setTimeout(() => {
			if (!closed) signalProcess(child, ownsProcessGroup, "SIGKILL");
		}, 2000);
		escalation.unref?.();
		signalProcess(child, ownsProcessGroup, "SIGTERM");
	};
}

function signalProcess(child: ChildProcess, ownsProcessGroup: boolean, signal: NodeJS.Signals): void {
	if (ownsProcessGroup && child.pid !== undefined) {
		try {
			process.kill(-child.pid, signal);
			return;
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === "ESRCH") return;
		}
	}
	child.kill(signal);
}

const STREAMED_STDERR_TAIL_BYTES = 16 * 1024;

function keepTail(chunks: Buffer[], chunk: Buffer, limitBytes: number): void {
	chunks.push(chunk);
	let total = 0;
	for (const item of chunks) total += item.byteLength;
	while (chunks.length > 1 && total - chunks[0].byteLength >= limitBytes) {
		total -= chunks[0].byteLength;
		chunks.shift();
	}
}
