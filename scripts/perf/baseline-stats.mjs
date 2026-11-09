// Copyright The Open Forge contributors.
/**
 * Desktop 资源基线（TASK-0448）的纯函数：统计、进程表解析、日志标记解析与数据目录隔离判定。
 * 本文件不做任何 I/O，所有输入都经参数传入，便于单元测试。
 * 单位约定：时长一律毫秒（ms），内存一律字节（bytes）。
 */

import { posix, win32 } from "node:path";

/** 进程分类，顺序即输出顺序。 */
export const PROCESS_TYPES = Object.freeze(["main", "renderer", "gpu", "utility", "other"]);

/** Chromium `--type=` 值到基线分类的映射；未列出的子进程（crashpad、zygote 等）归 other。 */
const CHROMIUM_TYPE_TO_PROCESS_TYPE = Object.freeze({
	renderer: "renderer",
	"gpu-process": "gpu",
	utility: "utility",
});

/** 就绪日志标记，与 apps/desktop/src/main/app-lifecycle.ts 的 logRendererPaintResult 文案一致。 */
export const LOG_MARKERS = Object.freeze({
	contentVisible: "renderer content frame visible",
	bootVisible: "renderer boot frame visible",
	contentTimedOut: "renderer content paint timed out",
	bootSkippedHidden: "renderer boot paint skipped while hidden",
});

function assertFiniteNumber(value, label) {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`${label} must be a finite number: ${String(value)}`);
	}
}

/**
 * Nearest-rank 百分位：rank = ceil(p * n / 100)，p = 0 取最小值。
 * 返回值总是样本中的真实值，不做插值。
 */
export function percentile(values, p) {
	if (!Array.isArray(values) || values.length === 0) throw new Error("percentile requires a non-empty array");
	if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 100) {
		throw new Error(`percentile p must be within [0, 100]: ${String(p)}`);
	}
	for (const value of values) assertFiniteNumber(value, "percentile value");
	return nearestRank(sortAscending(values), p);
}

function sortAscending(values) {
	return [...values].sort((left, right) => left - right);
}

/** 对已校验、已升序的非空样本取 nearest-rank 百分位；校验由 percentile / summarizeValues 负责。 */
function nearestRank(sorted, p) {
	// 先乘后除，整数 p 与 n 时避免 0.95 * 20 一类浮点误差。
	const rank = Math.max(1, Math.ceil((p * sorted.length) / 100));
	return sorted[rank - 1];
}

/** 单个指标的汇总：{ n, min, p50, p95, max, mean }。 */
export function summarizeValues(values) {
	if (!Array.isArray(values) || values.length === 0) throw new Error("summarizeValues requires a non-empty array");
	for (const value of values) assertFiniteNumber(value, "sample value");
	const sorted = sortAscending(values);
	const sum = values.reduce((total, value) => total + value, 0);
	return {
		n: values.length,
		min: sorted[0],
		p50: nearestRank(sorted, 50),
		p95: nearestRank(sorted, 95),
		max: sorted[sorted.length - 1],
		mean: sum / values.length,
	};
}

/**
 * 按指标汇总一组扁平样本记录（`{ [metric]: number | null }`）。
 * null / undefined 表示该样本缺测，跳过；全部缺测的指标不出现在结果中。
 */
export function summarize(samples) {
	if (!Array.isArray(samples) || samples.length === 0) throw new Error("summarize requires a non-empty sample array");
	const valuesByMetric = new Map();
	for (const sample of samples) {
		if (sample === null || typeof sample !== "object" || Array.isArray(sample)) {
			throw new Error("each sample must be a plain object of metric values");
		}
		for (const [metric, value] of Object.entries(sample)) {
			if (value === null || value === undefined) continue;
			assertFiniteNumber(value, `metric ${metric}`);
			if (!valuesByMetric.has(metric)) valuesByMetric.set(metric, []);
			valuesByMetric.get(metric).push(value);
		}
	}
	const result = {};
	for (const metric of [...valuesByMetric.keys()].sort()) {
		result[metric] = summarizeValues(valuesByMetric.get(metric));
	}
	return result;
}

