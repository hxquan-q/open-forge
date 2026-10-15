import { execFile } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { access, chmod, copyFile, mkdir, open, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { basename, delimiter, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { getAgentDir } from "@vetta/coding-agent/config";

const execFileAsync = promisify(execFile);

const DEV_CLI_DIR = ".desktop-dev";
const LAUNCHER_SOURCE_NAME = "vetta-dev-cli-launcher.js";
const LAUNCHER_BINARY_BASE_NAME = "vetta-dev-cli-launcher";
const OPENFORGE_CLI_BINARY_BASE_NAME = "openforge-cli-app";
const OPENFORGE_COMMAND_NAMES = process.platform === "win32" ? ["openforge.exe"] : ["openforge"];
// 旧品牌命令名：换名后不保留别名，这些历史 shim 文件在所有平台一并清理。
const LEGACY_COMMAND_NAMES = ["vetta", "vetta.cmd", "vetta.exe"];

interface DevCliShimOptions {
	appRoot: string;
	electronPath: string;
	mainEntryPath: string;
}

interface DevOpenForgeCliShimOptions {
	appRoot: string;
	cliAppRoot: string;
}

async function isExecutable(path: string): Promise<boolean> {
	try {
		await access(path, process.platform === "win32" ? constants.F_OK : constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

async function writeFileIfChanged(path: string, content: string): Promise<boolean> {
	try {
		const current = await readFile(path, "utf8");
		if (current === content) return false;
	} catch {
		// Missing or unreadable launcher source: rewrite it below.
	}
	await writeFile(path, content, "utf8");
	return true;
}

// Windows 上目标 .exe 可能被运行中的进程或杀软持有——copyFile 报 EPERM/EBUSY/EACCES。
// 处理策略：等价内容直接视为成功（目标已是最新，只是被锁）；真有差异先重试吸收瞬态锁，
// 仍占用则抛 CliShimTargetLockedError，由调用方降为 warn——启动不该被这条 error 刷屏。
export class CliShimTargetLockedError extends Error {
	constructor(
		readonly targetPath: string,
		options?: { cause?: unknown },
	) {
		super(`CLI shim target is locked by another process: ${targetPath}`, options);
		this.name = "CliShimTargetLockedError";
	}
}

interface CopyFileIfChangedOptions {
	// 每次失败后的重试间隔序列；空数组 = 不重试（测试用确定性断言）。
	retryDelaysMs?: readonly number[];
	sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_COPY_RETRY_DELAYS_MS: readonly number[] = [250, 250, 250];

function isTargetLockedError(error: unknown): boolean {
	const code = (error as NodeJS.ErrnoException)?.code;
	return code === "EPERM" || code === "EBUSY" || code === "EACCES";
}

async function filesHaveSameContent(aPath: string, bPath: string): Promise<boolean> {
	const [fileA, fileB] = await Promise.all([open(aPath, "r"), open(bPath, "r")]);
	try {
		const [statsA, statsB] = await Promise.all([fileA.stat(), fileB.stat()]);
		if (statsA.size !== statsB.size) return false;
		const chunkSize = 64 * 1024;
		const bufferA = Buffer.allocUnsafe(chunkSize);
		const bufferB = Buffer.allocUnsafe(chunkSize);
		let offset = 0;
		while (offset < statsA.size) {
			const length = Math.min(chunkSize, statsA.size - offset);
			const [readA, readB] = await Promise.all([
				fileA.read(bufferA, 0, length, offset),
				fileB.read(bufferB, 0, length, offset),
			]);
			if (readA.bytesRead !== readB.bytesRead) return false;
			if (!bufferA.subarray(0, readA.bytesRead).equals(bufferB.subarray(0, readA.bytesRead))) return false;
			if (readA.bytesRead === 0) break;
			offset += readA.bytesRead;
		}
		return true;
	} finally {
		await Promise.allSettled([fileA.close(), fileB.close()]);
	}
}

export async function copyFileIfChanged(
	sourcePath: string,
	targetPath: string,
	options: CopyFileIfChangedOptions = {},
): Promise<void> {
	const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_COPY_RETRY_DELAYS_MS;
	const sleep = options.sleep ?? delay;
	try {
		const [sourceStats, targetStats] = await Promise.all([stat(sourcePath), stat(targetPath)]);
		if (sourceStats.size === targetStats.size && sourceStats.mtimeMs <= targetStats.mtimeMs) return;
	} catch {
		// Missing or unreadable target: copy it below.
	}
	let lastError: unknown;
	try {
		await copyFile(sourcePath, targetPath);
		return;
	} catch (error) {
		if (!isTargetLockedError(error)) throw error;
		lastError = error;
	}
	// 目标被占用：已等价则无事可做（目标就是新内容，仅 mtime/size 表象过期）。
	if (await filesHaveSameContent(sourcePath, targetPath).catch(() => false)) return;
	for (const delayMs of retryDelaysMs) {
		await sleep(delayMs);
		try {
			await copyFile(sourcePath, targetPath);
			return;
		} catch (error) {
			if (!isTargetLockedError(error)) throw error;
			lastError = error;
		}
	}
	throw new CliShimTargetLockedError(targetPath, { cause: lastError });
}

// Windows `.exe` shim 的安装步骤：内容等价即跳过，目标被占用且确有差异时降级为 warn——
// 现有 shim 仍可执行，新版本待下次启动自然补上；其余错误照常冒泡。
export async function installBinaryCommandShim(
	sourcePath: string,
	shimPath: string,
	options: CopyFileIfChangedOptions = {},
): Promise<void> {
	try {
		await copyFileIfChanged(sourcePath, shimPath, options);
	} catch (error) {
		if (error instanceof CliShimTargetLockedError) {
			console.warn(`[cli-shim] target executable in use; will retry on next launch: ${shimPath}`);
			return;
		}
		throw error;
	}
}

async function needsCompile(sourcePath: string, binaryPath: string, sourceChanged: boolean): Promise<boolean> {
	if (sourceChanged) return true;
	try {
		const [sourceStats, binaryStats] = await Promise.all([stat(sourcePath), stat(binaryPath)]);
		return sourceStats.mtimeMs > binaryStats.mtimeMs;
	} catch {
		return true;
	}
}

async function getNewestFileMtimeMs(dir: string): Promise<number> {
	const entries = await readdir(dir, { withFileTypes: true });
	const mtimes = await Promise.all(
		entries.map(async (entry) => {
			const entryPath = join(dir, entry.name);
			if (entry.isDirectory()) return await getNewestFileMtimeMs(entryPath);
			if (!entry.isFile()) return 0;
			return (await stat(entryPath)).mtimeMs;
		}),
	);
	return Math.max(0, ...mtimes);
}

function createLauncherSource(options: DevCliShimOptions): string {
	// Use spawn + explicit pipe forwarding instead of spawnSync's "inherit".
	// On Windows, GUI-subsystem children (Electron) inheriting a Go-created
	// stdin pipe handle end up with a stream that Node's readline sees as
	// already closed — the agent-rpc child exits before the handshake byte
	// is ever read. Manual forwarding gives the child a Node-managed pipe
	// it can actually read. Mac/Linux work both ways; we use the same
	// strategy everywhere for consistency.
	return `import { spawn } from "node:child_process";

const electronPath = ${JSON.stringify(options.electronPath)};
const mainEntryPath = ${JSON.stringify(options.mainEntryPath)};
const appRoot = ${JSON.stringify(options.appRoot)};

const child = spawn(electronPath, [mainEntryPath, ...process.argv.slice(2)], {
\tcwd: appRoot,
\tstdio: ["pipe", "pipe", "pipe"],
\twindowsHide: true,
});

child.on("error", (err) => {
\tconsole.error(err.message);
\tprocess.exit(1);
});

process.stdin.on("error", () => {});
child.stdin.on("error", () => {});
process.stdin.pipe(child.stdin);
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);

child.on("exit", (code, signal) => {
\tprocess.exit(code ?? (signal ? 1 : 0));
});
`;
}

function findOnPath(command: string): string | undefined {
	const pathValue = process.env.PATH;
	if (!pathValue) return undefined;
	const extensions = process.platform === "win32" ? [".exe", ""] : [""];
	for (const dir of pathValue.split(delimiter)) {
		for (const extension of extensions) {
			const candidate = join(dir, `${command}${extension}`);
			if (pathExistsSync(candidate)) return candidate;
		}
	}
	return undefined;
}

function pathExistsSync(path: string): boolean {
	try {
		accessSync(path, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

function getCurrentPlatformArchId(): string {
	return `${process.platform}-${process.arch}`;
}

function getLauncherBinaryName(): string {
	return process.platform === "win32" ? `${LAUNCHER_BINARY_BASE_NAME}.exe` : LAUNCHER_BINARY_BASE_NAME;
}

function getOpenForgeCliBinaryName(): string {
	return process.platform === "win32" ? `${OPENFORGE_CLI_BINARY_BASE_NAME}.exe` : OPENFORGE_CLI_BINARY_BASE_NAME;
}

function resolveBunCommand(): string {
	const npmExecPath = process.env.npm_execpath;
	if (npmExecPath && basename(npmExecPath).toLowerCase().startsWith("bun") && pathExistsSync(npmExecPath)) {
		return npmExecPath;
	}

	const bunInstall = process.env.BUN_INSTALL;
	if (bunInstall) {
		const installedBun = join(bunInstall, "bin", process.platform === "win32" ? "bun.exe" : "bun");
		if (pathExistsSync(installedBun)) return installedBun;
	}

	const pathBun = findOnPath("bun");
	if (pathBun) return pathBun;

	return process.platform === "win32" ? "bun.exe" : "bun";
}

async function assertExecutable(path: string): Promise<void> {
	if (!(await isExecutable(path))) {
		throw new Error(`Dev CLI shim is not executable: ${path}`);
	}
}

export async function ensureDevCliShim(options: DevCliShimOptions): Promise<string> {
	const shimDir = join(options.appRoot, DEV_CLI_DIR, getCurrentPlatformArchId());
	const sourcePath = join(shimDir, LAUNCHER_SOURCE_NAME);
	const binaryPath = join(shimDir, getLauncherBinaryName());

	await mkdir(shimDir, { recursive: true });

	const sourceChanged = await writeFileIfChanged(sourcePath, createLauncherSource(options));
	if (await needsCompile(sourcePath, binaryPath, sourceChanged)) {
		const bunCommand = resolveBunCommand();
		await execFileAsync(bunCommand, ["build", sourcePath, "--compile", "--outfile", binaryPath], {
			cwd: options.appRoot,
			windowsHide: true,
		});
	}

	await assertExecutable(binaryPath);
	return binaryPath;
}

export async function ensureDevOpenForgeCliShim(options: DevOpenForgeCliShimOptions): Promise<string> {
	const shimDir = join(options.appRoot, DEV_CLI_DIR, getCurrentPlatformArchId());
	const sourceDir = join(options.cliAppRoot, "src");
	const binaryPath = join(shimDir, getOpenForgeCliBinaryName());
	await mkdir(shimDir, { recursive: true });

	try {
		const [sourceMtimeMs, binaryStats] = await Promise.all([getNewestFileMtimeMs(sourceDir), stat(binaryPath)]);
		if (sourceMtimeMs <= binaryStats.mtimeMs) {
			await assertExecutable(binaryPath);
			return binaryPath;
		}
	} catch {
		// Missing binary or source stats: compile below.
	}

	const bunCommand = resolveBunCommand();
	const compileScriptPath = join(options.cliAppRoot, "scripts", "compile-standalone.mjs");
	await execFileAsync(bunCommand, [compileScriptPath, "--outfile", binaryPath], {
		cwd: options.appRoot,
		windowsHide: true,
	});
	await assertExecutable(binaryPath);
	return binaryPath;
}

function createOpenForgeCommandShim(cliAppBinaryPath: string): string {
	if (process.platform === "win32") {
		return ["@echo off", `"${cliAppBinaryPath}" %*`, ""].join("\r\n");
	}

	return ["#!/usr/bin/env sh", `exec "${cliAppBinaryPath}" "$@"`, ""].join("\n");
}

async function removeLegacyCommandShims(binDir: string): Promise<void> {
	await Promise.all(
		LEGACY_COMMAND_NAMES.map(async (name) => {
			try {
				await unlink(join(binDir, name));
			} catch {
				// Missing legacy shim is fine.
			}
		}),
	);
}

export async function ensureOpenForgeCommandShim(cliAppBinaryPath: string): Promise<string> {
	await assertExecutable(cliAppBinaryPath);
	const binDir = join(getAgentDir(), "bin");
	await mkdir(binDir, { recursive: true });
	await removeLegacyCommandShims(binDir);
	const shimPaths = OPENFORGE_COMMAND_NAMES.map((name) => join(binDir, name));
	await Promise.all(
		shimPaths.map((shimPath) =>
			process.platform === "win32" && shimPath.endsWith(".exe")
				? installBinaryCommandShim(cliAppBinaryPath, shimPath)
				: writeFileIfChanged(shimPath, createOpenForgeCommandShim(cliAppBinaryPath)),
		),
	);
	for (const shimPath of shimPaths) {
		if (process.platform !== "win32") {
			await access(shimPath, constants.F_OK);
			await chmod(shimPath, 0o755);
		}
		await assertExecutable(shimPath);
	}
	return shimPaths[0];
}
