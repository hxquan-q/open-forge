// Copyright The Open Forge contributors.
/**
 * Desktop 分进程资源基线测量（TASK-0448 / PLAN-0029 Phase 0.2）。
 *
 * 运行会启动真实 Electron，属于 UI/真实运行验证：执行前须取得当前任务授权。
 * 统计、解析与隔离判定在 baseline-stats.mjs（纯函数，有单测）；本文件只做 I/O 与编排。
 * 子进程一律以参数数组启动（shell: false），退出时结束整棵进程树。
 * 单位约定：时长毫秒（ms），内存字节（bytes）。用法见 scripts/perf/README.md。
 */

import { spawn, spawnSync } from "node:child_process";
import {
	closeSync,
	existsSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	realpathSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { cpus, homedir, release, totalmem } from "node:os";
import { dirname, join, posix as pathPosix, win32 as pathWin32, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { createInterface } from "node:readline/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
	aggregateByType,
	collectProcessTree,
	dataDirIsolationProblem,
	findLogMarker,
	flattenMemory,
	LOG_MARKERS,
	mergeRuns,
	parsePsOutput,
	parseWin32ProcessJson,
	redactHomePath,
	summarizeValues,
} from "./baseline-stats.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..");
const desktopRoot = join(repoRoot, "apps", "desktop");

const MIN_RUNS = 3;
const DEFAULTS = Object.freeze({
	runs: MIN_RUNS,
	sessions: 0,
	keyword: "TODO",
	startupTimeoutMs: 90_000,
	idleMs: 10_000,
	maxRelativeRange: 0.2,
});
/** 两次采样之间的额外等待；Windows 上一次 CIM 查询本身约需数百毫秒。 */
const POLL_INTERVAL_MS = 250;
/** 相邻两次运行之间的冷却，让上一棵进程树完全退出、磁盘缓存回落。 */
const COOLDOWN_MS = 3_000;
const KILL_GRACE_MS = 3_000;
/** 数据目录标记：目录非空时只接受本脚本先前创建过的目录。 */
const DATA_DIR_MARKER = ".openforge-perf-baseline";
/** 文件遍历跳过的目录；与 rg 默认遵循 .gitignore 的口径接近，记录进输出。 */
const WALK_SKIPPED_DIRECTORIES = Object.freeze([".git", "node_modules"]);
const MAX_TOOL_OUTPUT_BYTES = 64 * 1024 * 1024;

const EVENT_LOOP_UNAVAILABLE = Object.freeze({
	available: false,
	reason:
		"Desktop 主进程的事件循环监控只保存在进程内存中，没有外部读取通道；" +
		"TASK-0448 不修改 Desktop 运行时代码，需另拆埋点 Task 后再采集 p50/p95。",
});

const WIN32_PROCESS_QUERY =
	"[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; " +
	"Get-CimInstance -ClassName Win32_Process | " +
	"Select-Object ProcessId,ParentProcessId,CommandLine,WorkingSetSize,PrivatePageCount," +
	"@{n='CreatedMs';e={if ($_.CreationDate) { ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() } }} | " +
	"ConvertTo-Json -Compress -Depth 2";
/** setTimeout 的上限（2^31-1 ms）；超过时 Node 会把延时改成 1ms。 */
const MAX_TIMER_MS = 2_147_483_647;
/** Windows 系统工具用绝对路径启动，避免 PATH 或 cwd 中的同名程序被优先执行。 */
const WIN32_SYSTEM32 = pathWin32.join(process.env.SystemRoot ?? "C:\\Windows", "System32");
const WIN32_POWERSHELL = pathWin32.join(WIN32_SYSTEM32, "WindowsPowerShell", "v1.0", "powershell.exe");
const WIN32_TASKKILL = pathWin32.join(WIN32_SYSTEM32, "taskkill.exe");

const USAGE = `Usage: node scripts/perf/desktop-baseline.mjs --data-dir <absolute isolated dir> [options]

Requires explicit authorization: launches a real Desktop (Electron) process.

Options:
  --data-dir <dir>             Required. Dedicated empty directory outside real state roots.
  --runs <n>                   Launch count, >= ${MIN_RUNS} (default ${DEFAULTS.runs}). Also the scan/search repeat count.
  --sessions <n>               Operator opens n sessions manually, then memory is sampled (default 0, needs a TTY).
  --app <path>                 Packaged executable, or a dev main entry (.js) run by the repo's electron
                               (default apps/desktop/dist/main/index.js).
  --out <file>                 Output JSON path (default <data-dir>/baseline-<stamp>/baseline.json).
  --scan-root <dir>            Sample repository for walk/search timing (default repo root).
  --keyword <text>             Fixed string searched by rg (default "${DEFAULTS.keyword}").
  --startup-timeout-ms <ms>    Max wait for the readiness signal (default ${DEFAULTS.startupTimeoutMs}).
  --idle-ms <ms>               Settle time after readiness before the idle sample (default ${DEFAULTS.idleMs}).
  --max-relative-range <r>     Variation flag threshold, (max-min)/mean (default ${DEFAULTS.maxRelativeRange}).
  -h, --help                   Show this help.`;

