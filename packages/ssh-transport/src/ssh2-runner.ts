// Copyright The Open Forge contributors.
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import type { Client, ClientChannel, ConnectConfig } from "ssh2";
import ssh2 from "ssh2";
import { classifySshPrompt } from "./askpass.js";
import { formatHostKeyFingerprint } from "./known-hosts.js";
import {
	SSH_TRANSPORT_FAILURE_EXIT_CODE,
	type SshChannelInvocation,
	type SshProcessChannel,
	type SshProcessInvocation,
	type SshProcessResult,
	type SshProcessRunner,
} from "./process-runner.js";
import type { SshHost } from "./ssh-host.js";
import { type ResolvedSshTarget, type RunSshConfigQuery, resolveSshTarget } from "./ssh-target.js";

/**
 * 进程内传输实现（ssh2），Windows 上 OpenSSH 路径的替代。
 *
 * 与 spawn 路径保持同一份 argv 合同——`SshConnection` 组装什么，这里就解析什么——但
 * 多路复用不再靠 ControlMaster+unix socket：`Client` 本身就是多路复用传输，一条已
 * 认证连接上开任意多条 channel。这正是 Windows 必须走这条路的原因：OpenSSH 的 mux
 * 协议依赖 unix fd 传递，MSYS2 与 Win32-OpenSSH 都过不去（BUG-0049）。
 *
 * 安全边界与 OpenSSH 路径等价：
 * - 主机密钥经 `verifyHostKey` 回调，由宿主查 known_hosts 决定放行/确认/拒绝；
 *   不提供时默认拒绝（fail closed），与 StrictHostKeyChecking=yes 对齐；
 * - 口令、私钥口令、keyboard-interactive 都经 `askSecret` 走宿主提示桥，不落盘；
 * - `invocation.env`（askpass 环境）在这条路上没有对应物，参数被忽略。
 */

export interface Ssh2HostKeyInfo {
	readonly hostId: string;
	readonly hostname: string;
	readonly port: number;
	readonly keyType: string;
	readonly keyBase64: string;
	readonly fingerprint: string;
}

export interface Ssh2SecretRequest {
	readonly hostId: string;
	readonly kind: "password" | "passphrase" | "keyboard-interactive";
	readonly prompt: string;
	/** 同一次连接建立的提示轮次：存储凭据每轮只自动取用一次，之后必须问用户。 */
	readonly round: number;
}

export interface Ssh2ProcessRunnerOptions {
	/**
	 * argv 尾部 target → SshHost。拿到主机就能按 `ssh -G` 重放 OpenSSH 的解析结果；
	 * 拿不到时退回 argv 里自带的 `-p`/`-i` 与 `user@host` 直解析，提示用 target 当 id。
	 */
	readonly resolveHost: (target: string) => SshHost | undefined;
	/** 主机密钥校验：true 放行，false 拒绝。缺省=拒绝一切（fail closed）。 */
	readonly verifyHostKey?: (info: Ssh2HostKeyInfo) => Promise<boolean>;
	/** 私密信息提示；返回 undefined 表示用户取消。 */
	readonly askSecret?: (request: Ssh2SecretRequest) => Promise<string | undefined>;
	/** `ssh -G` 执行器注入；生产走真实二进制，测试给固定输出或错误。 */
	readonly runConfigQuery?: RunSshConfigQuery;
	/** SSH agent socket；Windows 上传 `\\.\pipe\openssh-ssh-agent` 或 "pageant"。 */
	readonly agentPath?: string;
	readonly readFile?: (path: string) => Promise<Buffer>;
	/** 测试用 client 工厂；生产是 `new Client()`。 */
	readonly makeClient?: () => Client;
	readonly logger?: (line: string) => void;
}

interface ParsedInvocation {
	readonly target: string;
	readonly port?: number;
	readonly identityFile?: string;
	readonly connectTimeoutSeconds: number;
	readonly remoteCommand?: string;
	readonly requestTty: boolean;
	readonly forward?: {
		readonly action: "forward" | "cancel";
		readonly localPort: number;
		readonly remotePort: number;
	};
}

export interface Ssh2ProcessRunner extends SshProcessRunner {
	/** 丢弃指定 target 的会话与转发监听；主机配置变更/删除时由连接层调用。 */
	invalidate(target: string): void;
	/** 拆掉全部会话与转发监听；测试与宿主退出时用。 */
	dispose(): void;
}

const MAX_PASSWORD_ATTEMPTS = 3;
const DEFAULT_CONNECT_TIMEOUT_SECONDS = 15;
const STDERR_TAIL_BYTES = 16 * 1024;

