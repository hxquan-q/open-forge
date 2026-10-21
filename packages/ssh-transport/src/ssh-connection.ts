// Modified by The Open Forge contributors.

import { randomBytes } from "node:crypto";
import { parseRemoteDirectoryListing, type RemoteDirectoryEntry } from "./directory-listing.js";
import { SshOperationAbortedError, SshRemoteCommandError, SshTransportError } from "./errors.js";
import {
	type SshHelperClient,
	SshHelperClosedError,
	SshHelperError,
	SshHelperRequestAbortedError,
} from "./helper-client.js";
import { type ConnectSshHelperOptions, connectSshHelper } from "./helper-deployment.js";
import {
	SSH_TRANSPORT_FAILURE_EXIT_CODE,
	type SshProcessChannel,
	type SshProcessResult,
	type SshProcessRunner,
} from "./process-runner.js";
import { normalizeRemotePath } from "./project-uri.js";
import {
	buildCreateEntryCommand,
	buildKillCommand,
	buildListDirectoryCommand,
	buildListFilesRecursiveCommand,
	buildRealPathCommand,
	buildRemoteCommand,
	buildStatCommand,
	buildUploadFileCommand,
	buildWriteFileCommand,
	type ListFilesRecursiveOptions,
	quoteShellArgument,
	REMOTE_ENTRY_EXISTS_EXIT_CODE,
	type RemoteStatFlavor,
} from "./remote-command.js";
import {
	buildListListeningPortsCommand,
	buildProcessInfoCommand,
	buildTerminateProcessCommand,
	fromHelperListener,
	type HelperListener,
	isSensitiveListenerPort,
	PROCESS_STILL_ALIVE_EXIT_CODE,
	parseProcessInfo,
	parseRemoteListeners,
	type RemoteListenerScan,
	type RemoteListeningPort,
	type RemoteProcessInfo,
	selectForwardablePorts,
} from "./remote-listeners.js";
import {
	buildTtyShellCommand,
	isRemotePtyDataNotification,
	isRemotePtyExitNotification,
	type OpenRemotePtyOptions,
	type RemotePtySession,
} from "./remote-pty.js";
import { buildPortForwardArgv, buildSshArgv } from "./ssh-argv.js";
import type { SshHost } from "./ssh-host.js";

/**
 * 一台主机上第一条命令的超时。
 *
 * 它同时是建立连接的那一条，所以要把用户输入口令、私钥密码或 2FA 验证码的时间算进去。
 * 按「几秒就该连上」设的话，弹窗还在等用户打字，ssh 就被我们自己杀掉了，表现为输完
 * 密码却提示连接失败。
 *
 * 主机不可达由 OpenSSH 自己的 `ConnectTimeout` 兜底（见 buildSshArgv），不依赖这里。
 */
const FIRST_COMMAND_TIMEOUT_MS = 4 * 60 * 1000;

/** helper 临时失败的恢复边界（TASK-0166）：连续失败达上限后按连接放弃，退避按次数线性放大。 */
const HELPER_MAX_FAILURES = 3;
const HELPER_RETRY_BACKOFF_MS = 30_000;

/** 终止远端进程组的那条命令自己的超时：TERM 后最多等 2 秒再 KILL，留足余量。 */
const REMOTE_KILL_TIMEOUT_MS = 15_000;

/**
 * 上传每次写入通道的块大小。
 *
 * 取 1 MiB：比 SSH 流量控制窗口大不了多少，`writeAsync` 逐块等放行就能把本机内存占用
 * 压在一两个块；更小的块只是增加往返调度开销，不改变吞吐瓶颈（网络与加密）。
 */
const UPLOAD_CHUNK_BYTES = 1024 * 1024;

export interface RemotePlatform {
	/** `uname -s`，例如 `Linux`、`Darwin`。 */
	readonly os: string;
	/** `uname -m`，例如 `x86_64`、`arm64`。 */
	readonly arch: string;
	readonly statFlavor: RemoteStatFlavor;
}

export interface SshExecOptions {
	readonly cwd?: string;
	readonly env?: Readonly<Record<string, string>>;
	readonly onStdout?: (chunk: Uint8Array) => void;
	readonly onStderr?: (chunk: Uint8Array) => void;
	readonly signal?: AbortSignal;
	readonly timeoutMs?: number;
}

export interface SshExecResult {
	readonly exitCode: number;
	readonly stdout: Uint8Array;
	readonly stderr: string;
}

export interface SshConnectionOptions {
	readonly runner: SshProcessRunner;
	readonly controlPath: string;
	/** 传给 ssh 子进程的额外环境变量，用于挂 askpass。 */
	readonly env?: Readonly<Record<string, string>>;
	readonly connectTimeoutSeconds?: number;
	/** 测试注入的可控时钟；生产缺省 `Date.now`。仅影响 helper 恢复的退避判定。 */
	readonly now?: () => number;
	/**
	 * 诊断钩子。
	 *
	 * 目录列举这类操作会出现「命令退出 0、输出也有内容，但解析完是空的」——界面只能
	 * 显示「没有子目录」，从现象完全反推不到原因（实际遇到过：远端是中文 locale，
	 * stat 输出「目录」而不是 directory）。把原始命令与输出留给宿主记日志，这类故障
	 * 才有可能被查出来。
	 */
	/**
	 * 给出时，连接会按需把远端 helper 送过去并连上（见 {@link SshConnection.helper}）。
	 * 不给就始终走 `ssh exec`。
	 */
	readonly helper?: ConnectSshHelperOptions;
	readonly onTrace?: (event: {
		readonly command: string;
		readonly output: string;
		readonly entryCount: number;
	}) => void;
}

/**
 * 一台主机上的远端操作。
 *
 * 文件读写刻意**不**经过登录 shell：`$SHELL -l` 会 source `~/.profile`，而 profile
 * 里任何一句 echo 都会混进 stdout，把文件内容污染成「前面多了一行欢迎语」。只有用户
 * 命令（Agent 的 bash 工具）才需要登录 shell 带来的 PATH。
 *
 * 读写都走原始字节流而不是 base64：`ssh -T` 的 stdin/stdout 是 8-bit clean 的，
 * `cat` 本身不会往 stdout 写别的东西。绕开 base64 也就绕开了 GNU 的 `-d` 与 BSD 的
 * `-D` 不兼容这类远端差异。
 */
