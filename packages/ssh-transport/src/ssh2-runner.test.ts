// Copyright The Open Forge contributors.
import { EventEmitter } from "node:events";
import { connect as netConnect } from "node:net";
import { Duplex, PassThrough } from "node:stream";
import type { Client, ClientChannel, ConnectConfig, HostVerifier } from "ssh2";
import { describe, expect, it, vi } from "vitest";
import type { SshHost } from "./ssh-host.js";
import {
	createSsh2ProcessRunner,
	parseInvocationArgv,
	type Ssh2HostKeyInfo,
	type Ssh2ProcessRunnerOptions,
	type Ssh2SecretRequest,
} from "./ssh2-runner.js";

/**
 * 伪 `Client`：connect/exec/forwardOut 由测试编排，事件用 EventEmitter 驱动。
 * 它不假装自己是 SSH——被测的是 runner 的复用、回退、中止与 argv 语义；协议本身由
 * ssh2-runner.loopback.test.ts 用真实 Server 兜底。
 */
class FakeChannel extends Duplex {
	readonly stderr = new PassThrough();
	readonly written: Buffer[] = [];

	constructor(private readonly onWrite?: (chunk: Buffer) => void) {
		super();
	}

	_read(): void {}

	_write(chunk: Buffer, _encoding: BufferEncoding, callback: () => void): void {
		this.written.push(Buffer.from(chunk));
		this.onWrite?.(chunk);
		callback();
	}

	/** 模拟远端给出响应并退出：先数据、再 exit、最后 close——和真实 channel 同序。 */
	respond(stdout: string | Buffer, exitCode = 0, stderr = ""): void {
		if (typeof stdout === "string" ? stdout.length > 0 : stdout.byteLength > 0) this.push(stdout);
		if (stderr.length > 0) this.stderr.write(stderr);
		this.push(null);
		queueMicrotask(() => {
			this.emit("exit", exitCode);
			this.emit("close");
		});
	}

	close(): void {
		this.push(null);
		queueMicrotask(() => this.emit("close"));
	}

	setWindow(): void {}
}

class FakeClient extends EventEmitter {
	readonly connectConfigs: ConnectConfig[] = [];
	readonly channels: FakeChannel[] = [];
	private forwardHandler?: (dstPort: number) => FakeChannel;

	constructor(private readonly connectError?: Error & { level?: string }) {
		super();
	}

	connect(config: ConnectConfig): void {
		this.connectConfigs.push(config);
		// 与真实握手同序：先问 hostVerifier，再放行或拒绝。
		queueMicrotask(() => {
			const keyBlob = Buffer.from("\0\0\0\x0bssh-ed25519fake-key", "latin1");
			const verifier = config.hostVerifier as HostVerifier | undefined;
			verifier?.(keyBlob, (accepted) => {
				if (!accepted) {
					this.emitError(new Error("Host denied (verification failed)"));
					return;
				}
				if (this.connectError !== undefined) this.emitError(this.connectError);
				else this.emit("ready");
			});
		});
	}

	private emitError(error: Error): void {
		if (this.listenerCount("error") === 0) this.on("error", () => {});
		this.emit("error", error);
	}

	exec(_command: string, optionsOrCallback: unknown, maybeCallback?: unknown): void {
		const callback = (typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback) as (
			error: Error | undefined,
			channel: ClientChannel,
		) => void;
		const channel = new FakeChannel();
		this.channels.push(channel);
		queueMicrotask(() => callback(undefined, channel as unknown as ClientChannel));
	}

	lastChannel(): FakeChannel | undefined {
		return this.channels[this.channels.length - 1];
	}

	onForward(handler: (dstPort: number) => FakeChannel): void {
		this.forwardHandler = handler;
	}

	forwardOut(
		_srcIP: string,
		_srcPort: number,
		_dstIP: string,
		dstPort: number,
		callback: (error: Error | undefined, channel: ClientChannel) => void,
	): void {
		const channel = this.forwardHandler?.(dstPort);
		queueMicrotask(() => {
			if (channel === undefined) callback(new Error("forwardOut refused"), undefined as unknown as ClientChannel);
			else callback(undefined, channel as unknown as ClientChannel);
		});
	}

	end(): void {
		this.emit("close");
	}

	destroy(): void {
		this.emit("close");
	}
}