/**
 * 没有调用方 deadline 时的建连预算。
 *
 * ssh2 的 `readyTimeout` 覆盖整个握手——主机密钥确认、口令、2FA 提示里等用户输入的
 * 时间都算在内，所以不能沿用 `ConnectTimeout`（它本来只管 TCP 建连）。对齐
 * `SshConnection` 首命令的 4 分钟宽限：留够用户读完指纹、翻密码管理器的余量。
 */
const DEFAULT_ESTABLISH_TIMEOUT_MS = 4 * 60 * 1000;

export function createSsh2ProcessRunner(options: Ssh2ProcessRunnerOptions): Ssh2ProcessRunner {
	const sessions = new Map<string, Ssh2Session>();
	const sessionFor = (target: string): Ssh2Session => {
		let session = sessions.get(target);
		if (session === undefined) {
			session = new Ssh2Session(target, options);
			sessions.set(target, session);
		}
		return session;
	};

	const ensureClient = (
		spec: ParsedInvocation,
		signal: AbortSignal | undefined,
		budgetMs: number | undefined,
	): Promise<{ client?: Client; failure?: SshProcessResult }> => {
		if (signal?.aborted) {
			return Promise.resolve({
				failure: { exitCode: null, stdout: new Uint8Array(), stderr: "", aborted: true },
			});
		}
		const session = sessionFor(spec.target);
		// 注意不把自己的 signal 传进 establish：这次的调用方放弃不等于该停掉共享的建连过程——
		// 别的并发调用方还在等，而且它完成后同样是可复用的已认证连接。
		return raceAbort(session.ensureReady(spec, budgetMs), signal).then(
			(client) => ({ client }),
			(error: unknown) => {
				if (signal?.aborted) {
					return { failure: { exitCode: null, stdout: new Uint8Array(), stderr: "", aborted: true } };
				}
				return {
					failure: {
						exitCode: SSH_TRANSPORT_FAILURE_EXIT_CODE,
						stdout: new Uint8Array(),
						stderr: errorMessage(error),
						aborted: false,
					},
				};
			},
		);
	};

	const runForward = async (spec: ParsedInvocation, signal: AbortSignal | undefined): Promise<SshProcessResult> => {
		const forward = spec.forward;
		if (forward === undefined) {
			return {
				exitCode: SSH_TRANSPORT_FAILURE_EXIT_CODE,
				stdout: new Uint8Array(),
				stderr: "missing forward spec",
				aborted: false,
			};
		}
		const session = sessionFor(spec.target);
		if (forward.action === "cancel") {
			return session.cancelForward(forward.localPort)
				? { exitCode: 0, stdout: new Uint8Array(), stderr: "", aborted: false }
				: {
						exitCode: SSH_TRANSPORT_FAILURE_EXIT_CODE,
						stdout: new Uint8Array(),
						stderr: `No forward on local port ${forward.localPort}.`,
						aborted: false,
					};
		}
		const { client, failure } = await ensureClient(spec, signal, undefined);
		if (client === undefined) return failure as SshProcessResult;
		try {
			await session.addForward(client, forward.localPort, forward.remotePort);
			return { exitCode: 0, stdout: new Uint8Array(), stderr: "", aborted: false };
		} catch (error) {
			return {
				exitCode: SSH_TRANSPORT_FAILURE_EXIT_CODE,
				stdout: new Uint8Array(),
				stderr: errorMessage(error),
				aborted: false,
			};
		}
	};

	const parseSpec = (argv: readonly string[]): ParsedInvocation | SshProcessResult => {
		try {
			return parseInvocationArgv(argv);
		} catch (error) {
			return {
				exitCode: SSH_TRANSPORT_FAILURE_EXIT_CODE,
				stdout: new Uint8Array(),
				stderr: errorMessage(error),
				aborted: false,
			};
		}
	};

	return {
		async run(invocation: SshProcessInvocation): Promise<SshProcessResult> {
			if (invocation.signal?.aborted) {
				return { exitCode: null, stdout: new Uint8Array(), stderr: "", aborted: true };
			}
			const spec = parseSpec(invocation.argv);
			if (!isParsedInvocation(spec)) return spec;
			if (spec.forward !== undefined) return runForward(spec, invocation.signal);

			// OpenSSH 进程模型下 timeoutMs 管的是整条命令（含建连），这里保持同一条deadline：
			// 建连等口令的时间也算在里面，与首命令 4 分钟宽限的设计一致。
			const deadline = linkDeadline(invocation.signal, invocation.timeoutMs);
			const { client, failure } = await ensureClient(spec, deadline.signal, deadline.remainingMs());
			if (client === undefined) {
				deadline.dispose();
				const failed = failure ?? { exitCode: null, stdout: new Uint8Array(), stderr: "", aborted: true };
				return { ...failed, timedOut: failed.aborted && deadline.isTimeout() ? true : undefined };
			}
			return executeRemoteCommand(client, spec, invocation, deadline);
		},

		open(invocation: SshChannelInvocation): SshProcessChannel {
			const channel = new Ssh2ProcessChannel();
			let spec: ParsedInvocation;
			try {
				spec = parseInvocationArgv(invocation.argv);
			} catch (error) {
				channel.fail(errorMessage(error));
				return channel;
			}
			const session = sessionFor(spec.target);
			session
				.ensureReady(spec)
				.then((client) => channel.attach(client, spec, invocation))
				.catch((error: unknown) => channel.fail(errorMessage(error)));
			return channel;
		},

		invalidate(target: string): void {
			const session = sessions.get(target);
			if (session === undefined) return;
			sessions.delete(target);
			session.dispose();
		},

		dispose(): void {
			for (const session of sessions.values()) session.dispose();
			sessions.clear();
		},
	};
}