/**
 * 相对极差 (max - min) / mean，用于衡量同条件重复运行的波动。
 * 全部相等时为 0；均值为 0 但值不同（仅可能出现在含负数的输入）时无意义，返回 null。
 */
export function relativeRange(values) {
	const { min, max, mean } = summarizeValues(values);
	if (max === min) return 0;
	if (mean === 0) return null;
	return (max - min) / Math.abs(mean);
}

/**
 * 逐指标评估波动：relativeRange <= maxRelativeRange 视为在记录范围内。
 * 阈值仅用于标注，不是承诺指标。
 */
export function evaluateVariation(samples, maxRelativeRange) {
	if (typeof maxRelativeRange !== "number" || !Number.isFinite(maxRelativeRange) || maxRelativeRange < 0) {
		throw new Error("maxRelativeRange must be a non-negative finite number");
	}
	const summary = summarize(samples);
	const result = {};
	for (const metric of Object.keys(summary)) {
		const values = samples.map((sample) => sample[metric]).filter((value) => value !== null && value !== undefined);
		const range = relativeRange(values);
		result[metric] = {
			n: values.length,
			relativeRange: range,
			withinLimit: range !== null && range <= maxRelativeRange,
		};
	}
	return result;
}

/**
 * 合并多次运行：每次运行提供扁平 `metrics` 记录与 `startup.method`。
 * 返回汇总、波动评估和启动测量方法计数（方法不一致时结果不可直接比较）。
 */
export function mergeRuns(runs, { maxRelativeRange }) {
	if (!Array.isArray(runs) || runs.length === 0) throw new Error("mergeRuns requires at least one run");
	const records = runs.map((run, index) => {
		if (!run || typeof run.metrics !== "object" || run.metrics === null) {
			throw new Error(`run ${index} is missing metrics`);
		}
		return run.metrics;
	});
	const startupMethods = {};
	for (const run of runs) {
		const method = run.startup?.method ?? "unknown";
		startupMethods[method] = (startupMethods[method] ?? 0) + 1;
	}
	return {
		runCount: runs.length,
		startupMethods,
		summary: summarize(records),
		variation: evaluateVariation(records, maxRelativeRange),
		maxRelativeRange,
	};
}

