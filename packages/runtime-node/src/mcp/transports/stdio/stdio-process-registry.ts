// Copyright The Open Forge contributors.

import { type ChildProcess, spawn, spawnSync } from "node:child_process";

export interface McpProcessTreeTerminateOptions {
	/**
	 * POSIX only: `true` sends SIGKILL to the process group, `false`/unset sends
	 * SIGTERM. Windows termination is always a forced `taskkill /T /F` because
	 * the platform has no graceful group signal for console processes.
	 */
	readonly force?: boolean;
	readonly log?: (message: string) => void;
}

interface RegisteredStdioProcess {
	readonly child: ChildProcess;
	readonly name: string;
}

const activeStdioProcesses = new Set<RegisteredStdioProcess>();
let exitSweepInstalled = false;

/**
 * Registers a live stdio MCP child so it can be reclaimed by
 * {@link sweepActiveStdioMcpProcesses} and by the process-exit backstop. Returns
 * the unregister callback the owner runs once the child is fully reaped.
 */
export function registerActiveStdioMcpProcess(child: ChildProcess, name: string): () => void {
	const entry: RegisteredStdioProcess = { child, name };
	activeStdioProcesses.add(entry);
	installExitSweep();
	return () => {
		activeStdioProcesses.delete(entry);
	};
}

/** Visible for tests: how many stdio MCP children are currently tracked. */
export function getActiveStdioMcpProcessCount(): number {
	return activeStdioProcesses.size;
}

/**
 * Force-kills every registered stdio MCP process tree. Used when the host is
 * going away and normal client shutdown already ran (or never had a chance to):
 * anything left in the registry at this point would become an orphan.
 */
export async function sweepActiveStdioMcpProcesses(log?: (message: string) => void): Promise<void> {
	const entries = [...activeStdioProcesses];
	if (entries.length === 0) return;
	await Promise.all(
		entries.map(async (entry) => {
			try {
				await terminateMcpProcessTree(entry.child, { force: true, log });
			} catch (error) {
				log?.(`Failed to sweep MCP server '${entry.name}': ${toMessage(error)}`);
			}
		}),
	);
}

/**
 * Terminates a spawned stdio MCP process together with its descendants.
 *
 * POSIX children are spawned `detached`, so the server process leads its own
 * process group and `kill(-pid)` reaches every member (with a direct-pid
 * fallback for children that never made it into the group). Windows has no
 * process groups for this purpose, so the tree walk is delegated to
 * `taskkill /PID <pid> /T /F`, which also covers `cmd.exe` shims that spawn
 * the real server.
 */
export function terminateMcpProcessTree(child: ChildProcess, options?: McpProcessTreeTerminateOptions): Promise<void> {
	const pid = child.pid;
	if (pid === undefined) return Promise.resolve();
	if (process.platform === "win32") return runTaskkill(pid, options?.log);
	const signal = options?.force === true ? "SIGKILL" : "SIGTERM";
	signalProcessTreePosix(pid, signal, options?.log);
	return Promise.resolve();
}

/** Synchronous variant for the process `exit` backstop, where awaits never run. */
export function terminateMcpProcessTreeSync(child: ChildProcess): void {
	const pid = child.pid;
	if (pid === undefined) return;
	if (process.platform === "win32") {
		try {
			spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
		} catch {
			// The exit backstop cannot report; a missing taskkill only loses the sweep.
		}
		return;
	}
	signalProcessTreePosix(pid, "SIGKILL");
}

function signalProcessTreePosix(pid: number, signal: "SIGTERM" | "SIGKILL", log?: (message: string) => void): void {
	try {
		process.kill(-pid, signal);
		return;
	} catch (error) {
		log?.(`Process-group signal ${signal} failed for pid ${pid}: ${toMessage(error)}`);
	}
	try {
		process.kill(pid, signal);
	} catch {
		// Already gone — that is the desired end state.
	}
}

function runTaskkill(pid: number, log?: (message: string) => void): Promise<void> {
	return new Promise((resolve) => {
		let settled = false;
		const finish = (message?: string) => {
			if (settled) return;
			settled = true;
			if (message) log?.(message);
			resolve();
		};
		try {
			const taskkill = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
				windowsHide: true,
				stdio: "ignore",
			});
			taskkill.on("error", (error) => finish(`taskkill /PID ${pid} failed: ${toMessage(error)}`));
			taskkill.on("exit", (code) => {
				finish(code === 0 ? undefined : `taskkill /PID ${pid} exited with code ${code}`);
			});
		} catch (error) {
			finish(`taskkill /PID ${pid} failed: ${toMessage(error)}`);
		}
	});
}

function installExitSweep(): void {
	if (exitSweepInstalled) return;
	exitSweepInstalled = true;
	process.once("exit", () => {
		for (const entry of activeStdioProcesses) {
			try {
				terminateMcpProcessTreeSync(entry.child);
			} catch {
				// Last-resort sweep: nothing can be reported during 'exit'.
			}
		}
	});
}

function toMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