function isParsedInvocation(spec: ParsedInvocation | SshProcessResult): spec is ParsedInvocation {
	return typeof (spec as ParsedInvocation).target === "string";
}

/**
 * 单台目标主机的会话：一条已认证的 `Client` + 它名下的本地转发监听。
 * `ensureReady` 失败后清掉 promise，下次调用重新解析并重试——连接被远端或网络掐断
 * 后下一次操作自然重连，与 ControlMaster 重建的语义对齐。
 */
class Ssh2Session {
	private client: Client | undefined;
	private readyPromise: Promise<Client> | undefined;
	private readonly forwards = new Map<number, Server>();
	private establishRound = 0;
	private invalidated = false;

	constructor(
		private readonly target: string,
		private readonly options: Ssh2ProcessRunnerOptions,
	) {}

	/**
	 * `budgetMs` 是发起建立的调用方给本次建连的剩余预算（含等用户答提示的时间）。
	 * readyPromise 被并发调用共享，预算以第一个触发建立的调用方为准。
	 */
	ensureReady(spec: ParsedInvocation, budgetMs?: number): Promise<Client> {
		if (this.client !== undefined) return Promise.resolve(this.client);
		this.readyPromise ??= this.establish(spec, budgetMs).finally(() => {
			this.readyPromise = undefined;
		});
		return this.readyPromise;
	}

	async addForward(client: Client, localPort: number, remotePort: number): Promise<void> {
		if (this.forwards.has(localPort)) {
			throw new Error(`Local port ${localPort} already forwarded.`);
		}
		const server = createServer((socket) => {
			client.forwardOut("127.0.0.1", socket.remotePort ?? 0, "127.0.0.1", remotePort, (err, channel) => {
				if (err) {
					socket.destroy();
					return;
				}
				socket.pipe(channel).pipe(socket);
				socket.on("error", () => channel.close());
				channel.on("error", () => socket.destroy());
			});
		});
		await new Promise<void>((resolve, reject) => {
			server.once("error", reject);
			server.listen(localPort, "127.0.0.1", () => {
				server.off("error", reject);
				resolve();
			});
		});
		this.forwards.set(localPort, server);
	}

	cancelForward(localPort: number): boolean {
		const server = this.forwards.get(localPort);
		if (server === undefined) return false;
		server.close();
		this.forwards.delete(localPort);
		return true;
	}

	dispose(): void {
		this.invalidated = true;
		this.dropClient();
		for (const server of this.forwards.values()) server.close();
		this.forwards.clear();
	}

	/** 已装进会话的 Client 由 `installClient` 挂的常驻 `error` 监听兜底，销毁不必再补。 */
	private dropClient(): void {
		this.client?.destroy();
		this.client = undefined;
	}

	/** 会话内 Client 的 `error` 一律记成这一行；常驻监听与销毁前的终止性监听共用同一形状。 */
	private logClientError(error: Error): void {
		this.options.logger?.(`ssh2 ${this.target}: ${error.message}`);
	}

	/**
	 * 销毁一个没装进会话（因此拿不到常驻 `error` 监听）的 Client：失败的握手尝试、跳机
	 * 链路、以及失效会话里迟到完成的握手。
	 *
	 * ssh2 在 socket 关闭时，若「连上了但没握手完成」会补发一次 `error`（BUG-0117 的
	 * `Connection lost before handshake`），而握手期的 `once('ready')`/`once('error')`
	 * 在 `tryConnect` 成功或失败的那一刻就已经被摘掉。此时直接销毁就是一次无人监听的
	 * `error`：它从 socket 事件里抛出，冒成进程级 `uncaughtException`，把真正的失败原因
	 * 挤掉。先在销毁前挂终止性监听，把迟到事件收敛成一行日志——`ready`/`error` 的一次性
	 * 监听、换方法顺序与上抛语义都不动。监听必须永久（不能用 `once`）：空窗之后可能不止
	 * 一个迟到 `error`，吸收掉第一个就摘监听会把下一个重新放出去。
	 */
	private destroyQuietly(client: Client): void {
		client.on("error", (error: Error) => this.logClientError(error));
		client.destroy();
	}

