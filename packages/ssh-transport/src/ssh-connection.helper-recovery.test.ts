// Copyright The Open Forge contributors.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SshProcessRunner } from "./process-runner.js";
import { SshConnection, type SshConnectionOptions } from "./ssh-connection.js";

const ENCODER = new TextEncoder();

interface RunnerScript {
	/** 返回 null 表示这条命令应当失败（非零退出）。 */
	run?: (command: string) => { exitCode: number; stdout: string } | null;
}

function fakeRunner(script: RunnerScript = {}) {
	const counts = { commands: 0 };
	const failures: string[] = [];
	const runner = {
		run: async (invocation: { argv: readonly string[] }) => {
			const command = invocation.argv.join(" ");
			counts.commands += 1;
			if (command.includes("uname")) {
				const outcome = script.run ? script.run(command) : { exitCode: 0, stdout: "Linux\nx86_64" };
				if (!outcome) {
					failures.push(command);
					return {
						exitCode: 255,
						stdout: new Uint8Array(),
						stderr: ENCODER.encode("probe failed"),
						aborted: false,
					};
				}
				return {
					exitCode: outcome.exitCode,
					stdout: ENCODER.encode(outcome.stdout),
					stderr: new Uint8Array(),
					aborted: false,
				};
			}
			const outcome = script.run?.(command) ?? { exitCode: 0, stdout: "" };
			if (!outcome) return { exitCode: 1, stdout: new Uint8Array(), stderr: new Uint8Array(), aborted: false };
			return {
				exitCode: outcome.exitCode,
				stdout: ENCODER.encode(outcome.stdout),
				stderr: new Uint8Array(),
				aborted: false,
			};
		},
		open: undefined,
	} as unknown as SshProcessRunner;
	return { runner, counts, failures };
}

function localHelperBinary(): string {
	const path = join(mkdtempSync(join(tmpdir(), "helper-recovery-")), "openforge-ssh-helper");
	writeFileSync(path, "fake-helper");
	return path;
}

function createConnection(overrides: Partial<SshConnectionOptions> = {}, script: RunnerScript = {}) {
	const diagnostics: string[] = [];
	let nowMs = 1_000_000;
	const { runner, counts, failures } = fakeRunner(script);
	const connection = new SshConnection(
		{ id: "host-1", label: "host-1", target: "host-1", source: "manual" },
		{
			runner,
			controlPath: "/tmp/cp",
			helper: {
				resolveBinary: () => localHelperBinary(),
				onDiagnostic: (message) => diagnostics.push(message),
			},
			now: () => nowMs,
			...overrides,
		},
	);
	return {
		connection,
		diagnostics,
		counts,
		failures,
		advance(ms: number) {
			nowMs += ms;
		},
	};
}

describe("SshConnection 首次探测与 helper 恢复", () => {
	it("并发首次探测共享同一次 uname 往返，结果缓存", async () => {
		const { connection, counts } = createConnection();
		const [first, second] = await Promise.all([connection.probePlatform(), connection.probePlatform()]);
		expect(first.os).toBe("Linux");
		expect(second).toBe(first);
		const probeCommands = 1; // 共享在途：只跑了一次远端命令
		expect(counts.commands).toBe(probeCommands);
		await connection.probePlatform();
		expect(counts.commands).toBe(probeCommands);
	});

	it("探测失败不缓存结论，下次调用重新发起", async () => {
		let failFirst = true;
		const { connection, counts } = createConnection(
			{
				// 第一轮命令失败后重置脚本
			},
			{
				run: (command) => {
					if (command.includes("uname") && failFirst) return null;
					return { exitCode: 0, stdout: "Linux\nx86_64" };
				},
			},
		);
		await expect(connection.probePlatform()).rejects.toThrow();
		failFirst = false;
		const platform = await connection.probePlatform();
		expect(platform.os).toBe("Linux");
		expect(counts.commands).toBe(2);
	});

	it("不支持平台的 helper 结论按连接缓存，不反复探测或重试", async () => {
		const { connection, diagnostics } = createConnection(
			{},
			{
				run: (command) => {
					if (command.includes("uname")) return { exitCode: 0, stdout: "Windows_NT\nAMD64" };
					return { exitCode: 0, stdout: "" };
				},
			},
		);
		await expect(connection.helper()).resolves.toBeUndefined();
		await expect(connection.helper()).resolves.toBeUndefined();
		expect(diagnostics.filter((message) => message.includes("unsupported")).length).toBe(1);
	});

	it("临时失败进入退避：窗口内不重试，窗口过后重试", async () => {
		const { connection, diagnostics, advance } = createConnection();
		// openChannel 缺失 → helper 部署最后一步失败，属临时失败。
		await expect(connection.helper()).resolves.toBeUndefined();
		expect(diagnostics.filter((m) => m.includes("unavailable")).length).toBe(1);

		await expect(connection.helper()).resolves.toBeUndefined();
		expect(diagnostics.filter((m) => m.includes("unavailable")).length).toBe(1);

		advance(31_000);
		await expect(connection.helper()).resolves.toBeUndefined();
		expect(diagnostics.filter((m) => m.includes("unavailable")).length).toBe(2);
	});

	it("连续失败达上限后按连接放弃，之后不再发起恢复", async () => {
		const { connection, diagnostics, advance } = createConnection();
		await expect(connection.helper()).resolves.toBeUndefined();
		advance(31_000);
		await expect(connection.helper()).resolves.toBeUndefined();
		advance(61_000);
		await expect(connection.helper()).resolves.toBeUndefined();
		expect(diagnostics.filter((m) => m.includes("unavailable")).length).toBe(3);
		expect(diagnostics.some((m) => m.includes("giving up") || m.includes("放弃"))).toBe(true);

		advance(120_000);
		await expect(connection.helper()).resolves.toBeUndefined();
		expect(diagnostics.filter((m) => m.includes("unavailable")).length).toBe(3);
	});

	it("dispose 后不再发起新的恢复尝试", async () => {
		const { connection, diagnostics, advance } = createConnection();
		await expect(connection.helper()).resolves.toBeUndefined();
		connection.dispose();
		advance(120_000);
		await expect(connection.helper()).resolves.toBeUndefined();
		expect(diagnostics.filter((m) => m.includes("unavailable")).length).toBe(1);
	});
});