const VALUE_FLAGS = new Map([
	["--runs", "runs"],
	["--sessions", "sessions"],
	["--app", "app"],
	["--data-dir", "dataDir"],
	["--out", "out"],
	["--scan-root", "scanRoot"],
	["--keyword", "keyword"],
	["--startup-timeout-ms", "startupTimeoutMs"],
	["--idle-ms", "idleMs"],
	["--max-relative-range", "maxRelativeRange"],
]);

function parseNonNegativeInteger(flag, value) {
	if (!/^\d+$/.test(value)) throw new Error(`${flag} must be a non-negative integer: ${value}`);
	const number = Number(value);
	if (!Number.isSafeInteger(number)) throw new Error(`${flag} is too large: ${value}`);
	return number;
}

/** 解析 CLI 参数，支持 `--flag value` 与 `--flag=value`；未知参数直接报错。 */
export function parseCliArgs(argv) {
	const raw = {};
	let help = false;
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--") continue;
		if (arg === "--help" || arg === "-h") {
			help = true;
			continue;
		}
		const equals = arg.startsWith("--") ? arg.indexOf("=") : -1;
		const flag = equals > 0 ? arg.slice(0, equals) : arg;
		const key = VALUE_FLAGS.get(flag);
		if (!key) throw new Error(`unknown argument: ${arg}`);
		let value;
		if (equals > 0) {
			value = arg.slice(equals + 1);
		} else {
			value = argv[index + 1];
			index += 1;
			if (value === undefined || value.startsWith("--")) throw new Error(`${flag} requires a value`);
		}
		if (value === "") throw new Error(`${flag} requires a value`);
		raw[key] = value;
	}

	const options = {
		...DEFAULTS,
		help,
		app: raw.app ?? null,
		dataDir: raw.dataDir ?? null,
		out: raw.out ?? null,
		scanRoot: raw.scanRoot ?? null,
		keyword: raw.keyword ?? DEFAULTS.keyword,
	};
	if (raw.runs !== undefined) options.runs = parseNonNegativeInteger("--runs", raw.runs);
	if (options.runs < MIN_RUNS) throw new Error(`--runs must be at least ${MIN_RUNS}: ${options.runs}`);
	if (raw.sessions !== undefined) options.sessions = parseNonNegativeInteger("--sessions", raw.sessions);
	for (const [key, flag] of [
		["startupTimeoutMs", "--startup-timeout-ms"],
		["idleMs", "--idle-ms"],
	]) {
		if (raw[key] !== undefined) options[key] = parseNonNegativeInteger(flag, raw[key]);
		// 两者都会进入 setTimeout / delay，超过上限会被 Node 静默改成 1ms。
		if (options[key] > MAX_TIMER_MS) throw new Error(`${flag} must be <= ${MAX_TIMER_MS}`);
	}
	if (options.startupTimeoutMs === 0) throw new Error("--startup-timeout-ms must be positive");
	if (raw.maxRelativeRange !== undefined) {
		const value = Number(raw.maxRelativeRange);
		if (!/^\d+(?:\.\d+)?$/.test(raw.maxRelativeRange) || !Number.isFinite(value)) {
			throw new Error(`--max-relative-range must be a non-negative number: ${raw.maxRelativeRange}`);
		}
		options.maxRelativeRange = value;
	}
	return options;
}

/** 从基础环境删除、且不重新设置的变量：NODE_OPTIONS 可向 Electron 主进程注入 --require 等参数。 */
const CHILD_ENV_REMOVED = Object.freeze(["NODE_OPTIONS"]);

/**
 * 按平台把应用数据 / 配置 / 缓存根指到隔离主目录下（与 platform 对应的 path 实现拼接）：
 * win32 为 APPDATA / LOCALAPPDATA；darwin 由 HOME 推导（~/Library/...）无需额外变量；
 * 其余 POSIX 为 XDG_* 基础目录。
 */
