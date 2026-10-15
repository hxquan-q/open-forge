// Copyright The Open Forge contributors.
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it as baseIt, describe, expect } from "vitest";
import { SshRemoteCommandError } from "./errors.js";
import type { SshConnection } from "./ssh-connection.js";
import { buildSshHelperForTests, createLoopbackSshConnection, toLoopbackRemotePath } from "./testing.js";

const isWindows = process.platform === "win32";

/** 「远端」路径统一走正斜杠：Windows 回环里 MSYS 工具的输出分隔符随输入走。 */
function remote(...segments: string[]): string {
	return toLoopbackRemotePath(join(...segments));
}

/** 本机临时目录（原生形式，供 node fs 用）；远端侧统一经 remote() 转 MSYS 根形式。 */
function createRemoteDirectory(): string {
	return realpathSync(mkdtempSync(join(tmpdir(), "vetta-remote-")));
}

/** 建符号链接；无权限（Windows 默认策略）时返回 false，由专门的用例显式报告而不是整文件跳过。 */
function trySymlink(target: string, path: string): boolean {
	try {
		symlinkSync(target, path);
		return true;
	} catch {
		return false;
	}
}

const helperBinary = isWindows ? undefined : buildSshHelperForTests();

/**
 * 同一组行为在两条路上各跑一遍：每次操作新起一个 ssh 进程的 `ssh exec`，以及经远端 helper
 * 的常驻通道。调用方不该分得出区别——helper 只是更快，不是另一套语义。
 *
 * helper 只面向 linux/darwin 远端（`resolveSshHelperTarget`），Windows 回环的「远端」是
 * MINGW uname，不构成受支持的 helper 目标——这条路径在 Windows 显式跳过，由 POSIX CI
 * 与 helper 协议单测继续覆盖。
 */
const modes: { name: string; skip: boolean; connect: () => Promise<SshConnection> }[] = [
	{ name: "ssh exec", skip: false, connect: async () => createLoopbackSshConnection() },
	{
		name: "远端 helper",
		skip: !helperBinary,
		connect: async () => {
			const connection = createLoopbackSshConnection("loopback", { helper: { resolveBinary: () => helperBinary } });
			if (!(await connection.helper())) throw new Error("helper did not come up");
			return connection;
		},
	},
];

describe.each(modes)("SshConnection 的文件操作（回环 SSH，$name）", ({ skip, connect }) => {
	const it = skip ? baseIt.skip : baseIt;

	it("目录列举与 stat 给出同样形状的条目", async () => {
		const dir = createRemoteDirectory();
		mkdirSync(join(dir, "src"));
		writeFileSync(join(dir, "a.txt"), "hello");
		const connection = await connect();

		const entries = await connection.listDirectory(remote(dir));
		expect(entries.map((entry) => [entry.name, entry.kind]).sort()).toEqual([
			["a.txt", "file"],
			["src", "directory"],
		]);
		expect(entries.find((entry) => entry.name === "a.txt")).toMatchObject({ sizeBytes: 5 });
	});

	it("读一个不存在的文件是「远端答复了没有」，不是传输故障", async () => {
		const connection = await connect();
		await expect(connection.readFile(remote(createRemoteDirectory(), "missing.txt"))).rejects.toBeInstanceOf(
			SshRemoteCommandError,
		);
	});

	it("按范围读到的正是那一段字节，二进制内容不被改写", async () => {
		const dir = createRemoteDirectory();
		writeFileSync(join(dir, "data.bin"), Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 255, 0, 10]));
		const connection = await connect();

		expect([...(await connection.readFileRange(remote(dir, "data.bin"), 3, 5))]).toEqual([3, 4, 5, 6, 7]);
		expect([...(await connection.readFileRange(remote(dir, "data.bin"), 10, 100))]).toEqual([255, 0, 10]);
		expect([...(await connection.readFileHead(remote(dir, "data.bin"), 2))]).toEqual([0, 1]);
	});

	it("写、读、改名、删除一个带空格与引号的文件", async () => {
		const dir = createRemoteDirectory();
		const connection = await connect();
		const original = remote(dir, "it's a file.txt");

		await connection.writeFile(original, new TextEncoder().encode("hello"));
		expect(new TextDecoder().decode(await connection.readFile(original))).toBe("hello");

		await connection.rename(original, remote(dir, "renamed.txt"));
		expect(readFileSync(join(dir, "renamed.txt"), "utf8")).toBe("hello");
		await expect(connection.stat(original)).resolves.toBeNull();

		await connection.remove(remote(dir, "renamed.txt"));
		await expect(connection.stat(remote(dir, "renamed.txt"))).resolves.toBeNull();
		// 删一个不存在的路径不算失败，与本机 rm(force) 同义。
		await expect(connection.remove(remote(dir, "renamed.txt"))).resolves.toBeUndefined();
	});

	it("独占创建不覆盖已有文件；递归列举给出干净的相对路径", async () => {
		const dir = createRemoteDirectory();
		mkdirSync(join(dir, "src"));
		writeFileSync(join(dir, "src/a.ts"), "keep");
		const connection = await connect();

		await expect(connection.createEntry(remote(dir, "src/a.ts"), "file")).resolves.toBe("exists");
		await expect(connection.createEntry(remote(dir, "src/b.ts"), "file")).resolves.toBe("created");
		expect(readFileSync(join(dir, "src/a.ts"), "utf8")).toBe("keep");
		const files = await connection.listFilesRecursive(remote(dir), { ignoredDirectoryNames: [], limit: 100 });
		expect(files.sort()).toEqual(["src/a.ts", "src/b.ts"]);
	});

	it("拒绝删除远端根目录", async () => {
		await expect((await connect()).remove("/")).rejects.toThrow(/root directory/);
	});
});

