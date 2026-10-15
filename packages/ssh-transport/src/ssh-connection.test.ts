// Modified by The Open Forge contributors.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { SshOperationAbortedError, SshRemoteCommandError, SshTransportError } from "./errors.js";
import type { SshHelperClient } from "./helper-client.js";
import { connectSshHelper } from "./helper-deployment.js";
import type {
	SshChannelInvocation,
	SshProcessInvocation,
	SshProcessResult,
	SshProcessRunner,
} from "./process-runner.js";
import { buildKillCommand, buildRemoteCommand, buildWriteFileCommand } from "./remote-command.js";
import { SshConnection } from "./ssh-connection.js";
import type { SshHost } from "./ssh-host.js";

vi.mock("./helper-deployment.js", () => ({ connectSshHelper: vi.fn() }));

const host: SshHost = { id: "build-01", label: "构建机", target: "build", source: "manual" };

function encode(text: string): Uint8Array {
	return new TextEncoder().encode(text);
}

function ok(stdout: string): SshProcessResult {
	return { exitCode: 0, stdout: encode(stdout), stderr: "", aborted: false };
}

/** 按远端命令内容依次应答，并记录每次调用，便于断言真正发出去的是什么。 */
function createRunner(reply: (remoteCommand: string) => SshProcessResult): {
	runner: SshProcessRunner;
	calls: SshProcessInvocation[];
} {
	const calls: SshProcessInvocation[] = [];
	const runner: SshProcessRunner = {
		run: async (invocation) => {
			calls.push(invocation);
			return reply(String(invocation.argv[invocation.argv.length - 1]));
		},
	};
	return { runner, calls };
}

function connect(reply: (remoteCommand: string) => SshProcessResult) {
	const { runner, calls } = createRunner(reply);
	return { connection: new SshConnection(host, { runner, controlPath: "/tmp/cp" }), calls };
}

/**
 * 一问一答 + 一条测试掌控的通道：注入 stdout 块与退出结局，传输失败分类不必起真进程。
 * `onKill` 模拟「杀进程 → 进程死 → exited 兑现」的真实因果；不给就保持悬挂，
 * 由用例自己决定要不要收尾。
 */
function connectChannel(options: {
	exited: Promise<{ exitCode: number | null; stderr: string }>;
	stdout?: Uint8Array[];
	writeAsync?: (data: Uint8Array) => Promise<void>;
	onKill?: () => void;
}) {
	const calls: SshChannelInvocation[] = [];
	const writes: Uint8Array[] = [];
	const state = { ended: false, killed: false };
	const runner: SshProcessRunner = {
		run: async () => ok("Linux\nx86_64\n"),
		open: (invocation) => {
			calls.push(invocation);
			for (const chunk of options.stdout ?? []) invocation.onStdout(chunk);
			const channel = {
				write: (data: Uint8Array) => {
					writes.push(data);
				},
				end: () => {
					state.ended = true;
				},
				kill: () => {
					state.killed = true;
					options.onKill?.();
				},
				exited: options.exited,
			};
			return options.writeAsync === undefined ? channel : { ...channel, writeAsync: options.writeAsync };
		},
	};
	return {
		connection: new SshConnection(host, { runner, controlPath: "/tmp/cp" }),
		calls,
		writes,
		state,
	};
}

describe("远端平台探测", () => {
	it("Linux 用 GNU stat，macOS 用 BSD stat", async () => {
		const linux = connect(() => ok("Linux\nx86_64\n"));
		await expect(linux.connection.probePlatform()).resolves.toMatchObject({
			os: "Linux",
			arch: "x86_64",
			statFlavor: "gnu",
		});

		const mac = connect(() => ok("Darwin\narm64\n"));
		await expect(mac.connection.probePlatform()).resolves.toMatchObject({ statFlavor: "bsd" });
	});

	it("结果缓存，不会每次操作都多一次往返", async () => {
		const { connection, calls } = connect(() => ok("Linux\nx86_64\n"));
		await connection.probePlatform();
		await connection.probePlatform();
		expect(calls).toHaveLength(1);
	});
});