function platformDataRoots(homeDir, platform) {
	if (platform === "win32") {
		return {
			APPDATA: pathWin32.join(homeDir, "AppData", "Roaming"),
			LOCALAPPDATA: pathWin32.join(homeDir, "AppData", "Local"),
		};
	}
	if (platform === "darwin") return {};
	return {
		XDG_CONFIG_HOME: pathPosix.join(homeDir, ".config"),
		XDG_DATA_HOME: pathPosix.join(homeDir, ".local", "share"),
		XDG_CACHE_HOME: pathPosix.join(homeDir, ".cache"),
		XDG_STATE_HOME: pathPosix.join(homeDir, ".local", "state"),
	};
}

/** 子进程环境中被替换的变量名（报告字段 isolation.childEnvOverrides）。 */
function childEnvOverrideKeys(platform) {
	return [
		"VETTA_HOME",
		"VETTA_DESKTOP_USER_DATA_DIR",
		"HOME",
		...(platform === "win32" ? ["USERPROFILE"] : []),
		...Object.keys(platformDataRoots("", platform)),
	];
}

/**
 * 子进程环境：去掉宿主的 VETTA_* / ELECTRON_*（如 ELECTRON_RUN_AS_NODE、开发者自己的 VETTA_HOME）与 NODE_OPTIONS，
 * 再把数据根、userData、主目录与平台应用数据根全部指到本次运行的隔离目录。
 * 所有平台都先剔除 APPDATA / LOCALAPPDATA / XDG_*，只按当前 platform 重新设置对应的一组。
 */
export function createIsolatedEnv(baseEnv, { vettaHome, userDataDir, homeDir, platform }) {
	const replaced = new Set([
		"HOME",
		"USERPROFILE",
		...CHILD_ENV_REMOVED,
		...Object.keys(platformDataRoots("", "win32")),
		...Object.keys(platformDataRoots("", "linux")),
	]);
	const env = {};
	for (const [key, value] of Object.entries(baseEnv)) {
		if (value === undefined) continue;
		const upper = key.toUpperCase();
		if (upper.startsWith("VETTA_") || upper.startsWith("ELECTRON_") || replaced.has(upper)) continue;
		env[key] = value;
	}
	env.VETTA_HOME = vettaHome;
	env.VETTA_DESKTOP_USER_DATA_DIR = userDataDir;
	env.HOME = homeDir;
	if (platform === "win32") env.USERPROFILE = homeDir;
	Object.assign(env, platformDataRoots(homeDir, platform));
	return env;
}

/** 解析符号链接 / junction / Windows 8.3 短名；路径不存在时原样返回。 */
function realpathOrSelf(path) {
	try {
		return realpathSync.native(path);
	} catch {
		return path;
	}
}

function isDirectRun(moduleUrl, argv = process.argv) {
	if (!argv[1]) return false;
	const invoked = realpathOrSelf(resolve(argv[1]));
	const self = realpathOrSelf(fileURLToPath(moduleUrl));
	// Windows 文件系统大小写不敏感，盘符与目录大小写可能因调用方式不同。
	return process.platform === "win32" ? invoked.toLowerCase() === self.toLowerCase() : invoked === self;
}

function redact(value) {
	return redactHomePath(realpathOrSelf(value), realpathOrSelf(homedir()), process.platform);
}

function isolationContext() {
	return { platform: process.platform, homeDir: homedir(), env: process.env, repoRoot };
}

/** 校验并准备数据目录；目录（及其真实路径）必须通过隔离判定，且为空或带本脚本标记。 */
function prepareDataDir(dataDir) {
	const problem = dataDirIsolationProblem(dataDir, isolationContext());
	if (problem) throw new Error(problem);
	const absolute = resolve(dataDir);
	// 目录本身或某级父目录可能是指向真实状态目录的符号链接 / junction：
	// 在创建任何目录之前，按最近已存在祖先的真实路径拼出目标真实路径再判一次。
	let existingAncestor = absolute;
	while (!existsSync(existingAncestor) && dirname(existingAncestor) !== existingAncestor) {
		existingAncestor = dirname(existingAncestor);
	}
	const realPath = join(realpathSync.native(existingAncestor), relative(existingAncestor, absolute));
	// 状态根（主目录、APPDATA、VETTA_HOME 等）本身也可能是链接或 8.3 短名，比较前一并解析。
	const realProblem = dataDirIsolationProblem(realPath, { ...isolationContext(), realpath: realpathOrSelf });
	if (realProblem) throw new Error(`--data-dir resolves to ${realPath}: ${realProblem}`);
	if (existsSync(absolute)) {
		if (!statSync(absolute).isDirectory()) throw new Error(`--data-dir is not a directory: ${dataDir}`);
		const entries = readdirSync(absolute);
		if (entries.length > 0 && !entries.includes(DATA_DIR_MARKER)) {
			throw new Error(`--data-dir must be empty or created by this script (missing ${DATA_DIR_MARKER}): ${dataDir}`);
		}
	} else {
		mkdirSync(absolute, { recursive: true });
	}
	writeFileSync(join(absolute, DATA_DIR_MARKER), "Created by scripts/perf/desktop-baseline.mjs (TASK-0448).\n");
	return absolute;
}