const HOST: SshHost = {
	id: "host-1",
	label: "example",
	target: "ubuntu@203.0.113.10",
	identityFile: "/keys/win.pem",
	source: "manual",
};

const argv = (...command: string[]): string[] => [
	"-o",
	"ControlMaster=auto",
	"-o",
	"ControlPath=/tmp/cp",
	"-o",
	"ControlPersist=600",
	"-o",
	"ConnectTimeout=15",
	"-p",
	"22",
	"-i",
	"/keys/win.pem",
	"-T",
	"--",
	HOST.target,
	...command,
];

const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

function authError(): Error & { level: string } {
	const error = new Error("All configured authentication methods failed") as Error & { level: string };
	error.level = "client-authentication";
	return error;
}

function runnerWith(clients: FakeClient[], overrides: Partial<Ssh2ProcessRunnerOptions> = {}) {
	const secrets: Ssh2SecretRequest[] = [];
	const { askSecret: customAsk, ...rest } = overrides;
	const runner = createSsh2ProcessRunner({
		resolveHost: (target) => (target === HOST.target ? HOST : undefined),
		runConfigQuery: async () => {
			throw new Error("no ssh binary");
		},
		readFile: async () => Buffer.from("FAKE-PEM"),
		askSecret: async (request) => {
			secrets.push(request);
			return customAsk === undefined ? "hunter2" : customAsk(request);
		},
		verifyHostKey: async () => true,
		makeClient: () => clients.shift() as unknown as Client,
		...rest,
	});
	return { runner, secrets };
}

describe("ssh2 传输：命令执行", () => {
	it("exec 通道的 stdout/stderr/退出码回到 SshProcessResult", async () => {
		const client = new FakeClient();
		const { runner } = runnerWith([client]);
		const pending = runner.run({ argv: argv("uname -s") });
		await vi.waitFor(() => expect(client.lastChannel()).toBeDefined());
		client.lastChannel()?.respond("Linux\n", 0, "warn");
		const result = await pending;
		expect(result).toMatchObject({ exitCode: 0, stderr: "warn" });
		expect(decode(result.stdout)).toBe("Linux\n");
	});

	it("同一台主机的多条命令复用同一条已认证连接", async () => {
		const client = new FakeClient();
		const { runner } = runnerWith([client]);
		const first = runner.run({ argv: argv("cmd1") });
		const second = runner.run({ argv: argv("cmd2") });
		await vi.waitFor(() => expect(client.channels).toHaveLength(2));
		client.channels[0]?.respond("a");
		client.channels[1]?.respond("b");
		await Promise.all([first, second]);
		expect(client.connectConfigs).toHaveLength(1);
	});

	it("stdin 内容经 channel 送给远端并关 stdin", async () => {
		const client = new FakeClient();
		const { runner } = runnerWith([client]);
		const pending = runner.run({ argv: argv("base64 -d > /tmp/f"), stdin: new TextEncoder().encode("bytes") });
		await vi.waitFor(() => expect(client.lastChannel()).toBeDefined());
		client.lastChannel()?.respond("");
		await pending;
		expect(Buffer.concat(client.lastChannel()?.written ?? []).toString()).toBe("bytes");
	});

	it("流式 stdout 走回调且结果不再留存一份", async () => {
		const client = new FakeClient();
		const { runner } = runnerWith([client]);
		const chunks: string[] = [];
		const pending = runner.run({ argv: argv("tail -f log"), onStdout: (chunk) => chunks.push(decode(chunk)) });
		await vi.waitFor(() => expect(client.lastChannel()).toBeDefined());
		client.lastChannel()?.push("line1\n");
		client.lastChannel()?.push("line2\n");
		client.lastChannel()?.respond("", 0);
		const result = await pending;
		expect(chunks.join("")).toBe("line1\nline2\n");
		expect(result.stdout.byteLength).toBe(0);
	});
});

