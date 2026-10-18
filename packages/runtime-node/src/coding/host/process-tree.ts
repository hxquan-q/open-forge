// Modified by The Open Forge contributors.
import { spawn } from "node:child_process";
import { join } from "node:path";

/**
 * Resolve taskkill from the Windows system directory instead of relying on
 * PATH lookup (PATH tampering or a stripped environment could substitute a
 * different executable). Falls back to the bare command when no system root
 * is available.
 */
export function resolveWindowsTaskkillCommand(environment: NodeJS.ProcessEnv = process.env): string {
	const systemRoot = environment.SystemRoot || environment.windir;
	return systemRoot ? join(systemRoot, "System32", "taskkill.exe") : "taskkill";
}

export function killNodeProcessTree(pid: number, environment: NodeJS.ProcessEnv = process.env): void {
	if (process.platform === "win32") {
		try {
			const child = spawn(resolveWindowsTaskkillCommand(environment), ["/F", "/T", "/PID", String(pid)], {
				stdio: "ignore",
				detached: true,
				windowsHide: true,
			});
			// spawn failures (ENOENT and friends) are delivered asynchronously on
			// 'error'; without a listener the unhandled event crashes the host.
			child.on("error", () => {});
		} catch {
			// The process may already have exited or taskkill may be unavailable.
		}
		return;
	}

	try {
		process.kill(-pid, "SIGKILL");
	} catch {
		try {
			process.kill(pid, "SIGKILL");
		} catch {
			// The process may already have exited.
		}
	}
}