	private async establish(spec: ParsedInvocation, budgetMs: number | undefined): Promise<Client> {
		const host = this.options.resolveHost(this.target) ?? syntheticHost(this.target, spec);
		const round = ++this.establishRound;
		const resolved = await resolveSshTarget(host, this.options.runConfigQuery);
		if (resolved.proxyCommand !== undefined) {
			throw new Error(
				`SSH host ${host.label} uses ProxyCommand (${resolved.proxyCommand}), which the in-process transport does not support yet.`,
			);
		}
		// 主机密钥的裁决在一次建立内缓存：重试下一个认证方法会再握一次手，不该因此再问一遍。
		const keyVerdicts = new Map<string, boolean>();
		const verifyKey = async (info: Ssh2HostKeyInfo): Promise<boolean> => {
			const cached = keyVerdicts.get(info.keyBase64);
			if (cached !== undefined) return cached;
			const ok = this.options.verifyHostKey === undefined ? false : await this.options.verifyHostKey(info);
			keyVerdicts.set(info.keyBase64, ok);
			return ok;
		};

		// ProxyJump 链：每一跳自身也是一次完整认证连接，下一跳经前一跳的 forwardOut 走。
		// 跳机的提示以它自己的规格为名——密码存的是跳机的凭据，不该记到目标主机头上。
		const jumpClients: Client[] = [];
		try {
			let sock: ClientChannel | undefined;
			for (const hop of resolved.proxyHops) {
				const hopHost: SshHost = {
					id: `jump:${hop.username}@${hop.hostname}:${hop.port}`,
					label: `${hop.username}@${hop.hostname}`,
					target: hop.hostname,
					source: "manual",
				};
				const jumpClient = await this.connectWithAuth(hop, hopHost, sock, verifyKey, round, budgetMs);
				jumpClients.push(jumpClient);
				sock = await forwardOutThrough(jumpClient, resolved.hostname, resolved.port);
			}
			const client = await this.connectWithAuth(resolved, host, sock, verifyKey, round, budgetMs);
			this.installClient(client, jumpClients);
			return client;
		} catch (error) {
			for (const jump of jumpClients) this.destroyQuietly(jump);
			throw error;
		}
	}

	private installClient(client: Client, jumpClients: Client[]): void {
		if (this.invalidated) {
			// 会话已失效：迟到完成的握手不能把旧 Client 装回来，直接拆掉并让等待方失败。
			this.destroyQuietly(client);
			for (const jump of jumpClients) this.destroyQuietly(jump);
			throw new Error(`SSH session for ${this.target} was invalidated during connect.`);
		}
		this.client = client;
		client.on("close", () => {
			if (this.client === client) {
				this.client = undefined;
				for (const jump of jumpClients) this.destroyQuietly(jump);
				// 连接没了，本地转发的上游也没了：收掉监听，避免外部打到死端口。
				for (const server of this.forwards.values()) server.close();
				this.forwards.clear();
			}
		});
		client.on("error", (error: Error) => this.logClientError(error));
	}

	private async connectWithAuth(
		resolved: ResolvedSshTarget,
		host: SshHost,
		sock: ClientChannel | undefined,
		verifyKey: (info: Ssh2HostKeyInfo) => Promise<boolean>,
		round: number,
		budgetMs: number | undefined,
	): Promise<Client> {
		let lastError: unknown;
		let attempted = false;
		for await (const partial of this.authAttemptConfigs(resolved, host, round)) {
			attempted = true;
			try {
				return await this.tryConnect(resolved, host, partial, sock, verifyKey, round, budgetMs);
			} catch (error) {
				lastError = error;
				if (isAgentError(error)) {
					// 代理进程未跑或管道/套接字不可达——与 OpenSSH 一致静默换下一方法，
					// 不能让 agent 缺席把私钥、口令等后续认证一并打死。
					this.options.logger?.(`ssh2 ${resolved.hostname}: agent unavailable, trying next method`);
					continue;
				}
				if (!isAuthFailure(error)) throw error;
				this.options.logger?.(`ssh2 ${resolved.hostname}: auth attempt failed, trying next method`);
			}
		}
		if (!attempted) {
			throw new Error(
				`No usable SSH authentication method for ${host.label} (no agent, no readable identity file, no prompt bridge).`,
			);
		}
		throw lastError instanceof Error ? lastError : new Error(String(lastError));
	}