describe("远端文件读写", () => {
	it("读文件走原始字节，不经登录 shell——profile 的输出会混进文件内容", async () => {
		const { connection, calls } = connect(() => ok("file body"));
		await expect(connection.readFile("/srv/a.txt")).resolves.toEqual(encode("file body"));
		const remoteCommand = String(calls[0].argv[calls[0].argv.length - 1]);
		expect(remoteCommand).toBe("cat -- '/srv/a.txt'");
		expect(remoteCommand).not.toContain("SHELL");
	});

	it("写文件先写同目录临时文件再 mv，内容走 stdin 而不是命令行", async () => {
		const { connection, calls } = connect(() => ok(""));
		await connection.writeFile("/srv/a.txt", encode("hello"));
		const remoteCommand = String(calls[0].argv[calls[0].argv.length - 1]);
		expect(remoteCommand).toBe(
			buildWriteFileCommand("/srv/a.txt", remoteCommand.match(/\.vetta-tmp-[a-z0-9]+/)?.[0] ?? ""),
		);
		expect(calls[0].stdin).toEqual(encode("hello"));
	});

	it("读一个不存在的文件，报的是远端命令失败而不是传输故障", async () => {
		const { connection } = connect(() => ({
			exitCode: 1,
			stdout: new Uint8Array(),
			stderr: "cat: /srv/x: No such file or directory",
			aborted: false,
		}));
		await expect(connection.readFile("/srv/x")).rejects.toBeInstanceOf(SshRemoteCommandError);
	});
});