export class SshConnection {
	private platform: RemotePlatform | undefined;
	private platformProbe: Promise<RemotePlatform> | undefined;
	private homeDirectory: string | undefined;
	private helperAttempt: Promise<SshHelperClient | undefined> | undefined;
	/** 这台主机确定用不了 helper（平台/构建/协议不支持），按连接永久缓存。 */
	private helperUnsupported = false;
	/** 临时失败连续达上限后放弃，本连接余下生命周期走 `ssh exec`。 */
	private helperExhausted = false;
	private helperFailures = 0;
	private helperNextRetryAt = 0;
	/** 已经握手成功、可以直接用的 helper。部署过程中为空，那时文件操作走 `ssh exec`。 */
	private readyHelper: SshHelperClient | undefined;
	private disposed = false;

	constructor(
		readonly host: SshHost,
		private readonly options: SshConnectionOptions,
	) {}

	/**
	 * 释放这条连接占用的共享资源：远端 helper 与执行器里同 target 的会话。
	 *
	 * 主机配置变更或删除时由 manager 调用。不主动取消在途的单次操作——它们会随
	 * 会话一起失败、由各自调用方收到错误；这里只保证失效后旧资源不再被复用。
	 */
	dispose(): void {
		this.disposed = true;
		this.readyHelper?.close();
		const pending = this.helperAttempt;
		this.helperAttempt = undefined;
		// 部署到一半的 helper 完成后立即关掉，不让它变成没人认领的常驻通道。
		pending?.then((client) => client?.close()).catch(() => undefined);
		this.options.runner.invalidate?.(this.host.target);
	}

	/**
	 * 探测远端平台，结果缓存到连接对象上——同一台机器不会中途换系统。
	 *
	 * 首次探测共享在途 Promise：并发调用只发起一次远端往返。首个调用方的 signal
	 * 只影响这次共享探测；失败或取消后不缓存结论，下次调用重新发起。
	 */
	probePlatform(signal?: AbortSignal): Promise<RemotePlatform> {
		if (this.platform) return Promise.resolve(this.platform);
		if (!this.platformProbe) {
			this.platformProbe = this.runChecked("uname -s && uname -m", {
				signal,
				timeoutMs: FIRST_COMMAND_TIMEOUT_MS,
			})
				.then((result) => {
					const [os = "", arch = ""] = decode(result.stdout).trim().split("\n");
					this.platform = {
						os: os.trim(),
						arch: arch.trim(),
						// BSD 家族（macOS、FreeBSD）的 stat 用 -f，其余按 GNU 处理。
						statFlavor: /darwin|bsd/i.test(os) ? "bsd" : "gnu",
					};
					// 连接一通就在后台把 helper 备好：就绪之后文件操作不必再为每一次读写新起一个 ssh 进程。
					if (this.options.helper) void this.helper().catch(() => {});
					return this.platform;
				})
				.finally(() => {
					this.platformProbe = undefined;
				});
		}
		return this.platformProbe;
	}

	/**
	 * 远端家目录，结果缓存。
	 *
	 * 需要显式解析是因为所有路径都会被单引号引用，而 `'~'` 在 shell 里就是一个名叫
	 * `~` 的目录，不会展开。让调用方拿到真实路径再传进来，比在每个操作里偷偷展开
	 * 要好——后者会让「传进去的路径」和「实际操作的路径」对不上。
	 */
	async resolveHomeDirectory(signal?: AbortSignal): Promise<string> {
		if (this.homeDirectory !== undefined) return this.homeDirectory;
		// 模板串里写 `\${`：普通字符串里的 `${` 会被 lint 当成写漏的模板插值。
		const result = await this.runChecked(`printf %s "\${HOME:?no home}"`, { signal });
		this.homeDirectory = decode(result.stdout).trim();
		return this.homeDirectory;
	}

	/** 把开头的 `~` 展开成远端家目录；其余路径原样返回。 */
	async expandRemotePath(remotePath: string, signal?: AbortSignal): Promise<string> {
		if (remotePath !== "~" && !remotePath.startsWith("~/")) return remotePath;
		const home = await this.resolveHomeDirectory(signal);
		return remotePath === "~" ? home : `${home.replace(/\/+$/, "")}${remotePath.slice(1)}`;
	}

	/** 执行用户命令。走登录 shell，因此 nvm、pyenv 之类的 PATH 设置生效。 */
	async exec(command: string, options: SshExecOptions = {}): Promise<SshExecResult> {
		// 先确保连接已建立。认证（口令、2FA、指纹确认）只发生在第一条命令上，而调用方
		// 给的 timeout 是按「这条命令该跑多久」定的——几十秒——会在用户还在输密码时
		// 把 ssh 杀掉。探测结果有缓存，之后的调用不会多一次往返。
		await this.probePlatform(options.signal);
		const processToken = `vetta-exec-${randomBytes(8).toString("hex")}`;
		// 取消与超时都收到这里统一处理，因为两者要做同一件事：**立刻**去远端把进程组杀掉。
		// 没有 pty，掐掉本地 ssh 并不会让远端进程结束；而等本地 ssh 自己退出再去杀也不行——
		// 远端进程还攥着通道的 stdout，本地 ssh 可能就一直等在那里。
		const controller = new AbortController();
		let interruption: "aborted" | "timeout" | undefined;
		let remoteKill: Promise<unknown> | undefined;
		const interrupt = (reason: "aborted" | "timeout"): void => {
			if (interruption) return;
			interruption = reason;
			remoteKill = this.run(buildKillCommand(processToken), { timeoutMs: REMOTE_KILL_TIMEOUT_MS }).catch(() => {});
			controller.abort();
		};
		const onAbort = (): void => interrupt("aborted");
		if (options.signal?.aborted) interrupt("aborted");
		options.signal?.addEventListener("abort", onAbort, { once: true });
		const timer =
			options.timeoutMs === undefined ? undefined : setTimeout(() => interrupt("timeout"), options.timeoutMs);
		timer?.unref?.();

		let result: SshProcessResult;
		try {
			result = await this.run(buildRemoteCommand(command, { cwd: options.cwd, env: options.env, processToken }), {
				onStdout: options.onStdout,
				onStderr: options.onStderr,
				signal: controller.signal,
			});
		} catch (error) {
			if (interruption) {
				await remoteKill;
				throw new SshOperationAbortedError(
					interruption === "timeout"
						? `Remote operation on ${this.host.label} timed out.`
						: `Remote operation on ${this.host.label} was cancelled.`,
					this.host.id,
					interruption,
				);
			}
			// 传输故障时也尝试清理：可能只是这一条通道断了。杀不到就算了，错误照原样抛。
			if (error instanceof SshTransportError) {
				await this.run(buildKillCommand(processToken), { timeoutMs: REMOTE_KILL_TIMEOUT_MS }).catch(() => {});
			}
			throw error;
		} finally {
			if (timer !== undefined) clearTimeout(timer);
			options.signal?.removeEventListener("abort", onAbort);
		}
		if (result.exitCode === null) {
			// 本地 ssh 被外部信号杀掉：远端命令的结局不可知，不能报成 0。
			throw new SshTransportError(
				`Lost the connection to ${this.host.label} while the command was running.`,
				this.host.id,
				result.stderr,
			);
		}
		return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
	}