/** 按命令行分类进程：根进程恒为 main，其余看 Chromium `--type=`。 */
export function classifyProcess(commandLine, isRoot) {
	if (isRoot) return "main";
	if (typeof commandLine !== "string") return "other";
	const match = /(?:^|\s|")--type=([A-Za-z0-9_-]+)/.exec(commandLine);
	if (!match) return "other";
	return CHROMIUM_TYPE_TO_PROCESS_TYPE[match[1].toLowerCase()] ?? "other";
}

/**
 * 从全量进程表中取出以 rootPid 为根的进程树（含根），并附加分类。
 * 根不在表中时返回空数组（进程已退出）。用 visited 防止 PID 复用造成的环（含 pid === ppid 的自环）。
 * Windows 不重设孤儿进程的 PPID，父 PID 被复用后旧孤儿会挂到新进程下；两端 createdMs 都已知且
 * 子早于父创建时不是真子进程，跳过。任一端缺 createdMs（如 POSIX）仍按 PPID 收入。
 */
export function collectProcessTree(rows, rootPid) {
	if (!Array.isArray(rows)) throw new Error("process rows must be an array");
	if (!Number.isSafeInteger(rootPid) || rootPid <= 0)
		throw new Error(`root pid must be a positive integer: ${rootPid}`);
	const byPid = new Map();
	const childrenByParent = new Map();
	for (const row of rows) {
		byPid.set(row.pid, row);
		if (!childrenByParent.has(row.ppid)) childrenByParent.set(row.ppid, []);
		childrenByParent.get(row.ppid).push(row);
	}
	const root = byPid.get(rootPid);
	if (!root) return [];
	const tree = [];
	const visited = new Set();
	const queue = [root];
	while (queue.length > 0) {
		const row = queue.shift();
		if (visited.has(row.pid)) continue;
		visited.add(row.pid);
		const isRoot = row.pid === rootPid;
		tree.push({ ...row, type: classifyProcess(row.commandLine, isRoot) });
		for (const child of childrenByParent.get(row.pid) ?? []) {
			if (child.createdMs != null && row.createdMs != null && child.createdMs < row.createdMs) continue;
			queue.push(child);
		}
	}
	return tree;
}

/**
 * 按分类聚合内存。输入为 collectProcessTree 的结果（数值已由解析器收窄为非负有限数或 null）。
 * 某类中任一进程缺测 privateBytes 则该类为 null。privateBytesAvailable 为 false（POSIX，ps 无该列）时
 * 各类与 total 的 privateBytes 一律为 null，空桶也不报假 0。
 */
export function aggregateByType(processes, { privateBytesAvailable = true } = {}) {
	if (!Array.isArray(processes)) throw new Error("processes must be an array");
	const initialPrivateBytes = privateBytesAvailable ? 0 : null;
	const empty = () => ({ count: 0, workingSetBytes: 0, privateBytes: initialPrivateBytes });
	const result = Object.fromEntries(PROCESS_TYPES.map((type) => [type, empty()]));
	result.total = empty();
	for (const processInfo of processes) {
		if (!PROCESS_TYPES.includes(processInfo.type)) throw new Error(`unknown process type: ${processInfo.type}`);
		for (const bucket of [result[processInfo.type], result.total]) {
			bucket.count += 1;
			bucket.workingSetBytes += processInfo.workingSetBytes;
			bucket.privateBytes =
				bucket.privateBytes === null || processInfo.privateBytes === null
					? null
					: bucket.privateBytes + processInfo.privateBytes;
		}
	}
	return result;
}

/** 把 aggregateByType 的结果展开为扁平指标，如 `idle.renderer.workingSetBytes`。 */
export function flattenMemory(aggregate, prefix) {
	const record = {};
	for (const type of [...PROCESS_TYPES, "total"]) {
		const bucket = aggregate[type];
		record[`${prefix}.${type}.count`] = bucket.count;
		record[`${prefix}.${type}.workingSetBytes`] = bucket.workingSetBytes;
		record[`${prefix}.${type}.privateBytes`] = bucket.privateBytes;
	}
	return record;
}

function toNonNegativeNumber(value) {
	const number = typeof value === "string" ? Number(value) : value;
	return typeof number === "number" && Number.isFinite(number) && number >= 0 ? number : null;
}

/**
 * 解析 `Get-CimInstance Win32_Process | Select-Object ... | ConvertTo-Json` 输出。
 * ConvertTo-Json 对单个对象不输出数组，对空管道输出空串，两种情况都要接住。
 * WorkingSetSize、PrivatePageCount 均为字节；CreatedMs 为进程创建时间（epoch 毫秒，由查询脚本从
 * CreationDate 换算），缺失或非法时 createdMs 为 null。
 */
export function parseWin32ProcessJson(text) {
	if (typeof text !== "string") throw new Error("process json must be a string");
	const trimmed = text.trim();
	if (trimmed === "") return [];
	const parsed = JSON.parse(trimmed);
	const items = Array.isArray(parsed) ? parsed : [parsed];
	const rows = [];
	for (const item of items) {
		if (!item || typeof item !== "object") continue;
		const pid = toNonNegativeNumber(item.ProcessId);
		const ppid = toNonNegativeNumber(item.ParentProcessId);
		const workingSetBytes = toNonNegativeNumber(item.WorkingSetSize);
		if (pid === null || ppid === null || workingSetBytes === null) continue;
		rows.push({
			pid,
			ppid,
			commandLine: typeof item.CommandLine === "string" ? item.CommandLine : "",
			workingSetBytes,
			privateBytes: toNonNegativeNumber(item.PrivatePageCount),
			createdMs: toNonNegativeNumber(item.CreatedMs),
		});
	}
	return rows;
}

/**
 * 解析 `ps -A -o pid=,ppid=,rss=,args=` 输出。rss 单位 KiB，换算为字节；ps 无私有内存列，privateBytes 为 null；
 * 不查询创建时间，createdMs 为 null（与 Win32 行结构一致）。
 */
export function parsePsOutput(text) {
	if (typeof text !== "string") throw new Error("ps output must be a string");
	const rows = [];
	for (const line of text.split(/\r?\n/)) {
		const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
		if (!match) continue;
		rows.push({
			pid: Number(match[1]),
			ppid: Number(match[2]),
			commandLine: match[4],
			workingSetBytes: Number(match[3]) * 1024,
			privateBytes: null,
			createdMs: null,
		});
	}
	return rows;
}

const LOG_LINE_PATTERN =
	/^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:Z|[+-]\d{2}:\d{2}))\] \[([^\]]+)\] \[([^\]]*)\] (.*)$/;