	/** 依次产出候选认证配置；口令在公钥全部失败后才提示（与 OpenSSH 尝试顺序一致）。 */
	private async *authAttemptConfigs(
		resolved: ResolvedSshTarget,
		host: SshHost,
		round: number,
	): AsyncGenerator<Partial<ConnectConfig>> {
		const { agentPath, readFile: readFileImpl = readFile, askSecret } = this.options;
		if (agentPath !== undefined) {
			yield { agent: agentPath };
		}
		for (const identityFile of resolved.identityFiles) {
			let pem: Buffer;
			try {
				pem = await readFileImpl(identityFile);
			} catch {
				this.options.logger?.(`ssh2 ${resolved.hostname}: cannot read identity file ${identityFile}`);
				continue;
			}
			let passphrase: string | undefined;
			const parseError = ssh2.utils.parseKey(pem);
			if (parseError instanceof Error) {
				// 只有加密错误才问口令——文件本身坏掉时弹口令窗只会误导用户。
				if (!/passphrase|encrypt/i.test(parseError.message)) {
					this.options.logger?.(
						`ssh2 ${resolved.hostname}: identity file ${identityFile} unreadable (${parseError.message})`,
					);
					continue;
				}
				if (askSecret === undefined) {
					this.options.logger?.(
						`ssh2 ${resolved.hostname}: identity file ${identityFile} unreadable or encrypted`,
					);
					continue;
				}
				passphrase = await askSecret({
					hostId: host.id,
					kind: "passphrase",
					prompt: `Enter passphrase for key '${identityFile}':`,
					round,
				});
				if (passphrase === undefined) continue; // 用户取消——换下一个方法，不算连接失败
				if (ssh2.utils.parseKey(pem, passphrase) instanceof Error) {
					this.options.logger?.(`ssh2 ${resolved.hostname}: identity file ${identityFile} rejected passphrase`);
					continue;
				}
			}
			yield passphrase === undefined ? { privateKey: pem } : { privateKey: pem, passphrase };
		}
		if (askSecret !== undefined) {
			for (let attempt = 0; attempt < MAX_PASSWORD_ATTEMPTS; attempt += 1) {
				const password = await askSecret({
					hostId: host.id,
					kind: "password",
					prompt: `${resolved.username}@${resolved.hostname}'s password:`,
					round,
				});
				if (password === undefined) return; // 用户取消
				yield { password };
			}
		}
	}

	private async tryConnect(
		resolved: ResolvedSshTarget,
		host: SshHost,
		partial: Partial<ConnectConfig>,
		sock: ClientChannel | undefined,
		verifyKey: (info: Ssh2HostKeyInfo) => Promise<boolean>,
		round: number,
		budgetMs: number | undefined,
	): Promise<Client> {
		const client = (this.options.makeClient ?? (() => new ssh2.Client()))();
		const { askSecret } = this.options;
		const config: ConnectConfig = {
			host: resolved.hostname,
			port: resolved.port,
			username: resolved.username,
			tryKeyboard: askSecret !== undefined,
			// readyTimeout 覆盖整个握手，等用户答指纹/口令/2FA 提示的时间都在里面，
			// 预算取调用方给本次操作的 deadline——ConnectTimeout 只管 TCP 建连，
			// 用它卡握手会让任何需要交互的新主机在 15 秒内必然失败（BUG-0057）。
			readyTimeout: budgetMs ?? DEFAULT_ESTABLISH_TIMEOUT_MS,
			keepaliveInterval: 30_000,
			keepaliveCountMax: 6,
			...(sock === undefined ? {} : { sock }),
			...partial,
			hostVerifier: (key: Buffer, verify: (ok: boolean) => void) => {
				const info: Ssh2HostKeyInfo = {
					hostId: host.id,
					hostname: resolved.hostname,
					port: resolved.port,
					keyType: readWireKeyType(key),
					keyBase64: key.toString("base64"),
					fingerprint: formatHostKeyFingerprint(key),
				};
				verifyKey(info).then(
					(ok) => verify(ok),
					() => verify(false),
				);
			},
		};
		if (askSecret !== undefined) {
			client.on("keyboard-interactive", (_name, _instructions, _lang, prompts, finish) => {
				void (async () => {
					const answers: string[] = [];
					for (const prompt of prompts) {
						// 密码形态的回退提示用本次尝试已获得的口令回答——OpenSSH 同样把同一个
						// 密码喂给 password 与 keyboard-interactive 两种方法。再走一遍 askSecret
						// 会命中宿主「同轮只用一次存档」的守卫，把刚记住的凭据当成错的删掉，
						// 并让用户在同一次连接里答两遍密码框（BUG-0057）。
						if (partial.password !== undefined && classifySshPrompt(prompt.prompt) === "password") {
							answers.push(partial.password);
							continue;
						}
						answers.push(
							(await askSecret({
								hostId: host.id,
								kind: "keyboard-interactive",
								prompt: prompt.prompt,
								round,
							})) ?? "",
						);
					}
					finish(answers);
				})();
			});
		}
		try {
			await new Promise<void>((resolve, reject) => {
				const cleanup = (): void => {
					client.off("ready", onReady);
					client.off("error", onError);
				};
				const onReady = (): void => {
					cleanup();
					resolve();
				};
				const onError = (error: Error): void => {
					cleanup();
					reject(error);
				};
				client.once("ready", onReady);
				client.once("error", onError);
				client.connect(config);
			});
		} catch (error) {
			this.destroyQuietly(client);
			throw error;
		}
		return client;
	}
}

