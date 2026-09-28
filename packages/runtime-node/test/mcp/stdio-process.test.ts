// Modified by The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { StdioMcpClient } from "../../src/mcp/transports/stdio/stdio-mcp-client.js";
import { StdioMcpProcess } from "../../src/mcp/transports/stdio/stdio-process.js";
import {
	getActiveStdioMcpProcessCount,
	sweepActiveStdioMcpProcesses,
} from "../../src/mcp/transports/stdio/stdio-process-registry.js";
import { shouldUseWindowsCommandShell } from "../../src/mcp/transports/stdio/stdio-shell.js";

describe("Windows MCP stdio process launch", () => {
	it("launches native executables directly so paths and argv bypass cmd.exe", () => {
		expect(shouldUseWindowsCommandShell("C:\\Program Files\\nodejs\\node.exe", "win32")).toBe(false);
		expect(shouldUseWindowsCommandShell("C:\\tools\\server.com", "win32")).toBe(false);
	});

	it("keeps cmd.exe resolution for Windows batch and PATH shims", () => {
		expect(shouldUseWindowsCommandShell("C:\\tools\\server.cmd", "win32")).toBe(true);
		expect(shouldUseWindowsCommandShell("npx", "win32")).toBe(true);
	});

	it("never inserts a shell on Unix platforms", () => {
		expect(shouldUseWindowsCommandShell("node", "linux")).toBe(false);
	});
});

describe("MCP stdio message bounds", () => {
	it("delivers newline-delimited messages below the cap", async () => {
		const server = new StdioMcpProcess({
			config: {
				type: "stdio",
				command: process.execPath,
				args: ["-e", 'process.stdout.write(JSON.stringify({ ok: true }) + "\\n")'],
			},
			name: "fixture",
			maxMessageBytes: 1024,
		});
		const messages: unknown[] = [];
		server.on("message", (message) => messages.push(message));
		await server.start();
		await waitForCondition(() => messages.length > 0, 5000);
		expect(messages[0]).toEqual({ ok: true });
		await server.stop();
	});

	it("fails and kills the server when a single message exceeds the byte cap", async () => {
		const server = new StdioMcpProcess({
			config: {
				type: "stdio",
				command: process.execPath,
				// 无换行的 4KB 输出：对任何 1KB 上限而言都是不可解析的超限消息。
				args: ["-e", 'process.stdout.write("y".repeat(4096))'],
			},
			name: "oversize",
			maxMessageBytes: 1024,
		});
		const errors: Error[] = [];
		server.on("error", (error) => errors.push(error));
		const exited = new Promise<void>((resolve) => {
			server.on("exit", () => resolve());
		});
		await server.start();
		await exited;
		expect(errors[0]?.message).toMatch(/exceeded 1024 bytes/);
	});

	it("rejects a non-positive maxMessageBytes at construction", () => {
		expect(
			() =>
				new StdioMcpProcess({
					config: { type: "stdio", command: "fixture" },
					name: "fixture",
					maxMessageBytes: 0,
				}),
		).toThrow(/positive integer/);
	});
});

describe("MCP stdio early-exit diagnostics", () => {
	it("pending initialize failure surfaces the process stderr tail", async () => {
		// npx 缓存损坏 / 命令不存在时 server 启动即死，死因只写在 stderr——
		// 拒绝 pending 请求时必须带上尾部片段，否则上层只看到无信息的 exit code。
		const client = new StdioMcpClient({
			name: "dies-on-boot",
			config: {
				command: process.execPath,
				args: ["-e", 'process.stderr.write("npm error ENOENT poisoned npx cache"); process.exit(1)'],
			},
		});
		await expect(
			client.initialize({
				protocolVersion: "2025-11-25",
				clientInfo: { name: "vetta-test", version: "1" },
			}),
		).rejects.toThrow(/poisoned npx cache/);
		await client.close();
	});
});