	async readFile(remotePath: string, signal?: AbortSignal): Promise<Uint8Array> {
		const viaHelper = await this.viaHelper((helper) =>
			helper.call<{ data: string }>(
				"fs.readFile",
				{ path: remotePath, offset: 0, length: -1 },
				{ signal, timeoutMs: 30_000 },
			),
		);
		if (viaHelper) return Buffer.from(viaHelper.value.data, "base64");
		const result = await this.runChecked(`cat -- ${quoteShellArgument(remotePath)}`, { signal, timeoutMs: 30_000 });
		return result.stdout;
	}

	/** 只取文件开头若干字节，用于判断类型：不必为了看一眼文件头把整份文件拖过网络。 */
	async readFileHead(remotePath: string, byteCount: number, signal?: AbortSignal): Promise<Uint8Array> {
		const viaHelper = await this.viaHelper((helper) =>
			helper.call<{ data: string }>(
				"fs.readFile",
				{
					path: remotePath,
					offset: 0,
					length: Math.max(0, Math.floor(byteCount)),
				},
				{ signal, timeoutMs: 30_000 },
			),
		);
		if (viaHelper) return Buffer.from(viaHelper.value.data, "base64");
		const count = Math.max(0, Math.floor(byteCount));
		const result = await this.runChecked(`head -c ${count} -- ${quoteShellArgument(remotePath)}`, {
			signal,
			timeoutMs: 30_000,
		});
		return result.stdout;
	}

	/**
	 * 读取 `[start, start + length)` 这一段字节。媒体播放按 Range 取数据，拖动进度条时不必
	 * 把整份文件拖过网络。`tail -c +N` 从第 N 个字节起（从 1 计数），GNU 与 BSD 同义。
	 */
	async readFileRange(remotePath: string, start: number, length: number, signal?: AbortSignal): Promise<Uint8Array> {
		const viaHelper = await this.viaHelper((helper) =>
			helper.call<{ data: string }>(
				"fs.readFile",
				{
					path: remotePath,
					offset: Math.max(0, Math.floor(start)),
					length: Math.max(0, Math.floor(length)),
				},
				{ signal, timeoutMs: 30_000 },
			),
		);
		if (viaHelper) return Buffer.from(viaHelper.value.data, "base64");
		const from = Math.max(0, Math.floor(start)) + 1;
		const count = Math.max(0, Math.floor(length));
		const quoted = quoteShellArgument(remotePath);
		const result = await this.runChecked(`tail -c +${from} -- ${quoted} | head -c ${count}`, {
			signal,
			timeoutMs: 30_000,
		});
		return result.stdout;
	}

	/** 原子写，保留原文件的权限位并穿透符号链接，见 {@link buildWriteFileCommand}。 */
	async writeFile(remotePath: string, content: Uint8Array, signal?: AbortSignal): Promise<void> {
		const viaHelper = await this.viaHelper((helper) =>
			helper.call("fs.writeFile", { path: remotePath, data: Buffer.from(content).toString("base64") }),
		);
		if (viaHelper) return;
		const command = buildWriteFileCommand(remotePath, `.vetta-tmp-${Date.now().toString(36)}`);
		await this.runChecked(command, { signal, stdin: content });
	}

	/**
	 * 流式下载远端文件：`cat` 的 stdout 逐块交给 `writeChunk`，字节计数即进度。
	 *
	 * 与 {@link SshConnection.readFile} 同一条 8-bit clean 通道语义，但不缓存整份内容——
	 * 大文件经 `openChannel` 流过管道直接落盘。取消走通道 kill；连接层失败按三分类上报
	 * （exitCode null → unverifiable，远端非零 → exited）。本机落盘由调用方负责：本包不做
	 * 本机文件 I/O（见 README「边界」）。
	 */
	async downloadFile(
		remotePath: string,
		writeChunk: (chunk: Uint8Array) => void,
		options: { signal?: AbortSignal; onProgress?: (bytes: number) => void } = {},
	): Promise<{ bytes: number }> {
		await this.probePlatform(options.signal);
		let bytes = 0;
		// 传输定局（完成/失败/取消）后管道里可能还残留已缓冲的块：不再交给调用方。传输已经
		// 定局，调用方的落盘侧可能已关闭，继续喂只会把一次干净的取消变成 uncaught exception。
		let delivering = true;
		const channel = this.openChannel(`cat -- ${quoteShellArgument(remotePath)}`, (chunk) => {
			if (!delivering || options.signal?.aborted) return;
			bytes += chunk.byteLength;
			writeChunk(chunk);
			options.onProgress?.(bytes);
		});
		if (!channel) {
			throw new SshRemoteCommandError(
				`This runner cannot open a transfer channel on ${this.host.label}`,
				this.host.id,
				-1,
				"",
			);
		}
		try {
			await this.settleTransferChannel(channel, options.signal);
			return { bytes };
		} finally {
			delivering = false;
		}
	}

