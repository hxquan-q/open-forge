// Copyright The Open Forge contributors.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RuntimeCommandRunner } from "./runtime-command.js";

let runner = new RuntimeCommandRunner();

afterEach(async () => {
	await runner.shutdown();
	runner = new RuntimeCommandRunner();
});

describe("runtime commands", () => {
	it("returns output and an exit status without throwing on a nonzero exit", async () => {
		const success = await runner.run(process.execPath, ["-e", "console.log('ready')"], { timeout: 5_000 });
		expect(success).toMatchObject({ status: 0, stdout: "ready\n", stderr: "" });
		const failed = await runner.run(process.execPath, ["-e", "console.error('unavailable'); process.exitCode = 7"], {
			timeout: 5_000,
		});
		expect(failed).toMatchObject({ status: 7, stderr: "unavailable\n" });
	});

	it("settles spawn failures and remains usable", async () => {
		const missing = await runner.run(join(tmpdir(), "open-forge-nonexistent-runtime-executable-for-unit-test"), [], {
			timeout: 5_000,
		});
		expect(missing.status).toBeNull();
		expect(missing.error).toMatchObject({ code: "ENOENT" });
		expect((await runner.run(process.execPath, ["-e", ""], { timeout: 5_000 })).status).toBe(0);
	});

	it("bounds subprocess output while retaining a diagnosable error", async () => {
		const result = await runner.run(process.execPath, ["-e", "process.stdout.write('x'.repeat(1024 * 1024 + 1))"], {
			timeout: 5_000,
		});
		expect(result.status).toBeNull();
		expect(result.error).toMatchObject({ code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" });
		expect(result.stdout.length).toBeLessThanOrEqual(1024 * 1024);
	});

	it("terminates a timed out subprocess before reporting completion", async () => {
		const timedOut = await runner.run(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { timeout: 100 });
		expect(timedOut.status).toBeNull();
		expect(timedOut.error).toMatchObject({ killed: true });
		expect((await runner.run(process.execPath, ["-e", ""], { timeout: 5_000 })).status).toBe(0);
	});

	it("cancels an in-flight command and can run another command afterwards", async () => {
		const directory = await mkdtemp(join(tmpdir(), "runtime-command-cancel-"));
		const marker = join(directory, "ready");
		const controller = new AbortController();
		const command = runner.run(
			process.execPath,
			[
				"-e",
				"require('node:fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)",
				marker,
			],
			{
				timeout: 5_000,
				signal: controller.signal,
			},
		);
		try {
			let childPid = 0;
			await vi.waitFor(async () => {
				childPid = Number(await readFile(marker, "utf8"));
				expect(childPid).toBeGreaterThan(0);
			});
			expect(() => process.kill(childPid, 0)).not.toThrow();
			controller.abort();
			expect((await command).error).toMatchObject({ name: "AbortError" });
			expect(() => process.kill(childPid, 0)).toThrow();
			expect((await runner.run(process.execPath, ["-e", ""], { timeout: 5_000 })).status).toBe(0);
		} finally {
			controller.abort();
			await command;
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("shutdown waits for running commands and rejects later work without spawning", async () => {
		const command = runner.run(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { timeout: 5_000 });
		await runner.shutdown();
		expect((await command).error).toMatchObject({ name: "AbortError" });
		const afterShutdown = await runner.run(process.execPath, ["-e", "process.exit(99)"], { timeout: 5_000 });
		expect(afterShutdown.status).toBeNull();
		expect(afterShutdown.error).toMatchObject({ name: "AbortError" });
	});

	it("cancels a ready command even when it handles SIGTERM", async () => {
		const directory = await mkdtemp(join(tmpdir(), "runtime-command-force-cancel-"));
		const marker = join(directory, "ready");
		const controller = new AbortController();
		let childPid: number | undefined;
		let settled = false;
		const command = runner
			.run(
				process.execPath,
				[
					"-e",
					"process.on('SIGTERM', () => {}); require('node:fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)",
					marker,
				],
				{ timeout: 5_000, signal: controller.signal },
			)
			.then((result) => {
				settled = true;
				return result;
			});
		try {
			await vi.waitFor(async () => {
				childPid = Number(await readFile(marker, "utf8"));
				expect(childPid).toBeGreaterThan(0);
			});
			controller.abort();
			await vi.waitFor(() => expect(settled).toBe(true));
			expect((await command).error).toMatchObject({ name: "AbortError" });
			expect(() => process.kill(childPid as number, 0)).toThrow();
		} finally {
			if (childPid !== undefined) {
				try {
					process.kill(childPid, "SIGKILL");
				} catch {
					/* Already reaped. */
				}
			}
			await command;
			await rm(directory, { recursive: true, force: true });
		}
	});
});