describe("流式文件传输（通道失败分类）", () => {
	const resolved = (exitCode: number | null, stderr = ""): Promise<{ exitCode: number | null; stderr: string }> =>
		Promise.resolve({ exitCode, stderr });

	it("下载把 stdout 逐块交给 writeChunk 并累计字节数", async () => {
		const { connection } = connectChannel({
			exited: resolved(0),
			stdout: [encode("hello "), encode("world")],
		});
		const chunks: Uint8Array[] = [];
		await expect(connection.downloadFile("/srv/a.bin", (chunk) => chunks.push(chunk))).resolves.toEqual({
			bytes: 11,
		});
		expect(chunks).toEqual([encode("hello "), encode("world")]);
	});

	it("下载退出非零：远端答复，报 exited", async () => {
		const { connection } = connectChannel({ exited: resolved(1, "cat: permission denied") });
		await expect(connection.downloadFile("/srv/a.bin", () => {})).rejects.toBeInstanceOf(SshRemoteCommandError);
	});

	it("下载退出码 null：问不到结果，报 unverifiable", async () => {
		const { connection } = connectChannel({ exited: resolved(null) });
		await expect(connection.downloadFile("/srv/a.bin", () => {})).rejects.toBeInstanceOf(SshTransportError);
	});

	it("上传无 writeAsync 的通道退化为同步 write", async () => {
		const { connection, writes, state } = connectChannel({ exited: resolved(0) });
		await expect(
			connection.uploadFile("/srv/a.bin", {
				totalBytes: 5,
				readChunk: async () => encode("hello"),
			}),
		).resolves.toEqual({ bytes: 5 });
		expect(writes).toEqual([encode("hello")]);
		expect(state.ended).toBe(true);
	});

	it("上传走 writeAsync 时按块等背压", async () => {
		const asyncWrites: Uint8Array[] = [];
		const { connection, writes, state } = connectChannel({
			exited: resolved(0),
			writeAsync: async (data) => {
				asyncWrites.push(data);
			},
		});
		await expect(
			connection.uploadFile("/srv/a.bin", {
				totalBytes: 10,
				readChunk: async (offset) => encode(offset === 0 ? "aaaaa" : "bbbbb"),
			}),
		).resolves.toEqual({ bytes: 10 });
		expect(asyncWrites).toEqual([encode("aaaaa"), encode("bbbbb")]);
		expect(writes).toEqual([]);
		expect(state.ended).toBe(true);
	});

	it("上传退出非零：wc 校验拒绝，报 exited", async () => {
		const { connection } = connectChannel({ exited: resolved(1, "wc mismatch") });
		await expect(
			connection.uploadFile("/srv/a.bin", { totalBytes: 4, readChunk: async () => encode("abcd") }),
		).rejects.toBeInstanceOf(SshRemoteCommandError);
	});

	it("上传退出码 null：报 unverifiable", async () => {
		const { connection } = connectChannel({ exited: resolved(null) });
		await expect(
			connection.uploadFile("/srv/a.bin", { totalBytes: 4, readChunk: async () => encode("abcd") }),
		).rejects.toBeInstanceOf(SshTransportError);
	});

	it("readChunk 抛错：异常上抛且通道被杀", async () => {
		const boom = new Error("disk on fire");
		const { connection, state } = connectChannel({
			exited: new Promise(() => {}),
			onKill: () => {},
		});
		await expect(
			connection.uploadFile("/srv/a.bin", {
				totalBytes: 4,
				readChunk: async () => {
					throw boom;
				},
			}),
		).rejects.toBe(boom);
		expect(state.killed).toBe(true);
	});

	it("上传中途取消：通道被杀并报取消（unverifiable）", async () => {
		let resolveExited!: (value: { exitCode: number | null; stderr: string }) => void;
		const { connection, state } = connectChannel({
			exited: new Promise((resolve) => {
				resolveExited = resolve;
			}),
			// 杀掉通道 = 进程死 = exited 兑现，与真实因果一致。
			onKill: () => resolveExited({ exitCode: null, stderr: "" }),
		});
		const controller = new AbortController();
		const pending = connection.uploadFile("/srv/a.bin", {
			totalBytes: 100,
			signal: controller.signal,
			readChunk: async (offset) => {
				if (offset > 0) controller.abort();
				return encode("chunk");
			},
		});
		await expect(pending).rejects.toBeInstanceOf(SshOperationAbortedError);
		expect(state.killed).toBe(true);
	});

	it("只支持一问一答的 runner 打不开传输通道：如实报传输通道不可用", async () => {
		const { connection } = connect(() => ok("Linux\nx86_64\n"));
		await expect(connection.downloadFile("/srv/a.bin", () => {})).rejects.toThrow("cannot open a transfer channel");
		await expect(
			connection.uploadFile("/srv/a.bin", { totalBytes: 4, readChunk: async () => encode("abcd") }),
		).rejects.toThrow("cannot open a transfer channel");
	});

	it("上传字节数声明不合法直接拒绝", async () => {
		const { connection } = connect(() => ok("Linux\nx86_64\n"));
		await expect(
			connection.uploadFile("/srv/a.bin", { totalBytes: -1, readChunk: async () => new Uint8Array() }),
		).rejects.toThrow("Invalid upload size");
	});
});

describe("目录列举", () => {
	it("解析出类型、大小与修改时间，并去掉 find 的 ./ 前缀", async () => {
		const { connection } = connect((remoteCommand) =>
			remoteCommand.includes("uname")
				? ok("Linux\nx86_64\n")
				: ok("directory\t4096\t1700000000\t./src\nregular file\t12\t1700000001\t./a b.txt\n"),
		);
		await expect(connection.listDirectory("/srv")).resolves.toEqual([
			{ name: "src", kind: "directory", sizeBytes: 4096, modifiedAtSeconds: 1700000000 },
			{ name: "a b.txt", kind: "file", sizeBytes: 12, modifiedAtSeconds: 1700000001 },
		]);
	});

	it("路径不存在时 stat 返回 null——这是远端给出的答复", async () => {
		const { connection } = connect((remoteCommand) =>
			remoteCommand.includes("uname") ? ok("Linux\nx86_64\n") : ok(""),
		);
		await expect(connection.stat("/srv/missing")).resolves.toBeNull();
	});
});

