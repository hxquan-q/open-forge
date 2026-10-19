// Copyright The Open Forge contributors.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const ENVIRONMENT_KEYS = [
	"PATH",
	"Path",
	"SystemRoot",
	"SYSTEMROOT",
	"WINDIR",
	"COMSPEC",
	"PATHEXT",
	"PROGRAMFILES",
	"PROCESSOR_ARCHITECTURE",
	"NUMBER_OF_PROCESSORS",
	"LANG",
	"LC_ALL",
	"TZ",
];

export function isolatedEnvironment(root, source = process.env) {
	const env = Object.fromEntries(
		ENVIRONMENT_KEYS.filter((key) => typeof source[key] === "string").map((key) => [key, source[key]]),
	);
	const home = join(root, "home");
	const temporary = join(root, "tmp");
	for (const directory of [home, temporary, join(root, "user-data")])
		mkdirSync(directory, { recursive: true, mode: 0o700 });
	return {
		...env,
		HOME: home,
		USERPROFILE: home,
		TMP: temporary,
		TEMP: temporary,
		TMPDIR: temporary,
		ELECTRON_USER_DATA: join(root, "user-data"),
		OPENFORGE_HOME: home,
	};
}

function stopTree(child) {
	if (!child.pid) return true;
	if (process.platform === "win32") {
		const executable = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe");
		const result = spawnSync(executable, ["/PID", String(child.pid), "/T", "/F"], {
			windowsHide: true,
			stdio: "ignore",
			timeout: 10000,
		});
		if (result.error || result.status !== 0) {
			child.kill("SIGKILL");
			return false;
		}
		return true;
	} else {
		try {
			process.kill(-child.pid, "SIGKILL");
		} catch (error) {
			if (error.code !== "ESRCH") {
				child.kill("SIGKILL");
				return false;
			}
		}
		return true;
	}
}

/** No shell and no ambient credential inheritance. cwd isolation alone is not a sandbox. */
export function runProcess({
	command,
	cwd,
	env,
	input = "",
	timeoutMs = 1800000,
	stallMs = 300000,
	maxOutputBytes = 1048576,
	signal,
	onSpawn,
	onActivity,
	onClose,
	terminate = stopTree,
	terminationGraceMs = 10000,
}) {
	if (
		!Array.isArray(command) ||
		command.length === 0 ||
		command.some((arg) => typeof arg !== "string" || arg.includes("\0"))
	)
		throw new Error("invalid command arguments");
	if (
		![timeoutMs, stallMs, maxOutputBytes, terminationGraceMs].every(
			(value) => Number.isSafeInteger(value) && value > 0,
		)
	)
		throw new Error("invalid process limits");
	const startedAt = Date.now();
	if (signal?.aborted)
		return Promise.resolve({
			reason: "cancelled",
			cleanupUnknown: false,
			exitCode: null,
			stdout: "",
			stderr: "",
			startedAt,
			finishedAt: startedAt,
			pid: null,
		});
	return new Promise((resolve) => {
		let reason;
		let cleanupUnknown = false;
		let terminationTimer;
		let total = 0;
		let settled = false;
		let lastActivity = Date.now();
		const stdout = [];
		const stderr = [];
		const child = spawn(command[0], command.slice(1), {
			cwd,
			env: env ?? {},
			windowsHide: true,
			shell: false,
			detached: process.platform !== "win32",
			stdio: ["pipe", "pipe", "pipe"],
		});
		const stop = (why) => {
			if (!reason && !settled) {
				reason = why;
				try {
					cleanupUnknown = terminate(child) !== true;
				} catch {
					cleanupUnknown = true;
				}
				terminationTimer = setTimeout(() => {
					cleanupUnknown = true;
					child.stdin.destroy();
					child.stdout.destroy();
					child.stderr.destroy();
					child.unref();
					finish(null, new Error("process termination could not be confirmed"));
				}, terminationGraceMs);
			}
		};
		const abort = () => stop("cancelled");
		const timeout = setTimeout(() => stop("timeout"), timeoutMs);
		const stall = setInterval(
			() => {
				if (Date.now() - lastActivity >= stallMs) stop("stalled");
			},
			Math.min(stallMs, 1000),
		);
		const finish = (exitCode, error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			clearTimeout(terminationTimer);
			clearInterval(stall);
			signal?.removeEventListener("abort", abort);
			resolve({
				reason: cleanupUnknown
					? "termination-unknown"
					: (reason ?? (error ? "spawn-error" : exitCode === 0 ? "success" : "failed")),
				cleanupUnknown,
				exitCode,
				stdout: Buffer.concat(stdout).toString("utf8"),
				stderr: Buffer.concat(stderr).toString("utf8"),
				startedAt,
				finishedAt: Date.now(),
				pid: child.pid ?? null,
				error: error?.message ?? null,
			});
		};
		const consume = (destination, data) => {
			lastActivity = Date.now();
			const available = Math.max(0, maxOutputBytes - total);
			destination.push(data.subarray(0, available));
			total += data.length;
			try {
				onActivity?.(lastActivity);
			} catch {
				stop("observer-error");
			}
			if (total > maxOutputBytes) stop("output-limit");
		};
		child.stdout.on("data", (data) => consume(stdout, data));
		child.stderr.on("data", (data) => consume(stderr, data));
		child.once("error", (error) => finish(null, error));
		child.once("close", (code) => {
			try {
				onClose?.(code);
			} catch {
				reason ??= "observer-error";
			}
			finish(code);
		});
		child.stdin.on("error", () => {});
		child.once("spawn", () => {
			try {
				onSpawn?.(child.pid);
			} catch {
				stop("observer-error");
			}
			if (signal?.aborted) abort();
			else child.stdin.end(input);
		});
		signal?.addEventListener("abort", abort, { once: true });
	});
}