/** 解析启动形态：.js/.mjs/.cjs 视为 dev 主进程入口，用仓库内 electron 运行；其余视为打包后的可执行文件。 */
function resolveLaunch(appOption) {
	const target = resolve(appOption ?? join(desktopRoot, "dist", "main", "index.js"));
	if (!existsSync(target)) {
		throw new Error(`--app not found: ${target}; build Desktop first or pass a packaged executable`);
	}
	if (/\.[cm]?js$/i.test(target)) {
		const requireFromDesktop = createRequire(join(desktopRoot, "package.json"));
		// electron 包的默认导出就是可执行文件路径（与 run-dev-electron.mjs 一致）。
		const electronExecutable = requireFromDesktop("electron");
		if (typeof electronExecutable !== "string" || !existsSync(electronExecutable)) {
			throw new Error("electron executable was not found; install dependencies first");
		}
		let electronVersion = null;
		try {
			electronVersion = requireFromDesktop("electron/package.json").version ?? null;
		} catch {
			// 版本只用于记录，读不到不影响测量。
		}
		return {
			form: "dev-dist",
			command: electronExecutable,
			args: [target],
			cwd: desktopRoot,
			app: target,
			electronVersion,
		};
	}
	return { form: "packaged", command: target, args: [], cwd: dirname(target), app: target, electronVersion: null };
}

/** 读取全量进程表（pid、ppid、命令行、工作集、私有内存）；命令行只用于分类，不写入输出。 */
function readProcessTable() {
	const spawnOptions = { encoding: "utf8", shell: false, windowsHide: true, maxBuffer: MAX_TOOL_OUTPUT_BYTES };
	if (process.platform === "win32") {
		const result = spawnSync(
			WIN32_POWERSHELL,
			["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", WIN32_PROCESS_QUERY],
			spawnOptions,
		);
		if (result.error) throw result.error;
		if (result.status !== 0) throw new Error(`process query failed: ${(result.stderr || "").trim()}`);
		return parseWin32ProcessJson(result.stdout);
	}
	const result = spawnSync("ps", ["-A", "-o", "pid=,ppid=,rss=,args="], spawnOptions);
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error(`ps failed: ${(result.stderr || "").trim()}`);
	return parsePsOutput(result.stdout);
}

/**
 * 采样进程树，并把见过的 pid → { commandLine, createdMs } 记入 known，供清理时核对（防止误杀复用 pid 的无关进程）。
 * createdMs 只有 Windows 提供，POSIX 为 null。
 */
function sampleTree(rootPid, known) {
	const tree = collectProcessTree(readProcessTable(), rootPid);
	for (const row of tree) known.set(row.pid, { commandLine: row.commandLine, createdMs: row.createdMs });
	return tree;
}

function toRawProcesses(tree) {
	return tree.map(({ pid, ppid, type, workingSetBytes, privateBytes }) => ({
		pid,
		ppid,
		type,
		workingSetBytes,
		privateBytes,
	}));
}

/** 读取隔离数据根下的主进程日志（按日期分文件，日期用 Asia/Shanghai，故读全部 .log）。 */
function readMainLogs(vettaHome) {
	const directory = join(vettaHome, "desktop-app", "logs", "main");
	if (!existsSync(directory)) return "";
	return readdirSync(directory)
		.filter((name) => name.endsWith(".log"))
		.sort()
		.map((name) => readFileSync(join(directory, name), "utf8"))
		.join("\n");
}

function trySignal(pid, signal) {
	try {
		process.kill(pid, signal);
		return true;
	} catch {
		// ESRCH：进程已退出；EPERM：无权限，留给 leftover 统计暴露。
		return false;
	}
}

/**
 * 仍存活且与记录为同一进程的已知进程：命令行非空且与记录一致，创建时间（Windows）也一致。
 * pid 复用时命令行或创建时间不同，不会被误杀；命令行读不到（空串）时无法确认身份，一律不算。
 */
function aliveKnownProcesses(known) {
	return readProcessTable().filter((row) => {
		const recorded = known.get(row.pid);
		return (
			recorded !== undefined &&
			row.commandLine !== "" &&
			recorded.commandLine === row.commandLine &&
			recorded.createdMs === row.createdMs
		);
	});
}