describe("失败分类（ADR-0124 执行边界）", () => {
	it("ssh 退出 255 判为传输故障，判定是 unverifiable 而不是 exited", async () => {
		const { connection } = connect(() => ({
			exitCode: 255,
			stdout: new Uint8Array(),
			stderr: "ssh: connect to host build port 22: Connection refused",
			aborted: false,
		}));
		const error = await connection.readFile("/srv/a").catch((e: unknown) => e);
		expect(error).toBeInstanceOf(SshTransportError);
		expect((error as SshTransportError).verdict).toBe("unverifiable");
	});

	it("取消同样是 unverifiable：远端可能已经执行完了", async () => {
		const { connection } = connect(() => ({
			exitCode: null,
			stdout: new Uint8Array(),
			stderr: "",
			aborted: true,
		}));
		const error = await connection.exec("make").catch((e: unknown) => e);
		expect(error).toBeInstanceOf(SshOperationAbortedError);
		expect((error as SshOperationAbortedError).verdict).toBe("unverifiable");
	});

	it("超时与取消分得开，调用方才能告诉模型「跑太久了」而不是「被取消了」", async () => {
		const { connection } = connect((remoteCommand) =>
			remoteCommand.includes("uname")
				? ok("Linux\nx86_64\n")
				: { exitCode: null, stdout: new Uint8Array(), stderr: "", aborted: true, timedOut: true },
		);
		const error = await connection.exec("make").catch((e: unknown) => e);
		expect((error as SshOperationAbortedError).reason).toBe("timeout");
	});

	it("取消的那一刻就去远端杀进程组，不等本地 ssh 自己退出", async () => {
		// 没有 pty，关通道不会让远端进程结束；而远端进程攥着 stdout 时，本地 ssh 也未必退得出来。
		const calls: SshProcessInvocation[] = [];
		const controller = new AbortController();
		const runner: SshProcessRunner = {
			run: (invocation) => {
				calls.push(invocation);
				const remoteCommand = String(invocation.argv[invocation.argv.length - 1]);
				if (remoteCommand.includes("uname")) return Promise.resolve(ok("Linux\nx86_64\n"));
				if (!remoteCommand.includes("npm run dev")) return Promise.resolve(ok(""));
				// 用户命令一直不结束，直到被掐断。
				return new Promise((resolve) => {
					invocation.signal?.addEventListener("abort", () =>
						resolve({ exitCode: null, stdout: new Uint8Array(), stderr: "", aborted: true }),
					);
				});
			},
		};
		const connection = new SshConnection(host, { runner, controlPath: "/tmp/cp" });

		const pending = connection.exec("npm run dev", { signal: controller.signal }).catch((e: unknown) => e);
		await vi.waitFor(() => expect(calls).toHaveLength(2));
		controller.abort();

		const error = await pending;
		expect(error).toBeInstanceOf(SshOperationAbortedError);
		expect((error as SshOperationAbortedError).reason).toBe("aborted");
		const commands = calls.map((call) => String(call.argv[call.argv.length - 1]));
		const token = commands[1].match(/vetta-exec-[0-9a-f]+/)?.[0] ?? "";
		expect(commands[2]).toBe(buildKillCommand(token));
	});

	it("超时由连接自己计时，到点同样先杀远端再报超时", async () => {
		const calls: string[] = [];
		const runner: SshProcessRunner = {
			run: (invocation) => {
				const remoteCommand = String(invocation.argv[invocation.argv.length - 1]);
				calls.push(remoteCommand);
				if (remoteCommand.includes("uname")) return Promise.resolve(ok("Linux\nx86_64\n"));
				if (!remoteCommand.includes("sleep 999")) return Promise.resolve(ok(""));
				return new Promise((resolve) => {
					invocation.signal?.addEventListener("abort", () =>
						resolve({ exitCode: null, stdout: new Uint8Array(), stderr: "", aborted: true }),
					);
				});
			},
		};
		const connection = new SshConnection(host, { runner, controlPath: "/tmp/cp" });

		const error = await connection.exec("sleep 999", { timeoutMs: 30 }).catch((e: unknown) => e);

		expect((error as SshOperationAbortedError).reason).toBe("timeout");
		expect(calls.some((command) => command.includes("kill -TERM"))).toBe(true);
	});

	it("本地 ssh 被外部杀掉时不报成功：远端命令的结局不可知", async () => {
		const { connection } = connect((remoteCommand) =>
			remoteCommand.includes("uname")
				? ok("Linux\nx86_64\n")
				: { exitCode: null, stdout: new Uint8Array(), stderr: "", aborted: false },
		);
		await expect(connection.exec("make")).rejects.toBeInstanceOf(SshTransportError);
	});

	it("命令返回非零是 exited——远端确实回答了", async () => {
		const { connection } = connect(() => ({
			exitCode: 2,
			stdout: new Uint8Array(),
			stderr: "boom",
			aborted: false,
		}));
		const error = await connection.makeDirectory("/srv/x").catch((e: unknown) => e);
		expect(error).toBeInstanceOf(SshRemoteCommandError);
		expect((error as SshRemoteCommandError).verdict).toBe("exited");
		expect((error as SshRemoteCommandError).exitCode).toBe(2);
	});
});