describe("ssh2 传输：连接建立", () => {
	it("公钥方法失败后退回口令提示，成功后照常执行", async () => {
		const rejected = new FakeClient(authError());
		const accepted = new FakeClient();
		const { runner, secrets } = runnerWith([rejected, accepted], {
			readFile: async () => {
				throw new Error("ENOENT");
			},
		});
		const pending = runner.run({ argv: argv("id") });
		await vi.waitFor(() => expect(secrets.length).toBeGreaterThanOrEqual(1));
		expect(secrets[0]).toMatchObject({ kind: "password", hostId: "host-1" });
		await vi.waitFor(() => expect(accepted.lastChannel()).toBeDefined());
		accepted.lastChannel()?.respond("uid=1000");
		await expect(pending).resolves.toMatchObject({ exitCode: 0 });
		// 第一次口令尝试被拒后再问一次——与 OpenSSH 一轮最多三次提示同构。
		expect(secrets).toHaveLength(2);
		expect(accepted.connectConfigs[0]?.password).toBe("hunter2");
	});

	it("ssh-agent 未运行时跳过代理方法，私钥照常认证", async () => {
		// Windows 上 agent 管道不存在时 ssh2 报 level="agent"——不是服务端拒认证，
		// 必须像 OpenSSH 一样静默降级，否则私钥认证永远不会被尝试。
		const agentError = new Error("Invalid cygwin unix socket path") as Error & { level: string };
		agentError.level = "agent";
		const agentFail = new FakeClient(agentError);
		const keyOk = new FakeClient();
		const { runner } = runnerWith([agentFail, keyOk], {
			agentPath: "\\\\.\\pipe\\openssh-ssh-agent",
		});
		const pending = runner.run({ argv: argv("id") });
		await vi.waitFor(() => expect(keyOk.lastChannel()).toBeDefined());
		keyOk.lastChannel()?.respond("uid=1000");
		await expect(pending).resolves.toMatchObject({ exitCode: 0 });
		expect(agentFail.connectConfigs[0]?.agent).toBe("\\\\.\\pipe\\openssh-ssh-agent");
		// FAKE-PEM 不是真 key，解析失败后落到口令——关键是 agent 报错没把链路打死。
		expect(keyOk.connectConfigs[0]?.password).toBe("hunter2");
		expect(keyOk.connectConfigs[0]?.agent).toBeUndefined();
	});

	it("用户取消口令提示：如实报传输失败而不是挂着", async () => {
		const { runner, secrets } = runnerWith([new FakeClient()], {
			readFile: async () => {
				throw new Error("ENOENT");
			},
			askSecret: async () => undefined,
		});
		const result = await runner.run({ argv: argv("id") });
		expect(result.exitCode).toBe(255);
		expect(secrets).toHaveLength(1);
	});

	it("主机密钥被拒绝 → 传输失败 255，错误透到 stderr", async () => {
		const client = new FakeClient();
		const { runner } = runnerWith([client], { verifyHostKey: async () => false });
		const result = await runner.run({ argv: argv("id") });
		expect(result.exitCode).toBe(255);
		expect(result.stderr).toContain("verification failed");
	});

	it("verifyHostKey 拿到 wire blob 还原的指纹、算法名与目标", async () => {
		const client = new FakeClient();
		const keys: Ssh2HostKeyInfo[] = [];
		const { runner } = runnerWith([client], {
			verifyHostKey: async (info) => {
				keys.push(info);
				return true;
			},
		});
		const pending = runner.run({ argv: argv("id") });
		await vi.waitFor(() => expect(client.lastChannel()).toBeDefined());
		client.lastChannel()?.respond("x");
		await pending;
		expect(keys).toHaveLength(1);
		expect(keys[0]?.keyType).toBe("ssh-ed25519");
		expect(keys[0]?.fingerprint).toMatch(/^SHA256:/);
		expect(keys[0]?.hostname).toBe("203.0.113.10");
	});

	it("握手预算取调用方 deadline：交互提示不被 ConnectTimeout 掐断（BUG-0057）", async () => {
		const client = new FakeClient();
		const { runner } = runnerWith([client]);
		const pending = runner.run({ argv: argv("id"), timeoutMs: 240_000 });
		await vi.waitFor(() => expect(client.lastChannel()).toBeDefined());
		// argv 里 ConnectTimeout=15；新主机的指纹确认、KI 提示都在握手内等用户输入，
		// 预算必须来自调用方 deadline（首命令 4 分钟），不能是 15 秒。
		expect(client.connectConfigs[0]?.readyTimeout).toBe(240_000);
		client.lastChannel()?.respond("x");
		await pending;
	});

	it("无调用方 deadline 时握手预算仍有足够交互余量", async () => {
		const client = new FakeClient();
		const { runner } = runnerWith([client]);
		const pending = runner.run({ argv: argv("id") });
		await vi.waitFor(() => expect(client.lastChannel()).toBeDefined());
		expect(client.connectConfigs[0]?.readyTimeout).toBeGreaterThanOrEqual(60_000);
		client.lastChannel()?.respond("x");
		await pending;
	});

	it("连接被远端掐掉后，下一条命令自动重新认证", async () => {
		const first = new FakeClient();
		const second = new FakeClient();
		const { runner } = runnerWith([first, second]);
		const pending1 = runner.run({ argv: argv("id") });
		await vi.waitFor(() => expect(first.lastChannel()).toBeDefined());
		first.lastChannel()?.respond("a");
		await pending1;
		first.emit("close");
		const pending2 = runner.run({ argv: argv("id") });
		await vi.waitFor(() => expect(second.lastChannel()).toBeDefined());
		second.lastChannel()?.respond("b");
		await expect(pending2).resolves.toMatchObject({ exitCode: 0 });
		expect(second.connectConfigs).toHaveLength(1);
	});
});

