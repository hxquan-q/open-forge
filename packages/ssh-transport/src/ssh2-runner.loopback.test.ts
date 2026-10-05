// Copyright The Open Forge contributors.
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createServer as createTcpServer, connect as netConnect, type Server as TcpServer } from "node:net";
import { type Connection, Server, type Session, utils } from "ssh2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SshHost } from "./ssh-host.js";
import { createSsh2ProcessRunner, type Ssh2HostKeyInfo, type Ssh2ProcessRunner } from "./ssh2-runner.js";

/**
 * 真实协议的回环集成测试：ssh2.Server 起真 SSH 服务，runner 用真 Client 连。
 * fake client 只能证明「我们的编排对」，这里证明的是「协议栈上真的连得通、
 * 一条连接真的多路复用」——这是 OpenSSH 路径在 Windows 上死掉的地方（BUG-0049）。
 */

const PASSWORD = "s3cret-test";
const TARGET = "ubuntu@127.0.0.1";

let server: Server;
let serverPort: number;
let echoServer: TcpServer;
let echoPort: number;
let connections = 0;
const execLog: string[] = [];
const openConnections = new Set<Connection>();
const echoSockets = new Set<import("node:net").Socket>();
const runners: { dispose(): void }[] = [];

function serveSession(session: Session): void {
	session.on("exec", (accept, _reject, info) => {
		const stream = accept();
		execLog.push(info.command);
		if (info.command === "echo-stdin") {
			const chunks: Buffer[] = [];
			stream.on("data", (chunk: Buffer) => chunks.push(chunk));
			// 客户端 EOF 在服务侧体现为 readable 的 'end'（'eof' 只在另一路径触发）。
			stream.on("end", () => {
				stream.write(Buffer.concat(chunks));
				stream.exit(0);
				stream.end();
			});
			return;
		}
		if (info.command === "fail-42") {
			stream.stderr.write("boom");
			stream.exit(42);
			stream.end();
			return;
		}
		stream.write(`ran:${info.command}`);
		stream.exit(0);
		stream.end();
	});
}