describe("用户命令执行", () => {
	it("先建立连接再跑命令：认证不能受调用方那条短超时的约束", async () => {
		// 口令、2FA 和指纹确认只发生在第一条命令上。若它跟着「这条命令该跑多久」的
		// 超时走，用户还在输密码时 ssh 就被杀了，表现为输完密码却提示连接失败。
		const { connection, calls } = connect((remoteCommand) =>
			remoteCommand.includes("uname") ? ok("Linux\nx86_64\n") : ok(""),
		);

		await connection.exec("npm test", { timeoutMs: 1_000 });

		expect(String(calls[0].argv[calls[0].argv.length - 1])).toContain("uname");
		expect(calls[0].timeoutMs).toBeGreaterThan(60_000);
	});

	it("带工作目录与流式输出，退出码原样返回而不抛", async () => {
		const onStdout = vi.fn();
		const { connection, calls } = connect((remoteCommand) =>
			// 第一条命令是建立连接的平台探测；用户命令才是被测的那一条。
			remoteCommand.includes("uname")
				? ok("Linux\nx86_64\n")
				: { exitCode: 1, stdout: encode("test failed"), stderr: "", aborted: false },
		);
		await expect(connection.exec("npm test", { cwd: "/srv/app", onStdout })).resolves.toMatchObject({
			exitCode: 1,
		});
		// 引用语义由 remote-command 的测试守住，这里只证明 cwd 确实被透传下去。
		const userCommand = calls.map((call) => String(call.argv[call.argv.length - 1])).at(-1);
		const processToken = userCommand?.match(/vetta-exec-[0-9a-f]+/)?.[0];
		expect(userCommand).toBe(buildRemoteCommand("npm test", { cwd: "/srv/app", processToken }));
	});
});