/**
 * `SshProcessChannel`：exec 完成前把 write/end/kill 排队，channel 到达后补回放——
 * 调用方拿到的句柄永远是同步返回的。
 */
class Ssh2ProcessChannel implements SshProcessChannel {
	private stream: ClientChannel | undefined;
	private pendingWrites: Uint8Array[] = [];
	private endRequested = false;
	private killed = false;
	private readonly stderrChunks: Buffer[] = [];
	private readonly resolveExited: (result: { exitCode: number | null; stderr: string }) => void;
	readonly exited: Promise<{ exitCode: number | null; stderr: string }>;

	constructor() {
		let resolve!: (result: { exitCode: number | null; stderr: string }) => void;
		this.exited = new Promise((res) => {
			resolve = res;
		});
		this.resolveExited = resolve;
	}

	attach(client: Client, spec: ParsedInvocation, invocation: SshChannelInvocation): void {
		if (this.killed) {
			this.finish(null);
			return;
		}
		const execOptions = spec.requestTty ? { pty: { term: "xterm-256color", cols: 80, rows: 24 } } : {};
		client.exec(spec.remoteCommand ?? "", execOptions, (error, stream) => {
			if (error) {
				this.fail(errorMessage(error));
				return;
			}
			this.stream = stream;
			let exitCode: number | null = null;
			stream.on("data", (chunk: Buffer) => invocation.onStdout(chunk));
			stream.stderr.on("data", (chunk: Buffer) => keepTail(this.stderrChunks, chunk, STDERR_TAIL_BYTES));
			stream.once("exit", (code: number | null) => {
				exitCode = code;
			});
			stream.once("close", () => this.finish(exitCode));
			stream.on("error", () => stream.close());
			for (const chunk of this.pendingWrites) stream.write(chunk);
			this.pendingWrites = [];
			if (this.endRequested) stream.end();
		});
	}

	/** 建连或 exec 失败：stderr 给原因，exitCode null——与 spawn 失败的语义一致。 */
	fail(stderr: string): void {
		this.resolveExited({ exitCode: null, stderr });
	}

	write(data: Uint8Array): void {
		if (this.stream === undefined) {
			if (!this.killed) this.pendingWrites.push(data);
			return;
		}
		this.stream.write(data);
	}

	/**
	 * 背压感知写：ssh2 的写回调在数据被 SSH 流量控制窗口放行后才兑现，正好是传输需要的
	 * pacing 信号。通道已死（kill、远端断开）时立即放行，`exited` 兜底防止回调永不触发
	 * 把上传挂死。
	 */
	writeAsync(data: Uint8Array): Promise<void> {
		if (this.stream === undefined) {
			if (!this.killed) this.pendingWrites.push(data);
			return Promise.resolve();
		}
		const stream = this.stream;
		return new Promise((resolve) => {
			let settled = false;
			const finish = (): void => {
				if (!settled) {
					settled = true;
					resolve();
				}
			};
			stream.write(data, finish);
			void this.exited.then(finish);
		});
	}

	end(): void {
		this.endRequested = true;
		this.stream?.end();
	}

	kill(): void {
		this.killed = true;
		this.pendingWrites = [];
		this.stream?.close();
		// 对端不立即回 close 也不能让 exited 悬挂：helper 的关停路径在等它。
		this.finish(null);
	}

	private finish(exitCode: number | null): void {
		this.resolveExited({ exitCode, stderr: Buffer.concat(this.stderrChunks).toString("utf8") });
	}
}