describe("MCP stdio process tree lifecycle", () => {
	// 真实子进程 + taskkill/进程组信号：机器繁忙时起停与退出事件都比单元测试慢，
	// 显式放宽 vitest 的默认 5s 上限；失败时 finally 兜底，避免泄漏拖垮后续用例。
	it("stop() kills the whole process tree, including grandchildren", { timeout: 30_000 }, async () => {
		const server = new StdioMcpProcess({
			config: {
				type: "stdio",
				command: process.execPath,
				args: ["-e", GRANDCHILD_SCRIPT],
			},
			name: "tree",
		});
		try {
			const pids = collectGrandchildPids(server);
			await server.start();
			const parentPid = server.getPid();
			if (parentPid === undefined) throw new Error("Missing stdio parent pid");
			const grandchildPid = await pids.next();
			expect(isProcessAlive(parentPid)).toBe(true);
			expect(isProcessAlive(grandchildPid)).toBe(true);

			await server.stop();
			await waitForCondition(() => !isProcessAlive(parentPid) && !isProcessAlive(grandchildPid), 10_000);
		} finally {
			await server.stop();
		}
	});

	it(
		"sweepActiveStdioMcpProcesses force-kills registered servers and unregisters them",
		{ timeout: 30_000 },
		async () => {
			const server = new StdioMcpProcess({
				config: {
					type: "stdio",
					command: process.execPath,
					args: ["-e", GRANDCHILD_SCRIPT],
				},
				name: "swept",
			});
			try {
				const pids = collectGrandchildPids(server);
				await server.start();
				const parentPid = server.getPid();
				if (parentPid === undefined) throw new Error("Missing stdio parent pid");
				const grandchildPid = await pids.next();
				const registered = getActiveStdioMcpProcessCount();
				expect(registered).toBeGreaterThan(0);

				await sweepActiveStdioMcpProcesses();
				await waitForCondition(() => !isProcessAlive(parentPid) && !isProcessAlive(grandchildPid), 10_000);
				await waitForCondition(() => getActiveStdioMcpProcessCount() === registered - 1, 10_000);
			} finally {
				await server.stop();
			}
		},
	);

	it("unregisters the child after a normal stop", { timeout: 30_000 }, async () => {
		const baseline = getActiveStdioMcpProcessCount();
		const server = new StdioMcpProcess({
			config: {
				type: "stdio",
				command: process.execPath,
				args: ["-e", "setInterval(() => undefined, 1000)"],
			},
			name: "short-lived",
		});
		try {
			await server.start();
			expect(getActiveStdioMcpProcessCount()).toBe(baseline + 1);
			await server.stop();
			expect(getActiveStdioMcpProcessCount()).toBe(baseline);
		} finally {
			await server.stop();
		}
	});
});

async function waitForCondition(condition: () => boolean, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!condition()) {
		if (Date.now() > deadline) throw new Error("Timed out waiting for stdio message");
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
}

/**
 * 父进程拉起一个长驻孙子进程并把其 pid 以 JSON 行上报——验证树杀时断言
 * 「父、孙一起死」的夹具脚本。stdio: ignore 让孙子不继承管道、脱离
 * stdout/stderr 生命周期，否则它会随父进程 stdin 关闭自然退出，测不出区别。
 */
const GRANDCHILD_SCRIPT = [
	'const { spawn } = require("node:child_process");',
	'const child = spawn(process.execPath, ["-e", "setInterval(() => undefined, 1000)"], { stdio: "ignore" });',
	'process.stdout.write(JSON.stringify({ grandchildPid: child.pid }) + "\\n");',
	"setInterval(() => undefined, 1000);",
].join(" ");

function collectGrandchildPids(server: StdioMcpProcess): { next(): Promise<number> } {
	const queue: number[] = [];
	const waiters: Array<(pid: number) => void> = [];
	server.on("message", (message) => {
		const pid = (message as { grandchildPid?: unknown }).grandchildPid;
		if (typeof pid !== "number") return;
		const waiter = waiters.shift();
		if (waiter) waiter(pid);
		else queue.push(pid);
	});
	return {
		next(): Promise<number> {
			const queued = queue.shift();
			if (queued !== undefined) return Promise.resolve(queued);
			return new Promise((resolve) => waiters.push(resolve));
		},
	};
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}
