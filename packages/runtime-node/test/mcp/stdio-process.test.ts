// Modified by The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { StdioMcpProcess } from "../../src/mcp/transports/stdio/stdio-process.js";
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

async function waitForCondition(condition: () => boolean, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!condition()) {
		if (Date.now() > deadline) throw new Error("Timed out waiting for stdio message");
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
}