/** 结束整棵进程树：Windows 在根进程仍存活时用 taskkill /T /F（该 PID 尚未退出）；POSIX 先 SIGTERM 进程组，宽限后 SIGKILL。根进程已退出后只清理身份核对过的已知进程。 */
async function terminateTree(rootPid, known, exited, hasExited) {
	if (process.platform === "win32") {
		// 根进程已退出则 PID 可能被复用，taskkill /PID 不再安全；子进程交给下面的身份核对。
		if (!hasExited()) {
			spawnSync(WIN32_TASKKILL, ["/PID", String(rootPid), "/T", "/F"], {
				stdio: "ignore",
				shell: false,
				windowsHide: true,
			});
		}
	} else {
		// 子进程以 detached 启动，pid 即进程组 id。根进程已退出且已知进程都不在时，
		// 进程组 id 可能已被复用，不再向 -rootPid 发信号。
		const groupMayBeOurs = () => !hasExited() || aliveKnownProcesses(known).length > 0;
		if (groupMayBeOurs()) trySignal(-rootPid, "SIGTERM");
		await Promise.race([exited, delay(KILL_GRACE_MS)]);
		if (groupMayBeOurs()) trySignal(-rootPid, "SIGKILL");
	}
	await Promise.race([exited, delay(KILL_GRACE_MS)]);
	for (const row of aliveKnownProcesses(known)) trySignal(row.pid, "SIGKILL");
	await delay(500);
	return aliveKnownProcesses(known).length;
}

async function waitForOperator(message) {
	const readline = createInterface({ input: process.stdin, output: process.stdout });
	// readline 接管终端时 Ctrl+C 只触发 readline 的 SIGINT，不会到达 process；转交给统一的终止清理。
	readline.once("SIGINT", () => {
		readline.close();
		process.emit("SIGINT", "SIGINT");
	});
	try {
		await readline.question(message);
	} finally {
		readline.close();
	}
}

let activeCleanup = null;

/** 安装 CLI 的退出清理；进程事件是测试替身的唯一系统边界。 */
export function registerTerminationHandlers(getCleanup, target = process) {
	let termination;
	const terminate = (code) => {
		termination ??= Promise.resolve()
			.then(() => getCleanup()?.())
			.finally(() => target.exit(code));
		return termination;
	};
	const interrupt = () => terminate(130);
	const terminateSignal = () => terminate(143);
	target.on("SIGINT", interrupt);
	target.on("SIGTERM", terminateSignal);
	return () => {
		target.off("SIGINT", interrupt);
		target.off("SIGTERM", terminateSignal);
	};
}