	/**
	 * 流式上传本机文件到远端：内容逐块写入 `buildUploadFileCommand` 的通道，远端 mv 前校验
	 * 字节数（见 {@link buildUploadFileCommand}），中途取消不会让半截文件替换目标。
	 *
	 * 本机读侧由调用方提供（本包不做本机文件 I/O）：`readChunk(offset, length)` 返回不超过
	 * `length` 的下一块，返回 0 字节视为源提前结束——远端的 wc 校验会拒绝这份传输并把临时
	 * 文件清理掉，目标文件保持原样。
	 */
	async uploadFile(
		remotePath: string,
		options: {
			readonly totalBytes: number;
			readonly readChunk: (offset: number, length: number) => Promise<Uint8Array>;
			readonly signal?: AbortSignal;
			readonly onProgress?: (bytes: number) => void;
		},
	): Promise<{ bytes: number }> {
		if (!Number.isSafeInteger(options.totalBytes) || options.totalBytes < 0) {
			throw new Error(`Invalid upload size: ${options.totalBytes}`);
		}
		await this.probePlatform(options.signal);
		const channel = this.openChannel(
			buildUploadFileCommand(remotePath, options.totalBytes, `.vetta-tmp-${Date.now().toString(36)}`),
			() => {},
		);
		if (!channel) {
			throw new SshRemoteCommandError(
				`This runner cannot open a transfer channel on ${this.host.label}`,
				this.host.id,
				-1,
				"",
			);
		}
		const { signal } = options;
		// 中途取消：杀掉本地通道。远端 cat 收到普通 EOF 后走到 wc 校验，字节数对不上，
		// 脚本自己清理临时文件并退非零——目标文件保持原样。
		const onAbort = (): void => channel.kill();
		signal?.addEventListener("abort", onAbort, { once: true });
		try {
			let sent = 0;
			while (sent < options.totalBytes && !signal?.aborted) {
				const requested = Math.min(UPLOAD_CHUNK_BYTES, options.totalBytes - sent);
				let chunk: Uint8Array;
				try {
					chunk = await options.readChunk(sent, requested);
				} catch (error) {
					// 本机下载读侧故障：远端 `cat > tmp` 还在等 stdin，不杀通道它会一直挂着。
					channel.kill();
					throw error;
				}
				// 源比声明短：把已读到的发过去，让远端 wc 校验拒绝这次传输。
				if (chunk.byteLength === 0) break;
				if (chunk.byteLength > requested) chunk = chunk.subarray(0, requested);
				if (channel.writeAsync !== undefined) await channel.writeAsync(chunk);
				else channel.write(chunk);
				sent += chunk.byteLength;
				options.onProgress?.(sent);
			}
			if (!signal?.aborted) channel.end();
			const { exitCode, stderr } = await channel.exited;
			if (signal?.aborted) {
				throw new SshOperationAbortedError(`Remote operation on ${this.host.label} was cancelled.`, this.host.id);
			}
			if (exitCode === null || exitCode === SSH_TRANSPORT_FAILURE_EXIT_CODE) {
				throw new SshTransportError(
					`Connection to ${this.host.label} closed during transfer: ${stderr.trim()}`,
					this.host.id,
					stderr,
				);
			}
			if (exitCode !== 0) {
				// 最常见的非零就是远端 wc 校验没过：源比声明短，或中途取消。
				throw new SshRemoteCommandError(
					`Remote command failed on ${this.host.label} (exit ${exitCode}): ${stderr.trim()}`,
					this.host.id,
					exitCode,
					stderr,
				);
			}
			return { bytes: sent };
		} finally {
			signal?.removeEventListener("abort", onAbort);
		}
	}

	/** 下载通道的收尾：取消即杀通道；退出状态按 {@link run} 同一套三分类上报。 */
	private async settleTransferChannel(channel: SshProcessChannel, signal?: AbortSignal): Promise<void> {
		const onAbort = (): void => channel.kill();
		signal?.addEventListener("abort", onAbort, { once: true });
		try {
			const { exitCode, stderr } = await channel.exited;
			if (signal?.aborted) {
				throw new SshOperationAbortedError(`Remote operation on ${this.host.label} was cancelled.`, this.host.id);
			}
			if (exitCode === null || exitCode === SSH_TRANSPORT_FAILURE_EXIT_CODE) {
				throw new SshTransportError(
					`Connection to ${this.host.label} closed during transfer: ${stderr.trim()}`,
					this.host.id,
					stderr,
				);
			}
			if (exitCode !== 0) {
				throw new SshRemoteCommandError(
					`Remote command failed on ${this.host.label} (exit ${exitCode}): ${stderr.trim()}`,
					this.host.id,
					exitCode,
					stderr,
				);
			}
		} finally {
			signal?.removeEventListener("abort", onAbort);
		}
	}

	/** 同一文件系统内是原子改名；跨文件系统时 `mv` 自己退化成复制加删除。目标已存在则覆盖。 */
	async rename(fromPath: string, toPath: string, signal?: AbortSignal): Promise<void> {
		if (await this.viaHelper((helper) => helper.call("fs.rename", { from: fromPath, to: toPath }))) return;
		await this.runChecked(`mv -f -- ${quoteShellArgument(fromPath)} ${quoteShellArgument(toPath)}`, { signal });
	}

	/** 递归删除。路径不存在也算成功——与本机 `rm(force)` 同义。 */
	async remove(remotePath: string, signal?: AbortSignal): Promise<void> {
		if (normalizeRemotePath(remotePath) === "/") throw new Error("Refusing to remove the remote root directory.");
		if (await this.viaHelper((helper) => helper.call("fs.remove", { path: remotePath }))) return;
		await this.runChecked(`rm -rf -- ${quoteShellArgument(remotePath)}`, { signal });
	}