beforeAll(async () => {
	const keys = utils.generateKeyPairSync("ed25519");
	server = new Server({ hostKeys: [Buffer.from(keys.private)] }, (client: Connection) => {
		connections += 1;
		openConnections.add(client);
		client.on("error", () => {});
		client.on("close", () => openConnections.delete(client));
		client.on("authentication", (ctx) => {
			if (ctx.method === "password" && ctx.password === PASSWORD) ctx.accept();
			else ctx.reject(["password"]);
		});
		client.on("ready", () => {
			client.on("session", (accept) => serveSession(accept()));
			client.on("tcpip", (accept, _reject, _info) => {
				const channel = accept();
				const upstream = netConnect(echoPort, "127.0.0.1", () => {
					upstream.pipe(channel).pipe(upstream);
				});
				upstream.on("error", () => channel.close());
			});
		});
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	serverPort = (server.address() as AddressInfo).port;

	echoServer = createTcpServer((socket) => {
		echoSockets.add(socket);
		socket.on("close", () => echoSockets.delete(socket));
		socket.on("data", (chunk) => socket.write(`pong:${chunk.toString()}`));
	});
	await new Promise<void>((resolve) => echoServer.listen(0, "127.0.0.1", resolve));
	echoPort = (echoServer.address() as AddressInfo).port;
});

afterAll(async () => {
	for (const runner of runners) runner.dispose();
	for (const client of openConnections) client.end();
	for (const socket of echoSockets) socket.destroy();
	server.close();
	echoServer.close();
	await Promise.race([
		Promise.all([once(server, "close"), once(echoServer, "close")]),
		new Promise((r) => setTimeout(r, 3000)),
	]);
});

const host: SshHost = {
	id: "loopback",
	label: "loopback",
	target: TARGET,
	source: "manual",
};

const argvFor = (...command: string[]): string[] => [
	"-o",
	"ControlMaster=auto",
	"-o",
	"ControlPath=/tmp/unused",
	"-o",
	"ConnectTimeout=10",
	"-T",
	"--",
	TARGET,
	...command,
];

const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

function makeRunner(
	port: number,
	hostKeys: Ssh2HostKeyInfo[] = [],
): { runner: Ssh2ProcessRunner; hostKeys: Ssh2HostKeyInfo[] } {
	const runner = createSsh2ProcessRunner({
		resolveHost: (target) => (target === TARGET ? { ...host, port } : undefined),
		// 没有系统 ssh 可问：手动 host 只需要 user@host + 端口，直解析就够。
		runConfigQuery: async () => {
			throw new Error("no ssh binary");
		},
		verifyHostKey: async (info) => {
			hostKeys.push(info);
			return true;
		},
		askSecret: async () => PASSWORD,
	});
	runners.push(runner);
	return { runner, hostKeys };
}

describe("ssh2 传输（真实 Server 回环）", () => {
	it("口令认证经提示桥完成，exec 命令拿到真实输出与退出码", async () => {
		const { runner } = makeRunner(serverPort);
		const result = await runner.run({ argv: argvFor("uname -a") });
		expect(result.exitCode).toBe(0);
		expect(decode(result.stdout)).toBe("ran:uname -a");
		runner.dispose();
	});

	it("一条已认证连接多路复用：多条命令共享一条连接", async () => {
		const { runner } = makeRunner(serverPort);
		const before = connections;
		await runner.run({ argv: argvFor("cmd-1") });
		const second = await runner.run({ argv: argvFor("cmd-2") });
		expect(second.exitCode).toBe(0);
		expect(connections).toBe(before + 1);
		expect(execLog).toContain("cmd-1");
		expect(execLog).toContain("cmd-2");
		runner.dispose();
	});

	it("invalidate 丢弃会话后，下一条命令重新建连而不是复用旧连接", async () => {
		const { runner } = makeRunner(serverPort);
		const before = connections;
		await runner.run({ argv: argvFor("pre-invalidate") });
		expect(connections).toBe(before + 1);
		runner.invalidate(TARGET);
		const after = await runner.run({ argv: argvFor("post-invalidate") });
		expect(after.exitCode).toBe(0);
		expect(connections).toBe(before + 2);
		runner.dispose();
	});

	it("非零退出码与 stderr 如实回来", async () => {
		const { runner } = makeRunner(serverPort);
		const result = await runner.run({ argv: argvFor("fail-42") });
		expect(result.exitCode).toBe(42);
		expect(result.stderr).toContain("boom");
		runner.dispose();
	});

	it("stdin 写进 channel：远端能读回字节", async () => {
		const { runner } = makeRunner(serverPort);
		const result = await runner.run({
			argv: argvFor("echo-stdin"),
			stdin: new TextEncoder().encode("payload-bytes"),
		});
		expect(result.exitCode).toBe(0);
		expect(decode(result.stdout)).toBe("payload-bytes");
		runner.dispose();
	});

	it("hostVerifier 看到真实服务端公钥（wire blob 还原出算法名与指纹）", async () => {
		const keys: Ssh2HostKeyInfo[] = [];
		const { runner } = makeRunner(serverPort, keys);
		await runner.run({ argv: argvFor("x") });
		expect(keys).toHaveLength(1);
		expect(keys[0]?.keyType).toBe("ssh-ed25519");
		expect(keys[0]?.fingerprint).toMatch(/^SHA256:/);
		expect(keys[0]?.port).toBe(serverPort);
		runner.dispose();
	});

	it("密钥被拒绝时连接不通：255 而不是悄悄放行", async () => {
		const runner = createSsh2ProcessRunner({
			resolveHost: () => ({ ...host, port: serverPort }),
			runConfigQuery: async () => {
				throw new Error("no ssh binary");
			},
			verifyHostKey: async () => false,
			askSecret: async () => PASSWORD,
		});
		const result = await runner.run({ argv: argvFor("x") });
		expect(result.exitCode).toBe(255);
		runner.dispose();
	});

	it("服务器只收 keyboard-interactive：当次已获口令直接回答，不重复询问（BUG-0057）", async () => {
		const keys = utils.generateKeyPairSync("ed25519");
		const kiServer = new Server({ hostKeys: [Buffer.from(keys.private)] }, (client: Connection) => {
			client.on("error", () => {});
			client.on("authentication", (ctx) => {
				if (ctx.method !== "keyboard-interactive") {
					ctx.reject(["keyboard-interactive"]);
					return;
				}
				ctx.prompt([{ prompt: "Password: ", echo: false }], (answers) => {
					if (answers[0] === PASSWORD) ctx.accept();
					else ctx.reject(["keyboard-interactive"]);
				});
			});
			client.on("ready", () => {
				client.on("session", (accept) => serveSession(accept()));
			});
		});
		await new Promise<void>((resolve) => kiServer.listen(0, "127.0.0.1", resolve));
		const kiPort = (kiServer.address() as AddressInfo).port;
		let asked = 0;
		const runner = createSsh2ProcessRunner({
			resolveHost: () => ({ ...host, port: kiPort }),
			runConfigQuery: async () => {
				throw new Error("no ssh binary");
			},
			verifyHostKey: async () => true,
			askSecret: async () => {
				asked += 1;
				return PASSWORD;
			},
		});
		try {
			const result = await runner.run({ argv: argvFor("id") });
			expect(result.exitCode).toBe(0);
			// password 尝试拿到的口令要复用于同次连接里的 KI 密码提示；再问一遍会把
			// 宿主「同轮只用一次存档」的守卫误触发成删档（见 BUG-0057）。
			expect(asked).toBe(1);
		} finally {
			runner.dispose();
			await new Promise<void>((resolve) => kiServer.close(() => resolve()));
		}
	});

	it("慢于 ConnectTimeout 的主机密钥确认仍能完成握手（BUG-0057）", async () => {
		const runner = createSsh2ProcessRunner({
			resolveHost: () => ({ ...host, port: serverPort }),
			runConfigQuery: async () => {
				throw new Error("no ssh binary");
			},
			verifyHostKey: async () => {
				await new Promise((resolve) => setTimeout(resolve, 1200));
				return true;
			},
			askSecret: async () => PASSWORD,
		});
		try {
			const result = await runner.run({
				argv: ["-o", "ConnectTimeout=1", "-T", "--", TARGET, "id"],
			});
			expect(result.exitCode).toBe(0);
		} finally {
			runner.dispose();
		}
	});

	it("口令错会回到提示桥再问一轮，用户取消则连不上", async () => {
		let asked = 0;
		const runner = createSsh2ProcessRunner({
			resolveHost: () => ({ ...host, port: serverPort }),
			runConfigQuery: async () => {
				throw new Error("no ssh binary");
			},
			verifyHostKey: async () => true,
			askSecret: async () => {
				asked += 1;
				return asked === 1 ? "wrong-password" : undefined; // 第二次取消
			},
		});
		const result = await runner.run({ argv: argvFor("x") });
		expect(result.exitCode).toBe(255);
		expect(asked).toBe(2);
		runner.dispose();
	});

	it("本地端口转发：TCP 字节经真实 SSH 通道到达远端再回来", async () => {
		const { runner } = makeRunner(serverPort);
		const localPort = 18311;
		const forwardArgv = [
			"-o",
			"ControlPath=/tmp/unused",
			"-O",
			"forward",
			"-L",
			`${localPort}:127.0.0.1:${echoPort}`,
			"--",
			TARGET,
		];
		await expect(runner.run({ argv: forwardArgv })).resolves.toMatchObject({ exitCode: 0 });
		const reply = await new Promise<string>((resolve, reject) => {
			const socket = netConnect(localPort, "127.0.0.1", () => socket.write("hello-forward"));
			socket.on("data", (chunk) => {
				resolve(chunk.toString());
				socket.destroy();
			});
			socket.on("error", reject);
			setTimeout(() => reject(new Error("forward reply timeout")), 5000).unref();
		});
		expect(reply).toBe("pong:hello-forward");
		// 撤掉转发后同端口不再应答
		const cancelArgv = [
			"-o",
			"ControlPath=/tmp/unused",
			"-O",
			"cancel",
			"-L",
			`${localPort}:127.0.0.1:${echoPort}`,
			"--",
			TARGET,
		];
		await expect(runner.run({ argv: cancelArgv })).resolves.toMatchObject({ exitCode: 0 });
		runner.dispose();
	});
});