/**
 * 解析 Desktop 主进程日志行 `[ISO+offset] [level] [scope] message ...data`。
 * 时间戳带时区偏移，Date.parse 得到 epoch 毫秒。
 */
export function parseLogLine(line) {
	if (typeof line !== "string") return null;
	const match = LOG_LINE_PATTERN.exec(line.replace(/\r$/, ""));
	if (!match) return null;
	const atMs = Date.parse(match[1]);
	if (!Number.isFinite(atMs)) return null;
	return { atMs, level: match[2], scope: match[3], message: match[4] };
}

/**
 * 在日志文本中找第一条以 message 开头、时间不早于 notBeforeMs 的记录。
 * durationMs 取自 util.inspect 打印的 `{ durationMs: 123, ... }`，缺失时为 null。
 */
export function findLogMarker(logText, message, notBeforeMs = Number.NEGATIVE_INFINITY) {
	if (typeof logText !== "string" || logText === "") return null;
	for (const line of logText.split("\n")) {
		const parsed = parseLogLine(line);
		if (!parsed || parsed.atMs < notBeforeMs) continue;
		if (!parsed.message.startsWith(message)) continue;
		const duration = /\bdurationMs:\s*(\d+(?:\.\d+)?)/.exec(parsed.message.slice(message.length));
		return { atMs: parsed.atMs, internalDurationMs: duration ? Number(duration[1]) : null };
	}
	return null;
}

function pathApi(platform) {
	return platform === "win32" ? win32 : posix;
}

function expandHome(value, homeDir, path) {
	if (value === "~") return homeDir;
	if (value.startsWith("~/") || value.startsWith("~\\")) return path.join(homeDir, value.slice(2));
	return value;
}

/**
 * 判定 --data-dir 是否与用户真实状态目录隔离；隔离返回 null，否则返回原因。
 *
 * - strict 根：数据目录既不能位于其中，也不能包含它（Desktop 数据根、旧品牌根、dev/ui-verify 根、
 *   当前 VETTA_HOME、Electron 默认 userData 根、仓库根）。
 * - ancestor 根：数据目录不能等于或包含它（用户主目录、%LOCALAPPDATA%；系统临时目录通常在其下，允许）。
 * - 必须是绝对路径且不是文件系统根。win32 比较不区分大小写。
 * - 所有 strict / ancestor 根在比较前先经 realpath（调用方注入，默认原样返回），使经链接指向的真实
 *   状态目录也被识别；dataDir 自身的真实路径由调用方解析后再次调用本函数判定。
 * - repoRoot 可省略，省略时不判定仓库根。
 * - VETTA_CONFIG_DIR 与运行时一致按 join(homeDir, 值) 计算，绝对值也拼到主目录下。
 */