/** 单次运行：启动 → 就绪信号 → 空闲采样 →（可选）会话采样 → 结束进程树。 */
async function measureRun(index, { launch, options, sessionDir }) {
	const runDir = join(sessionDir, `run-${index + 1}`);
	const vettaHome = join(runDir, "vetta-home");
	const userDataDir = join(runDir, "electron-user-data");
	const homeDir = join(runDir, "home");
	// 平台应用数据根（APPDATA / XDG_* 等）也预先创建，避免子进程因目录不存在退回默认位置。
	const dataRoots = Object.values(platformDataRoots(homeDir, process.platform));
	for (const directory of [vettaHome, userDataDir, homeDir, ...dataRoots]) mkdirSync(directory, { recursive: true });
	const env = createIsolatedEnv(process.env, { vettaHome, userDataDir, homeDir, platform: process.platform });
	const outputFd = openSync(join(runDir, "app-output.log"), "w");
	const known = new Map();

	const launchedAtMs = Date.now();
	const child = spawn(launch.command, [`--user-data-dir=${userDataDir}`, ...launch.args], {
		cwd: launch.cwd,
		env,
		stdio: ["ignore", outputFd, outputFd],
		shell: false,
		windowsHide: false,
		// POSIX 需要独立进程组才能整组结束；Windows 上 detached 会新开控制台，改用 taskkill /T。
		detached: process.platform !== "win32",
	});
	let exitInfo = null;
	const exited = new Promise((resolveExit) => {
		child.once("exit", (code, signal) => {
			exitInfo = { code, signal };
			resolveExit();
		});
	});
	try {
		await new Promise((resolveSpawn, rejectSpawn) => {
			child.once("spawn", resolveSpawn);
			child.once("error", rejectSpawn);
		});
	} catch (error) {
		closeSync(outputFd);
		throw error;
	}
	child.on("error", () => {
		// spawn 之后的错误（如 kill 失败）由 exit / leftover 统计体现。
	});
	const rootPid = child.pid;
	let cleanupPromise;
	let leftoverProcessCount = null;
	const cleanup = () => {
		cleanupPromise ??= (async () => {
			try {
				leftoverProcessCount = await terminateTree(rootPid, known, exited, () => exitInfo !== null);
			} finally {
				closeSync(outputFd);
			}
		})();
		return cleanupPromise;
	};
	activeCleanup = cleanup;

	const assertAlive = (phase) => {
		if (exitInfo) {
			throw new Error(
				`Desktop exited during ${phase} (code ${exitInfo.code}, signal ${exitInfo.signal}); see ${join(runDir, "app-output.log")}`,
			);
		}
	};

	try {
		// 就绪信号：优先隔离日志里的 "renderer content frame visible"，其次 boot 帧，最后退化为“首个 renderer 进程出现”。
		const deadline = launchedAtMs + options.startupTimeoutMs;
		let firstRendererObservedAtMs = null;
		let contentMarker = null;
		let contentPaint = "not-observed";
		while (Date.now() < deadline && !exitInfo) {
			const tree = sampleTree(rootPid, known);
			if (firstRendererObservedAtMs === null && tree.some((row) => row.type === "renderer")) {
				firstRendererObservedAtMs = Date.now();
			}
			const logText = readMainLogs(vettaHome);
			contentMarker = findLogMarker(logText, LOG_MARKERS.contentVisible, launchedAtMs);
			if (contentMarker) {
				contentPaint = "painted";
				break;
			}
			if (findLogMarker(logText, LOG_MARKERS.contentTimedOut, launchedAtMs)) {
				contentPaint = "timeout";
				break;
			}
			await delay(POLL_INTERVAL_MS);
		}
		assertAlive("startup");
		const bootMarker = findLogMarker(readMainLogs(vettaHome), LOG_MARKERS.bootVisible, launchedAtMs);
		const marker = contentMarker ?? bootMarker;
		const firstRendererObservedMs =
			firstRendererObservedAtMs === null ? null : firstRendererObservedAtMs - launchedAtMs;
		let startup;
		if (marker) {
			startup = {
				method: contentMarker ? "log-marker:content-frame-visible" : "log-marker:boot-frame-visible",
				externalMs: marker.atMs - launchedAtMs,
				internalDurationMs: marker.internalDurationMs,
				firstRendererObservedMs,
				contentPaint,
			};
		} else if (firstRendererObservedMs !== null) {
			startup = {
				method: "first-renderer-process",
				externalMs: firstRendererObservedMs,
				internalDurationMs: null,
				firstRendererObservedMs,
				contentPaint,
			};
		} else {
			throw new Error(
				`no readiness signal within ${options.startupTimeoutMs}ms (no log marker, no renderer process)`,
			);
		}

		await delay(options.idleMs);
		assertAlive("idle settle");
		const idleTree = sampleTree(rootPid, known);
		// 只有 Windows 的进程表带私有内存列；POSIX 下空桶的 privateBytes 记为 null 而不是 0。
		const aggregateOptions = { privateBytesAvailable: process.platform === "win32" };
		const idleByType = aggregateByType(idleTree, aggregateOptions);

		let sessions = null;
		if (options.sessions > 0) {
			await waitForOperator(
				`[run ${index + 1}] Open ${options.sessions} session(s) in the launched Desktop, wait until idle, then press Enter: `,
			);
			assertAlive("session sampling");
			const sessionTree = sampleTree(rootPid, known);
			sessions = {
				requested: options.sessions,
				method: "manual-operator",
				processes: toRawProcesses(sessionTree),
				byType: aggregateByType(sessionTree, aggregateOptions),
			};
		}

		// 启动耗时按测量方法分键：不同方法的口径不同，不能混进同一个分布。
		// method 只取上面三个固定字面量之一，不含用户输入。
		const metrics = {
			[`startup.${startup.method}.externalMs`]: startup.externalMs,
			[`startup.${startup.method}.internalDurationMs`]: startup.internalDurationMs,
			"startup.firstRendererObservedMs": startup.firstRendererObservedMs,
			...flattenMemory(idleByType, "idle"),
			...(sessions ? flattenMemory(sessions.byType, "sessions") : {}),
		};
		await cleanup();
		return {
			index: index + 1,
			launchedAt: new Date(launchedAtMs).toISOString(),
			runDir: redact(runDir),
			startup,
			idle: { settleMs: options.idleMs, processes: toRawProcesses(idleTree), byType: idleByType },
			sessions,
			metrics,
			cleanup: { leftoverProcessCount },
		};
	} finally {
		await cleanup();
		activeCleanup = null;
	}
}

