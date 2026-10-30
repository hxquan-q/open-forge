// Copyright The Open Forge contributors.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isolatedEnvironment, runProcess } from "./process.mjs";
import { processFixture } from "./process-fixture.mjs";

const roots = [];
function folder() {
	const root = mkdtempSync(join(tmpdir(), "forge-autonomy-process-"));
	roots.push(root);
	return root;
}
afterEach(async ({ cleanupOwnedProcess }) => {
	await cleanupOwnedProcess?.();
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function ownedProcess(context, program) {
	const root = folder();
	const cancellation = new AbortController();
	const owner = processFixture(AbortSignal.any([context.signal, cancellation.signal]));
	let ready;
	const started = new Promise((resolve) => {
		ready = resolve;
	});
	let markSpawned;
	const spawned = new Promise((resolve) => {
		markSpawned = resolve;
	});
	let release;
	const cleanup = new Promise((resolve) => {
		release = resolve;
	});
	const completions = [];
	let operation;
	let closing;
	context.cleanupOwnedProcess = async () => {
		release();
		cancellation.abort();
		await owner.close();
		await operation;
		await closing;
	};
	operation = owner.run(async (signal) => {
		const result = await runProcess({
			command: [process.execPath, "-e", program],
			cwd: root,
			env: isolatedEnvironment(root),
			signal,
			onSpawn: markSpawned,
			onActivity: ready,
		});
		await cleanup;
		completions.push("operation");
		return result;
	});
	return {
		root,
		owner,
		started,
		spawned,
		release,
		operation,
		completions,
		get completed() {
			return completions.includes("operation");
		},
		close() {
			closing ??= owner.close().then(() => {
				completions.push("close");
			});
			return closing;
		},
	};
}

describe("isolated external process lifecycle", () => {
	it("waits for owned process cleanup and refuses work after fixture closure", async (context) => {
		const fixture = ownedProcess(context, "console.log('ready');setInterval(()=>{},1000)");
		await fixture.started;
		let closed = false;
		const closing = fixture.close().then(() => {
			closed = true;
		});
		expect(fixture.owner.signal.aborted).toBe(true);
		expect(fixture.completed).toBe(false);
		await Promise.resolve();
		expect(closed).toBe(false);
		fixture.release();
		expect((await fixture.operation).reason).toBe("cancelled");
		await closing;
		expect(fixture.completed).toBe(true);
		expect(fixture.completions).toEqual(["operation", "close"]);
		let invoked = false;
		await expect(
			fixture.owner.run(() => {
				invoked = true;
			}),
		).rejects.toThrow(/closed/);
		expect(invoked).toBe(false);
	});
	it("drains an owned process from teardown without waiting for startup activity", async (context) => {
		const fixture = ownedProcess(context, "setInterval(()=>{},1000)");
		let ready = false;
		fixture.started.then(() => {
			ready = true;
		});
		await fixture.spawned;
		await context.cleanupOwnedProcess();
		expect(ready).toBe(false);
		expect((await fixture.operation).reason).toBe("cancelled");
		expect(fixture.completed).toBe(true);
		expect(existsSync(fixture.root)).toBe(true);
	});
	it("reports unconfirmed termination instead of silently returning a clean cancellation", async () => {
		const root = folder();
		const cancellation = new AbortController();
		let pid;
		let markClosed;
		const closed = new Promise((resolve) => {
			markClosed = resolve;
		});
		try {
			const result = await runProcess({
				command: [process.execPath, "-e", "console.log('ready');setInterval(()=>{},1000)"],
				cwd: root,
				env: isolatedEnvironment(root),
				signal: cancellation.signal,
				onSpawn: (value) => {
					pid = value;
				},
				onActivity: () => cancellation.abort(),
				onClose: () => markClosed(),
				terminate: () => false,
				terminationGraceMs: 25,
			});
			expect(result.reason).toBe("termination-unknown");
			expect(result.cleanupUnknown).toBe(true);
		} finally {
			if (pid) {
				try {
					process.kill(pid, "SIGKILL");
				} catch {}
				await closed;
			}
		}
	});
	it("cancels a spawned descendant as well as its parent", async () => {
		const root = folder();
		const cancellation = new AbortController();
		let descendant;
		const program =
			"const {spawn}=require('node:child_process');const {writeFileSync}=require('node:fs');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});writeFileSync('child.pid',String(child.pid));console.log('ready');setInterval(()=>{},1000);";
		try {
			const result = await runProcess({
				command: [process.execPath, "-e", program],
				cwd: root,
				env: isolatedEnvironment(root),
				timeoutMs: 10000,
				onActivity: () => {
					if (existsSync(join(root, "child.pid"))) {
						descendant = Number(readFileSync(join(root, "child.pid"), "utf8"));
						cancellation.abort();
					}
				},
				signal: cancellation.signal,
			});
			expect(result.reason).toBe("cancelled");
			expect(descendant).toBeGreaterThan(0);
			if (process.platform === "win32") expect(() => process.kill(descendant, 0)).toThrow();
			else {
				const status = spawnSync("/bin/ps", ["-p", String(descendant), "-o", "stat="], { encoding: "utf8" });
				expect(status.stdout.trim() === "" || status.stdout.trim().startsWith("Z")).toBe(true);
			}
		} finally {
			if (descendant) {
				try {
					process.kill(descendant, "SIGKILL");
				} catch {}
			}
		}
	});
	it("uses stdin, isolates user state, and does not inherit ambient credentials", async () => {
		const root = folder();
		const env = isolatedEnvironment(root, {
			PATH: process.env.PATH,
			SystemRoot: process.env.SystemRoot,
			PRIVATE_PROVIDER_KEY: "must-not-leak",
			HOME: "live-home",
		});
		const result = await runProcess({
			command: [
				process.execPath,
				"-e",
				"let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>console.log(JSON.stringify({s,home:process.env.HOME,key:process.env.PRIVATE_PROVIDER_KEY})));",
			],
			cwd: root,
			env,
			input: "request",
		});
		expect(result.reason).toBe("success");
		expect(JSON.parse(result.stdout)).toEqual({ s: "request", home: join(root, "home") });
	});
	it("keeps nonzero exits and bounded output distinct from success", async () => {
		const root = folder();
		const failed = await runProcess({
			command: [process.execPath, "-e", "process.exit(7)"],
			cwd: root,
			env: isolatedEnvironment(root),
		});
		expect(failed.exitCode).toBe(7);
		expect(failed.reason).toBe("failed");
		const noisy = await runProcess({
			command: [process.execPath, "-e", "process.stdout.write('x'.repeat(5000));setInterval(()=>{},1000)"],
			cwd: root,
			env: isolatedEnvironment(root),
			maxOutputBytes: 1024,
		});
		expect(noisy.reason).toBe("output-limit");
		expect(Buffer.byteLength(noisy.stdout)).toBeLessThanOrEqual(1024);
	});
	it("terminates a hung command and refuses an already cancelled request before spawning", async () => {
		const root = folder();
		const result = await runProcess({
			command: [process.execPath, "-e", "setInterval(()=>{},1000)"],
			cwd: root,
			env: isolatedEnvironment(root),
			timeoutMs: 250,
		});
		expect(result.reason).toBe("timeout");
		const cancellation = new AbortController();
		cancellation.abort();
		let spawned = false;
		const cancelled = await runProcess({
			command: [process.execPath, "-e", "process.exit(0)"],
			cwd: root,
			env: isolatedEnvironment(root),
			signal: cancellation.signal,
			onSpawn: () => {
				spawned = true;
			},
		});
		expect(cancelled.reason).toBe("cancelled");
		expect(spawned).toBe(false);
	});
});