export function dataDirIsolationProblem(dataDir, { platform, homeDir, env = {}, repoRoot, realpath = (p) => p }) {
	if (typeof dataDir !== "string" || dataDir.trim() === "") return "--data-dir is required";
	const path = pathApi(platform);
	if (!path.isAbsolute(dataDir)) return `--data-dir must be an absolute path: ${dataDir}`;
	if (typeof homeDir !== "string" || !path.isAbsolute(homeDir)) throw new Error("homeDir must be an absolute path");
	const normalize = (value) => {
		const resolved = path.resolve(value);
		return platform === "win32" ? resolved.toLowerCase() : resolved;
	};
	const isInside = (child, parent) => {
		const relativePath = path.relative(parent, child);
		return (
			relativePath === "" ||
			(relativePath !== ".." && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath))
		);
	};
	const target = normalize(dataDir);
	if (path.dirname(target) === target) return `--data-dir must not be a filesystem root: ${dataDir}`;

	const strictRoots = [
		[path.join(homeDir, ".openforge"), "Desktop data root ~/.openforge"],
		[path.join(homeDir, ".vetta"), "legacy data root ~/.vetta"],
		[path.join(homeDir, ".openforge-dev"), "dev data root ~/.openforge-dev"],
		[path.join(homeDir, ".openforge-ui-verify"), "UI verification root ~/.openforge-ui-verify"],
	];
	if (env.VETTA_HOME) {
		const vettaHome = expandHome(env.VETTA_HOME, homeDir, path);
		if (path.isAbsolute(vettaHome)) strictRoots.push([vettaHome, "current VETTA_HOME"]);
	}
	// 与 packages/action-rpc/src/endpoint-file.ts 的 join(homeDir, configDirName) 一致：绝对值不会脱离主目录。
	if (env.VETTA_CONFIG_DIR) {
		strictRoots.push([path.join(homeDir, env.VETTA_CONFIG_DIR), "current VETTA_CONFIG_DIR"]);
	}
	if (platform === "win32") {
		if (env.APPDATA && path.isAbsolute(env.APPDATA))
			strictRoots.push([env.APPDATA, "Electron userData root %APPDATA%"]);
	} else if (platform === "darwin") {
		strictRoots.push([path.join(homeDir, "Library", "Application Support"), "Electron userData root"]);
	} else {
		const configHome =
			env.XDG_CONFIG_HOME && path.isAbsolute(env.XDG_CONFIG_HOME)
				? env.XDG_CONFIG_HOME
				: path.join(homeDir, ".config");
		strictRoots.push([configHome, "Electron userData root $XDG_CONFIG_HOME"]);
	}
	if (typeof repoRoot === "string" && path.isAbsolute(repoRoot)) strictRoots.push([repoRoot, "repository root"]);

	const ancestorRoots = [[homeDir, "user home directory"]];
	if (platform === "win32" && env.LOCALAPPDATA && path.isAbsolute(env.LOCALAPPDATA)) {
		ancestorRoots.push([env.LOCALAPPDATA, "%LOCALAPPDATA%"]);
	}

	for (const [root, label] of strictRoots) {
		const normalizedRoot = normalize(realpath(root));
		if (isInside(target, normalizedRoot) || isInside(normalizedRoot, target)) {
			return `--data-dir overlaps ${label} (${root}); use a dedicated empty directory such as a temp folder`;
		}
	}
	for (const [root, label] of ancestorRoots) {
		if (isInside(normalize(realpath(root)), target)) {
			return `--data-dir must not equal or contain the ${label} (${root})`;
		}
	}
	return null;
}

/** 输出前把主目录前缀替换为 `~`，避免基线 JSON 带出用户名。 */
export function redactHomePath(value, homeDir, platform) {
	if (typeof value !== "string" || typeof homeDir !== "string" || homeDir === "") return value;
	const path = pathApi(platform);
	const comparableValue = platform === "win32" ? value.toLowerCase() : value;
	const comparableHome = platform === "win32" ? homeDir.toLowerCase() : homeDir;
	if (comparableValue === comparableHome) return "~";
	const prefix = comparableHome.endsWith(path.sep) ? comparableHome : `${comparableHome}${path.sep}`;
	if (comparableValue.startsWith(prefix)) return `~${path.sep}${value.slice(prefix.length)}`;
	return value;
}