function toolVersion(command, args = ["--version"]) {
	const result = spawnSync(command, args, { encoding: "utf8", shell: false, windowsHide: true });
	if (result.error || result.status !== 0) return null;
	return (result.stdout || "").trim().split(/\r?\n/)[0] || null;
}

/** 递归统计文件数（不跟随符号链接，跳过 WALK_SKIPPED_DIRECTORIES），返回 { files, directories }。 */
function walkTree(root) {
	let files = 0;
	let directories = 0;
	const stack = [root];
	while (stack.length > 0) {
		const current = stack.pop();
		directories += 1;
		let entries;
		try {
			entries = readdirSync(current, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (entry.isDirectory()) {
				if (!WALK_SKIPPED_DIRECTORIES.includes(entry.name)) stack.push(join(current, entry.name));
				continue;
			}
			files += 1;
		}
	}
	return { files, directories };
}

/** 大仓遍历与 rg 搜索各重复 iterations 次；第一次通常是冷缓存，全部原始样本保留在输出里。 */
function measureScan(scanRoot, iterations, keyword) {
	const walkSamplesMs = [];
	let counts = null;
	for (let index = 0; index < iterations; index += 1) {
		const startedAt = performance.now();
		counts = walkTree(scanRoot);
		walkSamplesMs.push(performance.now() - startedAt);
	}
	const walk = {
		method: "node:fs readdirSync recursive walk",
		skippedDirectories: WALK_SKIPPED_DIRECTORIES,
		...counts,
		samplesMs: walkSamplesMs,
		summary: summarizeValues(walkSamplesMs),
	};

	const rgVersion = toolVersion("rg");
	if (!rgVersion) return { walk, search: { available: false, reason: "rg was not found on PATH" } };
	const searchSamplesMs = [];
	let matchedFiles = null;
	for (let index = 0; index < iterations; index += 1) {
		const startedAt = performance.now();
		const result = spawnSync("rg", ["--files-with-matches", "--fixed-strings", "-e", keyword, "--", scanRoot], {
			encoding: "utf8",
			shell: false,
			windowsHide: true,
			maxBuffer: MAX_TOOL_OUTPUT_BYTES,
		});
		const elapsed = performance.now() - startedAt;
		if (result.error) throw result.error;
		// rg 退出码：0 有匹配，1 无匹配，2 出错。
		if (result.status !== 0 && result.status !== 1) {
			throw new Error(`rg exited with ${result.status}: ${(result.stderr || "").trim()}`);
		}
		matchedFiles = (result.stdout || "").split(/\r?\n/).filter(Boolean).length;
		searchSamplesMs.push(elapsed);
	}
	return {
		walk,
		search: {
			available: true,
			tool: "rg",
			version: rgVersion,
			arguments: ["--files-with-matches", "--fixed-strings", "-e", keyword],
			matchedFiles,
			samplesMs: searchSamplesMs,
			summary: summarizeValues(searchSamplesMs),
		},
	};
}

function readCommit() {
	const options = {
		cwd: repoRoot,
		encoding: "utf8",
		shell: false,
		windowsHide: true,
		env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
	};
	const head = spawnSync("git", ["rev-parse", "HEAD"], options);
	if (head.error || head.status !== 0) return { sha: null, trackedChanges: null };
	// GIT_OPTIONAL_LOCKS=0：status 不回写索引，保持只读。
	const status = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=no"], options);
	const trackedChanges =
		status.error || status.status !== 0 ? null : (status.stdout || "").split(/\r?\n/).filter(Boolean).length;
	return { sha: head.stdout.trim(), trackedChanges };
}

function machineInfo() {
	const cpuList = cpus();
	return {
		platform: process.platform,
		osRelease: release(),
		arch: process.arch,
		cpuModel: cpuList[0]?.model?.trim() ?? null,
		logicalCpuCount: cpuList.length,
		totalMemoryBytes: totalmem(),
	};
}

async function main(argv) {
	const options = parseCliArgs(argv);
	if (options.help) {
		console.log(USAGE);
		return;
	}
	if (options.dataDir === null) throw new Error(`--data-dir is required\n\n${USAGE}`);
	if (options.sessions > 0 && !process.stdin.isTTY) {
		throw new Error("--sessions > 0 needs an interactive terminal: the operator opens sessions manually");
	}
	const launch = resolveLaunch(options.app);
	const scanRoot = resolve(options.scanRoot ?? repoRoot);
	if (!existsSync(scanRoot) || !statSync(scanRoot).isDirectory())
		throw new Error(`--scan-root is not a directory: ${scanRoot}`);
	// 扫描根同样不得落在真实状态根内（rg / 遍历会读取其中文件）；扫描本仓库允许，故跳过仓库根判定。
	const scanRootProblem = dataDirIsolationProblem(scanRoot, {
		...isolationContext(),
		repoRoot: undefined,
		realpath: realpathOrSelf,
	});
	if (scanRootProblem) throw new Error(`--scan-root: ${scanRootProblem.replaceAll("--data-dir", "scan root")}`);
	const realScanRoot = realpathSync.native(scanRoot);
	if (realScanRoot !== scanRoot) {
		const realScanProblem = dataDirIsolationProblem(realScanRoot, {
			...isolationContext(),
			repoRoot: undefined,
			realpath: realpathOrSelf,
		});
		if (realScanProblem) throw new Error(`--scan-root: ${realScanProblem.replaceAll("--data-dir", "scan root")}`);
	}
	const dataDir = prepareDataDir(options.dataDir);
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const sessionDir = join(dataDir, `baseline-${stamp}`);
	mkdirSync(sessionDir, { recursive: true });

	const runs = [];
	for (let index = 0; index < options.runs; index += 1) {
		console.log(`[desktop-baseline] run ${index + 1}/${options.runs}`);
		runs.push(await measureRun(index, { launch, options, sessionDir }));
		if (index < options.runs - 1) await delay(COOLDOWN_MS);
	}
	console.log("[desktop-baseline] measuring scan/search");
	const scan = measureScan(scanRoot, options.runs, options.keyword);

	const report = {
		schemaVersion: 1,
		task: "TASK-0448",
		tool: "scripts/perf/desktop-baseline.mjs",
		generatedAt: new Date().toISOString(),
		units: { time: "ms", memory: "bytes" },
		machine: machineInfo(),
		commit: readCommit(),
		app: { form: launch.form, path: redact(launch.app), electronVersion: launch.electronVersion },
		tools: {
			runtime: process.versions.bun ? `bun ${process.versions.bun}` : `node ${process.version}`,
			processSampler:
				process.platform === "win32" ? "powershell Get-CimInstance Win32_Process" : "ps -A -o pid,ppid,rss,args",
			rg: scan.search.available ? scan.search.version : null,
		},
		parameters: {
			runs: options.runs,
			sessions: options.sessions,
			idleMs: options.idleMs,
			startupTimeoutMs: options.startupTimeoutMs,
			pollIntervalMs: POLL_INTERVAL_MS,
			cooldownMs: COOLDOWN_MS,
			maxRelativeRange: options.maxRelativeRange,
			scanRoot: redact(scanRoot),
			keyword: options.keyword,
		},
		isolation: {
			dataDir: redact(dataDir),
			sessionDir: redact(sessionDir),
			childEnvOverrides: childEnvOverrideKeys(process.platform),
			childEnvRemovedPrefixes: ["VETTA_", "ELECTRON_"],
			childEnvRemoved: CHILD_ENV_REMOVED,
			electronSwitches: ["--user-data-dir=<run>/electron-user-data"],
		},
		eventLoopDelay: EVENT_LOOP_UNAVAILABLE,
		runs,
		summary: mergeRuns(runs, { maxRelativeRange: options.maxRelativeRange }),
		scan,
	};

	const outPath = options.out ? resolve(options.out) : join(sessionDir, "baseline.json");
	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, `${JSON.stringify(report, null, "\t")}\n`);

	const idleTotal = report.summary.summary["idle.total.workingSetBytes"];
	console.log(`[desktop-baseline] startup methods: ${JSON.stringify(report.summary.startupMethods)}`);
	for (const method of Object.keys(report.summary.startupMethods)) {
		const startupSummary = report.summary.summary[`startup.${method}.externalMs`];
		if (startupSummary) {
			console.log(
				`[desktop-baseline] startup (${method}) p50/p95: ${startupSummary.p50}ms / ${startupSummary.p95}ms`,
			);
		}
	}
	if (idleTotal) console.log(`[desktop-baseline] idle total working set p50: ${idleTotal.p50} bytes`);
	console.log(`[desktop-baseline] wrote ${outPath}`);
}

if (isDirectRun(import.meta.url)) {
	const removeTerminationHandlers = registerTerminationHandlers(() => activeCleanup);
	main(process.argv.slice(2))
		.catch((error) => {
			console.error(`[desktop-baseline] ${error instanceof Error ? error.message : String(error)}`);
			process.exitCode = 1;
		})
		.finally(removeTerminationHandlers);
}