describe("ssh2 传输：取消与超时", () => {
	it("信号中止：channel 被关掉，结果 aborted 而不是失败", async () => {
		const client = new FakeClient();
		const { runner } = runnerWith([client]);
		const controller = new AbortController();
		const pending = runner.run({ argv: argv("sleep 100"), signal: controller.signal });
		await vi.waitFor(() => expect(client.lastChannel()).toBeDefined());
		controller.abort();
		await expect(pending).resolves.toMatchObject({ aborted: true, exitCode: null });
	});

	it("timeoutMs 到点：aborted + timedOut", async () => {
		const client = new FakeClient();
		const { runner } = runnerWith([client]);
		const pending = runner.run({ argv: argv("sleep 100"), timeoutMs: 30 });
		await vi.waitFor(() => expect(client.lastChannel()).toBeDefined());
		await expect(pending).resolves.toMatchObject({ aborted: true, timedOut: true });
	});

	it("已中止的信号立即返回 aborted，不发起连接", async () => {
		const { runner } = runnerWith([new FakeClient()]);
		const controller = new AbortController();
		controller.abort();
		const result = await runner.run({ argv: argv("id"), signal: controller.signal });
		expect(result.aborted).toBe(true);
	});
});

describe("ssh2 传输：常驻通道与端口转发", () => {
	it("open 的写与远端输出走双向 channel，远端退出经 exited 兑现", async () => {
		const client = new FakeClient();
		const { runner } = runnerWith([client]);
		const received: string[] = [];
		const channel = runner.open?.({ argv: argv("helper"), onStdout: (chunk) => received.push(decode(chunk)) });
		expect(channel).toBeDefined();
		channel?.write(new TextEncoder().encode("hello"));
		channel?.end();
		await vi.waitFor(() => expect(client.lastChannel()).toBeDefined());
		expect(Buffer.concat(client.lastChannel()?.written ?? []).toString()).toBe("hello");
		client.lastChannel()?.respond("world", 0);
		await expect(channel?.exited).resolves.toMatchObject({ exitCode: 0 });
		expect(received.join("")).toBe("world");
	});

	it("open 后立刻 kill：exited 兑现 exitCode null，不悬挂", async () => {
		const client = new FakeClient();
		const { runner } = runnerWith([client]);
		const channel = runner.open?.({ argv: argv("helper"), onStdout: () => {} });
		channel?.kill();
		await expect(channel?.exited).resolves.toMatchObject({ exitCode: null });
	});

	it("-O forward 建本地监听并把字节经 forwardOut 打到远端", async () => {
		const client = new FakeClient();
		const echo = new FakeChannel((chunk) => {
			echo.push(`echo:${chunk.toString()}`);
		});
		client.onForward(() => echo);
		const { runner } = runnerWith([client]);
		const forwardArgv = [
			"-o",
			"ControlPath=/tmp/cp",
			"-O",
			"forward",
			"-L",
			"18223:127.0.0.1:8022",
			"--",
			HOST.target,
		];
		await expect(runner.run({ argv: forwardArgv })).resolves.toMatchObject({ exitCode: 0 });
		const reply = await new Promise<string>((resolve, reject) => {
			const socket = netConnect(18223, "127.0.0.1", () => socket.write("ping"));
			socket.on("data", (chunk) => {
				resolve(chunk.toString());
				socket.destroy();
			});
			socket.on("error", reject);
			setTimeout(() => reject(new Error("no reply")), 3000).unref();
		});
		expect(reply).toBe("echo:ping");
		runner.dispose();
	});

	it("-O cancel 撤掉已有转发；没有对应转发时如实失败", async () => {
		const client = new FakeClient();
		client.onForward(() => new FakeChannel());
		const { runner } = runnerWith([client]);
		const mkArgv = (action: string, port: number) => [
			"-o",
			"ControlPath=/tmp/cp",
			"-O",
			action,
			"-L",
			`${port}:127.0.0.1:8022`,
			"--",
			HOST.target,
		];
		await runner.run({ argv: mkArgv("forward", 18224) });
		await expect(runner.run({ argv: mkArgv("cancel", 18224) })).resolves.toMatchObject({ exitCode: 0 });
		await expect(runner.run({ argv: mkArgv("cancel", 18224) })).resolves.toMatchObject({ exitCode: 255 });
		runner.dispose();
	});
});