describe("远端端口与进程", () => {
	it("ssh exec 路径下多问一次 ps 补上启动时间，22 照样列出但标成敏感", async () => {
		const { connection, calls } = connect((command) => {
			if (command.startsWith("uname")) return ok("Linux\nx86_64\n");
			if (command.includes("@vetta-listeners")) {
				return ok(
					[
						"@vetta-listeners ss",
						'LISTEN 0 511 127.0.0.1:3000 0.0.0.0:* users:(("node",pid=1234,fd=23))',
						'LISTEN 0 128 0.0.0.0:22 0.0.0.0:* users:(("sshd",pid=800,fd=3))',
					].join("\n"),
				);
			}
			if (command.includes("ps -o pid=")) return ok("1234 00:10 node server.js\n");
			return ok("");
		});

		const scan = await connection.listListeningPorts();

		// 一次 ps 问完所有 pid，不按端口逐个往返。
		expect(calls.filter((call) => String(call.argv.at(-1)).includes("ps -o pid="))).toHaveLength(1);
		const app = scan.ports.find((port) => port.port === 3000);
		expect(app).toMatchObject({ command: "node server.js", sensitive: false });
		expect(app?.startedAt).toBeLessThanOrEqual(Date.now() - 10_000);
		expect(scan.ports.find((port) => port.port === 22)).toMatchObject({ sensitive: true, processName: "sshd" });
	});

	it("ps 失败只是少了时间，扫描本身照常返回", async () => {
		const { connection } = connect((command) => {
			if (command.startsWith("uname")) return ok("Linux\nx86_64\n");
			if (command.includes("@vetta-listeners")) {
				return ok('@vetta-listeners ss\nLISTEN 0 511 127.0.0.1:3000 0.0.0.0:* users:(("node",pid=1234,fd=23))\n');
			}
			return { exitCode: 127, stdout: encode(""), stderr: "ps: not found", aborted: false };
		});

		const scan = await connection.listListeningPorts();

		expect(scan.ports).toHaveLength(1);
		expect(scan.ports[0]).toMatchObject({ port: 3000, processName: "node", sensitive: false });
		expect(scan.ports[0]?.startedAt).toBeUndefined();
	});

	it("终止进程：退出、还活着、没权限三种结局分得开", async () => {
		const exited = connect(() => ok(""));
		await expect(exited.connection.terminateProcess(1234)).resolves.toEqual({ exited: true });
		expect(String(exited.calls[0].argv.at(-1))).toContain("kill -s TERM 1234");

		const alive = connect(() => ({ exitCode: 3, stdout: encode(""), stderr: "", aborted: false }));
		await expect(alive.connection.terminateProcess(1234, { force: true })).resolves.toEqual({ exited: false });
		expect(String(alive.calls[0].argv.at(-1))).toContain("kill -s KILL 1234");

		const denied = connect(() => ({
			exitCode: 1,
			stdout: encode(""),
			stderr: "kill: (800) - Operation not permitted",
			aborted: false,
		}));
		await expect(denied.connection.terminateProcess(800)).rejects.toThrow(/Operation not permitted/);
	});
});

function fakeHelper(): SshHelperClient {
	return {
		close: vi.fn(),
		isClosed: false,
		call: vi.fn(async () => ({})),
		on: vi.fn(() => () => {}),
		onClose: vi.fn(() => () => {}),
	} as unknown as SshHelperClient;
}

describe("连接失效清理", () => {
	beforeEach(() => {
		vi.mocked(connectSshHelper).mockReset();
	});

	it("dispose 关闭已就绪的 helper，并让执行器丢弃同 target 会话", async () => {
		const invalidated: string[] = [];
		const runner: SshProcessRunner = {
			run: async () => ok(""),
			invalidate: (target) => invalidated.push(target),
		};
		const connection = new SshConnection(host, {
			runner,
			controlPath: "/tmp/cp",
			helper: { resolveBinary: () => "/helper" },
		});
		const helper = fakeHelper();
		vi.mocked(connectSshHelper).mockResolvedValue({ status: "ready", client: helper });
		await expect(connection.helper()).resolves.toBe(helper);
		connection.dispose();
		expect(helper.close).toHaveBeenCalledTimes(1);
		expect(invalidated).toEqual([host.target]);
	});

	it("部署到一半的 helper 在 dispose 后完成时立即关闭", async () => {
		const runner: SshProcessRunner = { run: async () => ok("") };
		const connection = new SshConnection(host, {
			runner,
			controlPath: "/tmp/cp",
			helper: { resolveBinary: () => "/helper" },
		});
		let finishDeploy: (establishment: { status: "ready"; client: SshHelperClient }) => void = () => {};
		vi.mocked(connectSshHelper).mockImplementation(
			() =>
				new Promise((resolve) => {
					finishDeploy = resolve;
				}),
		);
		const pending = connection.helper();
		connection.dispose();
		const helper = fakeHelper();
		finishDeploy({ status: "ready", client: helper });
		await expect(pending).resolves.toBe(helper);
		await vi.waitFor(() => expect(helper.close).toHaveBeenCalledTimes(1));
	});

	it("dispose 后不再拉起新的 helper 部署", async () => {
		const runner: SshProcessRunner = { run: async () => ok("") };
		const connection = new SshConnection(host, {
			runner,
			controlPath: "/tmp/cp",
			helper: { resolveBinary: () => "/helper" },
		});
		connection.dispose();
		await expect(connection.helper()).resolves.toBeUndefined();
		expect(vi.mocked(connectSshHelper)).not.toHaveBeenCalled();
	});
});