function executeRemoteCommand(
	client: Client,
	spec: ParsedInvocation,
	invocation: SshProcessInvocation,
	deadline: Deadline,
): Promise<SshProcessResult> {
	return new Promise((resolve) => {
		client.exec(spec.remoteCommand ?? "", spec.requestTty ? { pty: true } : {}, (error, stream) => {
			if (error) {
				resolve({
					exitCode: SSH_TRANSPORT_FAILURE_EXIT_CODE,
					stdout: new Uint8Array(),
					stderr: errorMessage(error),
					aborted: false,
				});
				return;
			}
			const stdoutChunks: Buffer[] = [];
			const stderrChunks: Buffer[] = [];
			let aborted = false;
			let exitCode: number | null = null;
			let exitSignal: string | undefined;
			let settled = false;

			const finish = (result: Omit<SshProcessResult, "aborted" | "timedOut">): void => {
				if (settled) return;
				settled = true;
				deadline.signal.removeEventListener("abort", onAbort);
				deadline.dispose();
				resolve({ ...result, aborted, timedOut: aborted && deadline.isTimeout() ? true : undefined });
			};
			const abort = (): void => {
				if (settled || aborted) return;
				aborted = true;
				stream.close();
				finish({
					exitCode: null,
					stdout: Buffer.concat(stdoutChunks),
					stderr: Buffer.concat(stderrChunks).toString("utf8"),
				});
			};
			const onAbort = (): void => abort();
			if (deadline.signal.aborted) {
				abort();
				return;
			}
			deadline.signal.addEventListener("abort", onAbort, { once: true });

			stream.on("data", (chunk: Buffer) => {
				if (invocation.onStdout) invocation.onStdout(chunk);
				else stdoutChunks.push(chunk);
			});
			stream.stderr.on("data", (chunk: Buffer) => {
				if (invocation.onStderr) {
					invocation.onStderr(chunk);
					keepTail(stderrChunks, chunk, STDERR_TAIL_BYTES);
				} else {
					stderrChunks.push(chunk);
				}
			});
			stream.once("exit", (code: number | null, signalName: string | undefined) => {
				exitCode = code;
				exitSignal = signalName;
			});
			stream.once("close", () => {
				finish({
					exitCode,
					stdout: Buffer.concat(stdoutChunks),
					stderr:
						Buffer.concat(stderrChunks).toString("utf8") +
						(exitSignal === undefined ? "" : `\nkilled by signal ${exitSignal}`),
				});
			});
			// 远端可能没读 stdin 就退出，此时写入报错不是本地错误：退出码与 stderr 会说明真相。
			stream.on("error", () => stream.close());
			if (invocation.stdin !== undefined) {
				stream.end(invocation.stdin);
			}
		});
	});
}

async function forwardOutThrough(jumpClient: Client, hostname: string, port: number): Promise<ClientChannel> {
	return new Promise((resolve, reject) => {
		jumpClient.forwardOut("127.0.0.1", 0, hostname, port, (error, channel) => {
			if (error) reject(error);
			else resolve(channel);
		});
	});
}

/**
 * argv 尾部解析：与 buildSshArgv / buildPortForwardArgv 的布局一致——`-o` 选项在前，
 * `--` 分隔，最后是 target 与远端命令。`-o`/`-p`/`-i`/`-L`/`-O` 都带值。
 */
export function parseInvocationArgv(argv: readonly string[]): ParsedInvocation {
	let target: string | undefined;
	let remoteCommand: string | undefined;
	let port: number | undefined;
	let identityFile: string | undefined;
	let connectTimeoutSeconds = DEFAULT_CONNECT_TIMEOUT_SECONDS;
	let requestTty = false;
	let forwardAction: "forward" | "cancel" | undefined;
	let forwardSpec: string | undefined;
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--") {
			target = argv[index + 1];
			const commandParts = argv.slice(index + 2);
			if (commandParts.length > 0) remoteCommand = commandParts.join(" ");
			break;
		}
		if (arg === "-tt" || arg === "-t" || arg === "-T") requestTty = arg !== "-T";
		else if (arg === "-O") {
			forwardAction = argv[index + 1] === "cancel" ? "cancel" : "forward";
			index += 1;
		} else if (arg === "-L") {
			forwardSpec = argv[index + 1];
			index += 1;
		} else if (arg === "-p") {
			const parsed = Number(argv[index + 1]);
			if (Number.isInteger(parsed)) port = parsed;
			index += 1;
		} else if (arg === "-i") {
			identityFile = argv[index + 1];
			index += 1;
		} else if (arg === "-o") {
			const option = argv[index + 1] ?? "";
			const eq = option.indexOf("=");
			if (eq > 0 && option.slice(0, eq).toLowerCase() === "connecttimeout") {
				const seconds = Number(option.slice(eq + 1));
				if (Number.isFinite(seconds) && seconds > 0) connectTimeoutSeconds = seconds;
			}
			index += 1;
		}
	}
	if (target === undefined) throw new Error(`ssh2 runner: argv missing target (${argv.join(" ")})`);
	let forward: ParsedInvocation["forward"];
	if (forwardAction !== undefined) {
		const match = /^(\d+):[^:]+:(\d+)$/.exec(forwardSpec ?? "");
		if (match === null) throw new Error(`ssh2 runner: cannot parse forward spec ${forwardSpec}`);
		forward = { action: forwardAction, localPort: Number(match[1]), remotePort: Number(match[2]) };
	}
	return {
		target,
		...(port === undefined ? {} : { port }),
		...(identityFile === undefined ? {} : { identityFile }),
		connectTimeoutSeconds,
		...(remoteCommand === undefined ? {} : { remoteCommand }),
		requestTty,
		...(forward === undefined ? {} : { forward }),
	};
}

