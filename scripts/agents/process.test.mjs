// Copyright The Open Forge contributors.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isolatedEnvironment, runProcess } from "./process.mjs";

const roots = [];
function folder() {
	const root = mkdtempSync(join(tmpdir(), "forge-autonomy-process-"));
	roots.push(root);
	return root;
}
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("isolated external process lifecycle", () => {
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