describe.each(modes)("SshConnection 的符号链接（回环 SSH，$name）", ({ skip, connect }) => {
	// 符号链接单独成组：Windows 默认策略不允许无特权建链接时，这里显式报告并跳过该组，
	// 不拖累也不冒充其余核心文件操作的覆盖。
	const it = skip ? baseIt.skip : baseIt;

	it("可选跟随符号链接，realPath 解到目标", async () => {
		const dir = createRemoteDirectory();
		writeFileSync(join(dir, "a.txt"), "hello");
		if (!trySymlink(join(dir, "a.txt"), join(dir, "link.txt"))) {
			throw new Error(
				"本机无符号链接权限：符号链接用例未执行（其余核心文件操作不受影响），需要开发者模式或以管理员运行。",
			);
		}
		const connection = await connect();

		const entries = await connection.listDirectory(remote(dir));
		expect(entries.find((entry) => entry.name === "link.txt")).toMatchObject({ kind: "symlink" });
		await expect(connection.stat(remote(dir, "link.txt"))).resolves.toMatchObject({
			name: "link.txt",
			kind: "symlink",
		});
		await expect(
			connection.stat(remote(dir, "link.txt"), undefined, { followSymlinks: true }),
		).resolves.toMatchObject({
			kind: "file",
		});
		// POSIX：符号链接解析与目标文件的字面路径一致。Windows 回环：MSYS readlink 经
		// 符号链接会规范到挂载表形式（如 /tmp/…），与 Windows 输入形式不同构——这是
		// 夹具镜头差异，不是产品合同；断言解析确实发生且指向同名目标，字符串形式不作合同。
		const resolvedLink = await connection.realPath(remote(dir, "link.txt"));
		if (isWindows) {
			expect(resolvedLink.endsWith("/a.txt")).toBe(true);
			expect(resolvedLink).not.toBe(remote(dir, "link.txt"));
		} else {
			await expect(resolvedLink).toBe(await connection.realPath(remote(dir, "a.txt")));
		}
		await expect(connection.realPath(remote(dir, "missing"))).resolves.toBe(remote(dir, "missing"));
	});
});

/**
 * 端口扫描只能在真实的机器上验证：用哪个工具、输出长什么样，都由那台机器决定。回环夹具把
 * 「远端」指向本机，于是这里起一个真的监听端口，再看扫描能不能认出它——测的是命令与解析
 * 在这个平台上确实对得上，而不是我们拼出了预期的字符串。
 *
 * Windows 回环的「远端」没有 `ss`/GNU `netstat`/`lsof`，输出形状对不上就是错的答案：
 * 该用例只在 POSIX 上执行，Windows 的监听端口行为由 POSIX CI 覆盖。
 */
describe("列出远端正在监听的端口（回环 SSH）", () => {
	const it = isWindows ? baseIt.skip : baseIt;
	it("认出一个刚起的监听端口并带上启动时间，sshd 的 22 只标成敏感", async () => {
		const server = createServer();
		const port = await new Promise<number>((resolve, reject) => {
			server.once("error", reject);
			server.listen(0, "127.0.0.1", () => {
				const address = server.address();
				if (address && typeof address === "object") resolve(address.port);
				else reject(new Error("no port"));
			});
		});
		try {
			const scan = await createLoopbackSshConnection().listListeningPorts();
			expect(scan.tool).not.toBe("none");
			const ports = scan.ports.map((entry) => entry.port);
			expect(ports).toContain(port);
			for (const entry of scan.ports) if (entry.port === 22) expect(entry.sensitive).toBe(true);
			const mine = scan.ports.find((entry) => entry.port === port);
			expect(mine?.sensitive).toBe(false);
			// 这个监听者就是测试进程自己：它的启动时间必然早于现在。
			if (mine?.pid) expect(mine.startedAt).toBeLessThanOrEqual(Date.now());
			// 端口号升序是界面直接用的顺序，不能只保证集合正确。
			expect(ports).toEqual([...ports].sort((a, b) => a - b));
		} finally {
			await new Promise<void>((resolve) => server.close(() => resolve()));
		}
	});
});