/** 握手被闸门挡住的 FakeClient：测试控制 ready 的时机，模拟「失效时还在握手中」。 */
class GatedClient extends FakeClient {
	private releaseHandshake: (() => void) | undefined;
	private notifyStarted: (() => void) | undefined;
	/** connect 已被调用（握手真正在途）后兑现。 */
	readonly started = new Promise<void>((resolve) => {
		this.notifyStarted = resolve;
	});

	connect(config: ConnectConfig): void {
		this.notifyStarted?.();
		const gate = new Promise<void>((resolve) => {
			this.releaseHandshake = resolve;
		});
		void gate.then(() => super.connect(config));
	}

	release(): void {
		this.releaseHandshake?.();
	}
}

describe("ssh2 传输：会话失效", () => {
	it("invalidate 销毁旧 Client，同 target 下一条命令重新建连", async () => {
		const first = new FakeClient();
		const second = new FakeClient();
		const { runner } = runnerWith([first, second]);
		const initial = runner.run({ argv: argv("cmd1") });
		await vi.waitFor(() => expect(first.channels).toHaveLength(1));
		first.lastChannel()?.respond("ok", 0);
		await initial;
		const firstClosed = new Promise<void>((resolve) => first.once("close", resolve));
		runner.invalidate(HOST.target);
		await firstClosed;
		const next = runner.run({ argv: argv("cmd2") });
		await vi.waitFor(() => expect(second.channels).toHaveLength(1));
		second.lastChannel()?.respond("ok2", 0);
		await next;
	});

	it("失效时在途的握手完成后不得把旧 Client 装回来", async () => {
		const gated = new GatedClient();
		const fresh = new FakeClient();
		const { runner } = runnerWith([gated, fresh]);
		const pending = runner.run({ argv: argv("cmd1") });
		await gated.started;
		runner.invalidate(HOST.target);
		const gatedClosed = new Promise<void>((resolve) => gated.once("close", resolve));
		gated.release();
		const result = await pending;
		expect(result.exitCode).toBe(255);
		await gatedClosed;
		const next = runner.run({ argv: argv("cmd2") });
		await vi.waitFor(() => expect(fresh.channels).toHaveLength(1));
		fresh.lastChannel()?.respond("ok", 0);
		await next;
	});

	it("未建过会话的 target invalidate 是无害的 no-op", () => {
		const { runner } = runnerWith([]);
		expect(() => runner.invalidate("never-seen@host")).not.toThrow();
	});
});

describe("argv 解析", () => {
	it("提取 target、远端命令、tty 与连接超时", () => {
		const spec = parseInvocationArgv([
			"-o",
			"ControlPath=/tmp/cp",
			"-o",
			"ConnectTimeout=7",
			"-tt",
			"--",
			"u@h",
			"stty",
			"rows",
			"40",
		]);
		expect(spec).toMatchObject({
			target: "u@h",
			remoteCommand: "stty rows 40",
			requestTty: true,
			connectTimeoutSeconds: 7,
		});
	});

	it("转发 argv 拆出 action 与端口对", () => {
		const spec = parseInvocationArgv([
			"-o",
			"ControlPath=/tmp/cp",
			"-O",
			"cancel",
			"-L",
			"9000:127.0.0.1:80",
			"--",
			"u@h",
		]);
		expect(spec.forward).toEqual({ action: "cancel", localPort: 9000, remotePort: 80 });
	});

	it("缺 target 直接报错而不是空跑", () => {
		expect(() => parseInvocationArgv(["-o", "ConnectTimeout=5"])).toThrow(/missing target/);
	});
});