function syntheticHost(target: string, spec: ParsedInvocation): SshHost {
	return {
		id: target,
		label: target,
		target,
		...(spec.port === undefined ? {} : { port: spec.port }),
		...(spec.identityFile === undefined ? {} : { identityFile: spec.identityFile }),
		source: "manual",
	};
}

interface Deadline {
	readonly signal: AbortSignal;
	readonly isTimeout: () => boolean;
	/** 距到点的剩余毫秒；调用方没给 timeoutMs 时为 undefined。 */
	readonly remainingMs: () => number | undefined;
	readonly dispose: () => void;
}

/** 把调用方的 signal 与 timeoutMs 折成一个 deadline：任一到点即视为整次操作中止。 */
function linkDeadline(signal: AbortSignal | undefined, timeoutMs: number | undefined): Deadline {
	const controller = new AbortController();
	const startedAt = Date.now();
	let timedOut = false;
	const onSignal = (): void => controller.abort();
	if (signal !== undefined) {
		if (signal.aborted) controller.abort();
		else signal.addEventListener("abort", onSignal, { once: true });
	}
	const timer =
		timeoutMs === undefined || timeoutMs <= 0
			? undefined
			: setTimeout(() => {
					timedOut = true;
					controller.abort();
				}, timeoutMs);
	timer?.unref?.();
	return {
		signal: controller.signal,
		isTimeout: () => timedOut,
		remainingMs: () => {
			if (timeoutMs === undefined || timeoutMs <= 0) return undefined;
			const elapsed = Date.now() - startedAt;
			// Sub-millisecond setup must not shorten the caller budget by 1ms.
			return Math.max(1, timeoutMs - (elapsed < 1 ? 0 : elapsed));
		},
		dispose: () => {
			if (timer !== undefined) clearTimeout(timer);
			signal?.removeEventListener("abort", onSignal);
		},
	};
}

function raceAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
	if (signal === undefined) return promise;
	return new Promise<T>((resolve, reject) => {
		const onAbort = (): void => reject(new Error("Aborted."));
		signal.addEventListener("abort", onAbort, { once: true });
		promise.then(
			(value) => {
				signal.removeEventListener("abort", onAbort);
				resolve(value);
			},
			(error: unknown) => {
				signal.removeEventListener("abort", onAbort);
				reject(error instanceof Error ? error : new Error(String(error)));
			},
		);
	});
}

function isAuthFailure(error: unknown): boolean {
	return error instanceof Error && (error as Error & { level?: string }).level === "client-authentication";
}

/** ssh2 在 agent 连接失败或签名中途失败时给错误标 `level: "agent"`，不是服务端拒绝认证。 */
function isAgentError(error: unknown): boolean {
	return error instanceof Error && (error as Error & { level?: string }).level === "agent";
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function keepTail(chunks: Buffer[], chunk: Buffer, limitBytes: number): void {
	chunks.push(chunk);
	let total = 0;
	for (const item of chunks) total += item.byteLength;
	while (chunks.length > 1 && total - chunks[0].byteLength >= limitBytes) {
		total -= chunks[0].byteLength;
		chunks.shift();
	}
}

/** SSH wire 公钥 blob 的第一个字段是算法名；读不出来就标 unknown，按 base64 比对不受影响。 */
function readWireKeyType(blob: Buffer): string {
	if (blob.length < 4) return "unknown";
	const length = blob.readUInt32BE(0);
	if (length <= 0 || 4 + length > blob.length) return "unknown";
	return blob.subarray(4, 4 + length).toString("ascii");
}