	/** 新建空文件或目录；已存在时返回 `"exists"` 而不是覆盖。 */
	async createEntry(
		remotePath: string,
		kind: "file" | "directory",
		signal?: AbortSignal,
	): Promise<"created" | "exists"> {
		const viaHelper = await this.viaHelper(async (helper) => {
			try {
				await helper.call("fs.createEntry", { path: remotePath, kind });
				return "created" as const;
			} catch (error) {
				if (error instanceof SshHelperError && error.code === "EEXIST") return "exists" as const;
				throw error;
			}
		});
		if (viaHelper) return viaHelper.value;
		const result = await this.run(buildCreateEntryCommand(remotePath, kind), { signal });
		if (result.exitCode === 0) return "created";
		if (result.exitCode === REMOTE_ENTRY_EXISTS_EXIT_CODE) return "exists";
		throw new SshRemoteCommandError(
			`Remote command failed on ${this.host.label} (exit ${result.exitCode}): ${result.stderr.trim()}`,
			this.host.id,
			result.exitCode ?? -1,
			result.stderr,
		);
	}

	/** 递归列出普通文件的相对路径（POSIX 分隔，无 `./` 前缀）。 */
	async listFilesRecursive(
		remotePath: string,
		options: ListFilesRecursiveOptions,
		signal?: AbortSignal,
	): Promise<string[]> {
		const viaHelper = await this.viaHelper((helper) =>
			helper.call<{ files: string[] }>(
				"fs.listRecursive",
				{
					path: remotePath,
					ignoredDirectories: options.ignoredDirectoryNames,
					limit: options.limit,
					names: options.names,
				},
				{ signal, timeoutMs: 30_000 },
			),
		);
		// 旧版 helper 不认识 `names`、会照常全列，所以这里总是再筛一遍。
		if (viaHelper) return keepNamedFiles(viaHelper.value.files, options.names);
		const result = await this.runChecked(buildListFilesRecursiveCommand(remotePath, options), {
			signal,
			timeoutMs: 30_000,
		});
		return decode(result.stdout)
			.split("\n")
			.map((line) => line.replace(/^\.\//, ""))
			.filter((line) => line.length > 0);
	}

	async makeDirectory(remotePath: string, signal?: AbortSignal): Promise<void> {
		if (await this.viaHelper((helper) => helper.call("fs.mkdir", { path: remotePath }))) return;
		await this.runChecked(`mkdir -p -- ${quoteShellArgument(remotePath)}`, { signal });
	}

	async listDirectory(remotePath: string, signal?: AbortSignal): Promise<RemoteDirectoryEntry[]> {
		const viaHelper = await this.viaHelper((helper) =>
			helper.call<{ entries: HelperEntry[] }>("fs.readDir", { path: remotePath }, { signal, timeoutMs: 30_000 }),
		);
		if (viaHelper) return viaHelper.value.entries.map(fromHelperEntry);
		const platform = await this.probePlatform(signal);
		const command = buildListDirectoryCommand(remotePath, platform.statFlavor);
		const result = await this.runChecked(command, { signal, timeoutMs: 30_000 });
		const output = decode(result.stdout);
		const entries = parseRemoteDirectoryListing(output);
		// 只在「有输出却解析不出条目」时上报：那是解析与远端输出格式对不上的信号，
		// 也是唯一一种不会报错、却让界面显示为空的故障。
		if (entries.length === 0 && output.trim().length > 0) {
			this.options.onTrace?.({ command, output: output.slice(0, 2_000), entryCount: 0 });
		}
		return entries;
	}

	/** 路径不存在时返回 null——这是远端给出的正面答复，不是「问不到」。 */
	async stat(
		remotePath: string,
		signal?: AbortSignal,
		options: { readonly followSymlinks?: boolean } = {},
	): Promise<RemoteDirectoryEntry | null> {
		const viaHelper = await this.viaHelper((helper) =>
			helper.call<{ entry: HelperEntry | null }>(
				"fs.stat",
				{
					path: remotePath,
					followSymlinks: options.followSymlinks === true,
				},
				{ signal, timeoutMs: 30_000 },
			),
		);
		if (viaHelper) return viaHelper.value.entry ? fromHelperEntry(viaHelper.value.entry) : null;
		const platform = await this.probePlatform(signal);
		const result = await this.runChecked(buildStatCommand(remotePath, platform.statFlavor, options), {
			signal,
			timeoutMs: 30_000,
		});
		const entries = parseRemoteDirectoryListing(decode(result.stdout));
		const entry = entries[0];
		if (!entry) return null;
		// stat 回显的是传入路径，这里换回调用方期望的名字。
		return { ...entry, name: basename(remotePath) };
	}

	/** 真实路径。路径不存在，或远端的 readlink 不支持 `-f` 时，原样返回传入的路径。 */
	async realPath(remotePath: string, signal?: AbortSignal): Promise<string> {
		const viaHelper = await this.viaHelper(async (helper) => {
			try {
				return (
					await helper.call<{ path: string }>("fs.realPath", { path: remotePath }, { signal, timeoutMs: 30_000 })
				).path;
			} catch (error) {
				// 与 exec 那条路同义：路径不存在时原样返回。
				if (error instanceof SshHelperError && error.code === "ENOENT") return remotePath;
				throw error;
			}
		});
		if (viaHelper) return viaHelper.value;
		const result = await this.run(buildRealPathCommand(remotePath), { signal, timeoutMs: 30_000 });
		const resolved = decode(result.stdout).trim();
		return result.exitCode === 0 && resolved.startsWith("/") ? resolved : remotePath;
	}

	/**
	 * 远端 helper；不可用时为 undefined，调用方必须有 `ssh exec` 的降级路径。
	 *
	 * 失败分两类（TASK-0166）：
	 * - 平台/构建/协议不支持 → 结论按连接永久缓存，不忙重试；
	 * - 临时失败（网络、上传、通道、握手）→ 有界恢复：退避窗口内直接降级返回 undefined，
	 *   窗口过后且调用方再次需要 helper 时才重试；连续失败达上限后按连接放弃。
	 * 没有后台自动重试循环，避免认证弹窗风暴。
	 *
	 * helper 的通道断了（网络抖动、远端被杀）之后下一次调用会重新部署。
	 */
	helper(): Promise<SshHelperClient | undefined> {
		const options = this.options.helper;
		if (!options) return Promise.resolve(undefined);
		if (this.readyHelper) return Promise.resolve(this.readyHelper);
		// 已失效的连接不再拉起新的 helper 部署；探测在后台预热 helper 的路径会走到这里。
		if (this.disposed || this.helperUnsupported || this.helperExhausted) return Promise.resolve(undefined);
		if (this.helperAttempt) return this.helperAttempt;
		const now = this.options.now ?? Date.now;
		if (now() < this.helperNextRetryAt) return Promise.resolve(undefined);
		const attempt = connectSshHelper(this, options)
			.then((establishment) => {
				if (establishment.status === "ready") {
					const client = establishment.client;
					this.helperFailures = 0;
					this.helperNextRetryAt = 0;
					this.readyHelper = client;
					client.onClose(() => {
						if (this.readyHelper === client) this.readyHelper = undefined;
					});
					return client;
				}
				if (establishment.status === "unsupported") {
					this.helperUnsupported = true;
					return undefined;
				}
				this.helperFailures += 1;
				if (this.helperFailures >= HELPER_MAX_FAILURES) {
					this.helperExhausted = true;
					options.onDiagnostic?.(
						`[ssh-helper] ${this.host.label}: giving up on helper recovery after ${HELPER_MAX_FAILURES} failures; using ssh exec for this connection`,
					);
				} else {
					this.helperNextRetryAt = now() + HELPER_RETRY_BACKOFF_MS * this.helperFailures;
				}
				return undefined;
			})
			.finally(() => {
				if (this.helperAttempt === attempt) this.helperAttempt = undefined;
			});
		this.helperAttempt = attempt;
		return attempt;
	}

	/**
	 * 把远端的一个端口转发到本机端口上。
	 *
	 * 远程项目里的预览服务器（设计画布的 vite）必须跑在项目所在的机器上才读得到项目文件，
	 * 而界面只能连本机的端口——转发是把这两件事接起来的唯一办法。
	 *
	 * 服务端可能关掉了转发（`AllowTcpForwarding no`，精简镜像与加固过的堡垒机上很常见）。
	 * 那种情况下 `-O forward` 会失败，这里如实抛出：否则界面会连上一个转发不过去的本机端口，
	 * 表现为莫名其妙的 connection reset。
	 */
	async forwardPort(localPort: number, remotePort: number, signal?: AbortSignal): Promise<void> {
		// 先确保 master 在：`-O forward` 只对已建立的控制连接有效。
		await this.probePlatform(signal);
		const result = await this.options.runner.run({
			argv: buildPortForwardArgv(this.host, { controlPath: this.options.controlPath }, { localPort, remotePort }),
			signal,
			env: this.options.env,
		});
		if (result.exitCode !== 0) {
			const detail = result.stderr.trim();
			throw new SshTransportError(
				`Cannot forward port ${remotePort} from ${this.host.label}` +
					`${detail ? `: ${detail}` : "."} The SSH server may have TCP forwarding disabled (AllowTcpForwarding).`,
				this.host.id,
				result.stderr,
			);
		}
	}

	/** 撤掉一条转发。失败不抛：转发会随 master 一起消失，清理不掉不该拖累调用方收尾。 */
	async cancelPortForward(localPort: number, remotePort: number): Promise<void> {
		await this.options.runner
			.run({
				argv: buildPortForwardArgv(
					this.host,
					{ controlPath: this.options.controlPath },
					{ localPort, remotePort, cancel: true },
				),
				env: this.options.env,
			})
			.catch(() => undefined);
	}

	/**
	 * 远端正在监听的、可以转发回本机的 TCP 端口。
	 *
	 * 用户要转发的是「我刚起的那个开发服务器」，但他记不住端口，也不该为了查它去开一个
	 * 终端。这里直接问远端，界面就能把候选摆出来。
	 *
	 * 返回值带上实际用了哪种手段：「远端一个扫描工具都没装」是远端给出的明确答复，不是
	 * 传输故障，界面要据此改成让用户手动输入端口号，所以不能用抛错表达。
	 *
	 * 结果按端口去重并滤掉转不过去的地址。sshd 与其他特权端口照样列出、但标上
	 * `sensitive`，由界面决定怎么收起来——藏掉的话用户想看「22 上是谁」也没处看。
	 */
	async listListeningPorts(signal?: AbortSignal): Promise<RemoteListenerScan> {
		const viaHelper = await this.viaHelper(async (helper) => {
			try {
				return (await helper.call<{ ports: HelperListener[] }>("net.listeners")).ports.map(fromHelperListener);
			} catch (error) {
				// 远端可能还留着不认识这个方法的旧 helper，或者 helper 在这个系统上没实现它。
				// 那不是远端的否定答复，退回 `ssh exec` 扫一遍才是对的。
				if (error instanceof SshHelperError && error.code === "ENOSYS") return undefined;
				throw error;
			}
		});
		let scan: RemoteListenerScan;
		if (viaHelper?.value) {
			scan = { tool: "helper", ports: selectForwardablePorts(viaHelper.value) };
		} else {
			const platform = await this.probePlatform(signal);
			const result = await this.runChecked(buildListListeningPortsCommand(platform.statFlavor), { signal });
			const parsed = parseRemoteListeners(decode(result.stdout));
			scan = { tool: parsed.tool, ports: selectForwardablePorts(parsed.ports) };
		}
		const ports = await this.withProcessInfo(scan.ports, signal);
		const sshPort = this.host.port ?? 22;
		return {
			tool: scan.tool,
			ports: ports.map((port) => ({ ...port, sensitive: isSensitiveListenerPort(port.port, sshPort) })),
		};
	}

	/**
	 * 给缺启动时间的端口补上进程信息。
	 *
	 * helper 已经从 `/proc` 读好的不再问；旧版 helper 与 `ssh exec` 路径拿不到，多一次 `ps`
	 * 往返补齐。这一步失败只是少了排序依据，不能让整次扫描跟着失败。
	 */
	private async withProcessInfo(
		ports: readonly RemoteListeningPort[],
		signal?: AbortSignal,
	): Promise<RemoteListeningPort[]> {
		const pids = [
			...new Set(ports.filter((port) => port.pid && port.startedAt === undefined).map((port) => port.pid ?? 0)),
		];
		if (pids.length === 0) return [...ports];
		let info: Map<number, RemoteProcessInfo>;
		try {
			const result = await this.run(buildProcessInfoCommand(pids), { signal });
			info = parseProcessInfo(decode(result.stdout), Date.now());
		} catch (error) {
			if (error instanceof SshOperationAbortedError) throw error;
			return [...ports];
		}
		return ports.map((port) => {
			const found = port.pid === undefined ? undefined : info.get(port.pid);
			if (!found) return port;
			return { ...port, command: port.command ?? found.command, startedAt: port.startedAt ?? found.startedAt };
		});
	}

	/**
	 * 终止远端一个进程——端口面板里「停掉这个服务」。
	 *
	 * 返回进程是否已经退出：发了 SIGTERM 却还活着时界面要能给出「强制终止」，而不是装作
	 * 成功。权限不够（别人的进程）时抛错，原因照 `kill` 的原话带出来。
	 */
	async terminateProcess(
		pid: number,
		options: { readonly force?: boolean; readonly signal?: AbortSignal } = {},
	): Promise<{ exited: boolean }> {
		const result = await this.run(buildTerminateProcessCommand(pid, options.force === true), {
			signal: options.signal,
		});
		if (result.exitCode === 0) return { exited: true };
		if (result.exitCode === PROCESS_STILL_ALIVE_EXIT_CODE) return { exited: false };
		throw new SshRemoteCommandError(
			`Could not stop process ${pid} on ${this.host.label}: ${result.stderr.trim()}`,
			this.host.id,
			result.exitCode ?? -1,
			result.stderr,
		);
	}

	/**
	 * 打开一条保持连接的通道，远端命令的 stdin/stdout 交给调用方。执行器不支持时返回
	 * undefined，调用方据此走一问一答的降级路径。
	 */
	openChannel(
		remoteCommand: string,
		onStdout: (chunk: Uint8Array) => void,
		options: { readonly requestTty?: boolean } = {},
	): SshProcessChannel | undefined {
		if (!this.options.runner.open) return undefined;
		const argv = buildSshArgv(
			this.host,
			{
				controlPath: this.options.controlPath,
				connectTimeoutSeconds: this.options.connectTimeoutSeconds,
				requestTty: options.requestTty,
			},
			remoteCommand,
		);
		return this.options.runner.open({ argv, onStdout, env: this.options.env });
	}

	/**
	 * 开一个远端交互式终端。
	 *
	 * helper 在就用 `pty.*`：真伪终端、能改尺寸、输出走通知推送。helper 不在或版本旧
	 * （`ENOSYS`）就退回 `ssh -tt`——能用，但送不进窗口尺寸变化，所以会把
	 * `canResize: false` 报给上层，由界面如实告知用户。
	 *
	 * 与 `proc.*` 刻意不同：终端是连接作用域的，通道断了这个会话就结束，不做落盘接管。
	 */
	async openPty(options: OpenRemotePtyOptions): Promise<RemotePtySession> {
		const viaHelper = await this.viaHelper(async (helper) => {
			try {
				const opened = await helper.call<{ id: string }>("pty.open", {
					cwd: options.cwd,
					shell: options.shell,
					env: options.env,
					cols: Math.trunc(options.cols),
					rows: Math.trunc(options.rows),
				});
				return this.helperPtySession(helper, opened.id);
			} catch (error) {
				// 旧 helper 不认识 pty.*：这不是远端的否定答复，退回 `ssh -tt` 才对。
				if (error instanceof SshHelperError && error.code === "ENOSYS") return undefined;
				throw error;
			}
		});
		if (viaHelper?.value) return viaHelper.value;
		return this.ttyPtySession(options);
	}

	private helperPtySession(helper: SshHelperClient, ptyId: string): RemotePtySession {
		const dataListeners = new Set<(chunk: string, dropped: number) => void>();
		const exit = createExitLatch();
		const offData = helper.on("pty.data", (params) => {
			if (!isRemotePtyDataNotification(params) || params.id !== ptyId) return;
			const chunk = decode(Uint8Array.from(Buffer.from(params.dataB64, "base64")));
			const dropped = typeof params.dropped === "number" ? params.dropped : 0;
			for (const listener of dataListeners) listener(chunk, dropped);
		});
		const offExit = helper.on("pty.exit", (params) => {
			if (!isRemotePtyExitNotification(params) || params.id !== ptyId) return;
			exit.emit({ exitCode: typeof params.exitCode === "number" ? params.exitCode : null });
		});
		const detach = (): void => {
			offData();
			offExit();
		};
		return {
			backend: "helper",
			canResize: true,
			write: (data) => {
				void helper
					.call("pty.write", { id: ptyId, dataB64: Buffer.from(data, "utf8").toString("base64") })
					.catch(() => {});
			},
			resize: (cols, rows) => {
				void helper
					.call("pty.resize", { id: ptyId, cols: Math.trunc(cols), rows: Math.trunc(rows) })
					.catch(() => {});
			},
			close: () => {
				detach();
				void helper.call("pty.close", { id: ptyId }).catch(() => {});
			},
			onData: (listener) => {
				dataListeners.add(listener);
				return () => dataListeners.delete(listener);
			},
			onExit: exit.subscribe,
		};
	}

	private ttyPtySession(options: OpenRemotePtyOptions): RemotePtySession {
		const dataListeners = new Set<(chunk: string, dropped: number) => void>();
		const exit = createExitLatch();
		const channel = this.openChannel(
			buildTtyShellCommand(options),
			(chunk) => {
				const text = decode(chunk);
				// `ssh -tt` 这条路没有远端缓冲，不会丢块。
				for (const listener of dataListeners) listener(text, 0);
			},
			{ requestTty: true },
		);
		if (!channel) {
			throw new SshRemoteCommandError(
				`This runner cannot open an interactive terminal on ${this.host.label}`,
				this.host.id,
				-1,
				"",
			);
		}
		void channel.exited.then(({ exitCode }) => exit.emit({ exitCode }));
		return {
			backend: "tty",
			// 本机 stdin 不是 tty，窗口尺寸变化没有渠道送过去，也没法补发 SIGWINCH。
			canResize: false,
			write: (data) => channel.write(new TextEncoder().encode(data)),
			resize: () => {},
			close: () => channel.kill(),
			onData: (listener) => {
				dataListeners.add(listener);
				return () => dataListeners.delete(listener);
			},
			onExit: exit.subscribe,
		};
	}

	/**
	 * helper 就绪时经它完成一次操作；返回 undefined 表示「这次没走成，请用 `ssh exec`」。
	 *
	 * 两种失败要分开：helper **明确回答了不行**（文件不存在、没权限）是远端的答复，换一条路
	 * 再问一遍只会得到同样的结果，直接按远端命令失败上报；而**通道断了**说明没问到，这时
	 * 退回 `ssh exec` 才有意义。
	 */
	private async viaHelper<Value>(
		operation: (helper: SshHelperClient) => Promise<Value>,
	): Promise<{ readonly value: Value } | undefined> {
		const helper = this.readyHelper;
		if (!helper || helper.isClosed) return undefined;
		try {
			return { value: await operation(helper) };
		} catch (error) {
			if (error instanceof SshHelperRequestAbortedError) {
				throw new SshOperationAbortedError(error.message, this.host.id, error.reason);
			}
			if (error instanceof SshHelperClosedError) return undefined;
			if (error instanceof SshHelperError) {
				throw new SshRemoteCommandError(
					`Remote operation failed on ${this.host.label} (${error.code}): ${error.message}`,
					this.host.id,
					1,
					error.message,
				);
			}
			throw error;
		}
	}

	/** 退出码非零即抛。内部操作都用它——它们没有「失败也算正常」的分支。 */
	private async runChecked(
		remoteCommand: string,
		options: { signal?: AbortSignal; timeoutMs?: number; stdin?: Uint8Array },
	): Promise<SshProcessResult> {
		const result = await this.run(remoteCommand, options);
		if (result.exitCode !== 0) {
			throw new SshRemoteCommandError(
				`Remote command failed on ${this.host.label} (exit ${result.exitCode}): ${result.stderr.trim()}`,
				this.host.id,
				result.exitCode ?? -1,
				result.stderr,
			);
		}
		return result;
	}

	private async run(
		remoteCommand: string,
		options: {
			signal?: AbortSignal;
			timeoutMs?: number;
			stdin?: Uint8Array;
			onStdout?: (chunk: Uint8Array) => void;
			onStderr?: (chunk: Uint8Array) => void;
		},
	): Promise<SshProcessResult> {
		const argv = buildSshArgv(
			this.host,
			{ controlPath: this.options.controlPath, connectTimeoutSeconds: this.options.connectTimeoutSeconds },
			remoteCommand,
		);
		const result = await this.options.runner.run({
			argv,
			stdin: options.stdin,
			onStdout: options.onStdout,
			onStderr: options.onStderr,
			signal: options.signal,
			timeoutMs: options.timeoutMs,
			env: this.options.env,
		});
		if (result.aborted) {
			throw new SshOperationAbortedError(
				result.timedOut
					? `Remote operation on ${this.host.label} timed out.`
					: `Remote operation on ${this.host.label} was cancelled.`,
				this.host.id,
				result.timedOut ? "timeout" : "aborted",
			);
		}
		// 255 是 OpenSSH 表示连接层失败的保留码。远端命令本身也可能返回 255，两者无法
		// 完全区分；宁可报成「问不到」——把连接故障误判成「命令失败」会让上层以为拿到了
		// 远端的答复，而反过来只是多一次重试。
		if (result.exitCode === SSH_TRANSPORT_FAILURE_EXIT_CODE) {
			throw new SshTransportError(
				`Cannot reach ${this.host.label}: ${result.stderr.trim()}`,
				this.host.id,
				result.stderr,
			);
		}
		return result;
	}
}

interface HelperEntry {
	readonly name: string;
	readonly kind: RemoteDirectoryEntry["kind"];
	readonly size: number;
	readonly modifiedMs: number;
}

function fromHelperEntry(entry: HelperEntry): RemoteDirectoryEntry {
	return {
		name: entry.name,
		kind: entry.kind,
		sizeBytes: entry.size,
		modifiedAtSeconds: Math.floor(entry.modifiedMs / 1000),
	};
}

/**
 * 退出事件的锁存转发器。
 *
 * 会话可能在调用方注册 `onExit` 之前就结束了（shell 起不来、helper 立刻回 exit），
 * 那时直接广播等于把事件丢掉，界面会永远停在「启动中」。这里记住已发生的退出，
 * 后注册的监听者立刻补到。
 */
function createExitLatch(): {
	emit: (event: { exitCode: number | null }) => void;
	subscribe: (listener: (event: { exitCode: number | null }) => void) => () => void;
} {
	const listeners = new Set<(event: { exitCode: number | null }) => void>();
	let settled: { exitCode: number | null } | undefined;
	return {
		emit: (event) => {
			if (settled) return;
			settled = event;
			for (const listener of [...listeners]) listener(event);
			listeners.clear();
		},
		subscribe: (listener) => {
			if (settled) {
				listener(settled);
				return () => {};
			}
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}

function decode(bytes: Uint8Array): string {
	return new TextDecoder().decode(bytes);
}

function basename(remotePath: string): string {
	const trimmed = remotePath.replace(/\/+$/, "");
	const index = trimmed.lastIndexOf("/");
	return index < 0 ? trimmed : trimmed.slice(index + 1);
}

function keepNamedFiles(files: readonly string[], names: readonly string[] | undefined): string[] {
	if (!names?.length) return [...files];
	const wanted = new Set(names);
	return files.filter((file) => wanted.has(basename(file)));
}
