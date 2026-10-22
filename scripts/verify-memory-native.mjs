// Copyright The Open Forge contributors.
/**
 * TASK-0368：记忆 SQLite 驱动多运行时隔离 probe（S0b 前置打包门禁）。
 *
 * 在仓库之外的隔离临时目录安装固定版本的候选驱动（默认 better-sqlite3），
 * 用目标运行时（node / bun / electron 主进程）实际加载并验证：显式
 * nativeBinding、WAL/foreign_keys/busy_timeout、事务与回滚、FTS5 unicode61
 * 与 trigram、中文 1/2/3 字边界（<3 字不走 trigram MATCH，走参数化 instr
 * 回退，见 SHORT_WORD_CASES）、FTS 字面量转义（引号内不展开 OR/NEAR 等
 * 语法）、重开持久化、backup 恢复、worker_threads 内加载与干净关闭、以及
 * 不匹配二进制必须给出明确错误。
 *
 * 隔离保证：工作目录必须位于仓库之外；不读取/写入仓库 node_modules，不改
 * 生产 node:sqlite 垫片；Electron 探测使用仓库内既有二进制但把 userData
 * 重定向到隔离目录，绝不触碰真实用户状态。每个运行时都是真实进程：不以
 * ELECTRON_RUN_AS_NODE 冒充 Electron，不以 node 结果冒充 bun。
 *
 * 用法：
 *   node scripts/verify-memory-native.mjs [--help]
 *   node scripts/verify-memory-native.mjs --runtime node,bun,electron \
 *        [--driver better-sqlite3@13.0.3] [--work-dir <dir>] [--keep] \
 *        [--json <path>] [--node-path <exe>] [--bun-path <exe>] \
 *        [--electron-path <exe>] [--registry <url>] [--skip-install] \
 *        [--timeout-ms <n>]
 *
 * 退出码：0 = 已执行运行时全部通过；3 = 任一已执行运行时失败或超时；
 * 4 = 没有任何运行时被执行（全部跳过）。跳过会在报告中给出原因。
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

/** 默认固定驱动版本：候选合同在 PLAN-0021 S0b，变更需回写任务记录。 */
export const DEFAULT_DRIVER = "better-sqlite3@13.0.3";

/** 运行时固定顺序；报告与计划均按此排序。 */
export const RUNTIME_ORDER = ["node", "bun", "electron"];

/**
 * 中文短词合同用例（事实源：SQLite FTS5 官方 tokenizer 合同——trigram 的
 * full-text query 少于 3 个 Unicode 字符不会匹配；unicode61 不做 CJK 分词，
 * 短词落在更长 CJK token 内不命中）。instrFallback 列是词法回退合同：参数
 * 化 instr 扫描在授权行内可命中任意长度。子探测（probe-child）对
 * 「记/记忆/记忆升/记忆升级」四个实例断言的就是本表行为；合同测试同步
 * 校验表内不变量。
 */
export const SHORT_WORD_CASES = [
	{ term: "记", length: 1, trigramMatch: false, unicode61Match: false, instrFallback: true },
	{ term: "记忆", length: 2, trigramMatch: false, unicode61Match: false, instrFallback: true },
	{ term: "记忆升", length: 3, trigramMatch: true, unicode61Match: false, instrFallback: true },
	{ term: "记忆升级", length: 4, trigramMatch: true, unicode61Match: false, instrFallback: true },
];

/** 子探测必须覆盖的检查 ID 集合；缺一即视为模板不完整。 */
export const CHECK_IDS = [
	"runtime-info",
	"load-binding",
	"pragmas-wal",
	"transactions",
	"fts5-unicode61",
	"fts5-trigram",
	"short-word-instr",
	"fts5-literal-escape",
	"persistence-reopen",
	"backup-restore",
	"worker-threads",
	"abi-mismatch-error",
];

/**
 * 把任意用户输入转成 FTS5 字符串字面量（双引号包裹、内部引号翻倍）。
 * 引号内文本按字面处理，不展开 OR、NEAR、星号、脱字符等 FTS5 语法；这是
 * 记忆检索「原始查询转义为字面量」合同的最小机制证明。子探测通过
 * toString() 注入同一份实现，测试只测导出函数即可覆盖两侧。
 */
export function escapeFts5StringLiteral(input) {
	if (typeof input !== "string") {
		throw new TypeError("FTS5 字面量转义只接受 string 输入");
	}
	return '"' + input.replace(/"/g, '""') + '"';
}

export class ProbeArgError extends Error {
	constructor(message) {
		super(message);
		this.name = "ProbeArgError";
	}
}

/** 在 PATH 中解析可执行文件（Windows 补 .exe；找不到返回 null）。 */
export function resolveCommandFromPath(name, pathEnv = process.env.PATH ?? "") {
	const separator = process.platform === "win32" ? ";" : ":";
	const candidates = process.platform === "win32" ? [`${name}.exe`, name] : [name];
	for (const dir of pathEnv.split(separator)) {
		if (dir.length === 0) {
			continue;
		}
		for (const candidate of candidates) {
			const full = join(dir, candidate);
			if (existsSync(full)) {
				return full;
			}
		}
	}
	return null;
}

/**
 * 解析驱动规格：必须是 `name@x.y.z` 精确版本。禁止 range/latest——任务
 * 合同要求固定候选版本，报告才可复算。
 */
export function parseDriverSpec(spec) {
	const at = spec.lastIndexOf("@");
	if (at <= 0) {
		throw new ProbeArgError(`--driver 必须形如 name@x.y.z，收到：${spec}`);
	}
	const name = spec.slice(0, at);
	const version = spec.slice(at + 1);
	if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) {
		throw new ProbeArgError(`--driver 包名非法：${name}`);
	}
	if (!/^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/.test(version)) {
		throw new ProbeArgError(`--driver 版本必须精确固定（x.y.z），不允许 range/latest：${spec}`);
	}
	return { name, version, spec };
}

/** 解析命令行参数；非法输入抛 ProbeArgError。 */
export function parseArgs(argv) {
	const options = {
		help: false,
		driver: DEFAULT_DRIVER,
		runtimes: [...RUNTIME_ORDER],
		workDir: null,
		keep: false,
		jsonPath: null,
		nodePath: null,
		bunPath: null,
		electronPath: null,
		registry: null,
		skipInstall: false,
		timeoutMs: 120_000,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const next = () => {
			index += 1;
			if (index >= argv.length || argv[index].startsWith("--")) {
				throw new ProbeArgError(`参数 ${arg} 缺少取值`);
			}
			return argv[index];
		};
		switch (arg) {
			case "--help":
			case "-h":
				options.help = true;
				break;
			case "--driver":
				options.driver = parseDriverSpec(next()).spec;
				break;
			case "--runtime": {
				const raw = next().toLowerCase();
				const list = raw === "all" ? [...RUNTIME_ORDER] : raw.split(",").map((item) => item.trim()).filter(Boolean);
				const unknown = list.filter((item) => !RUNTIME_ORDER.includes(item));
				if (unknown.length > 0) {
					throw new ProbeArgError(`--runtime 含未知运行时：${unknown.join(",")}（可选：${RUNTIME_ORDER.join("/")}/all）`);
				}
				options.runtimes = [...new Set(list)];
				break;
			}
			case "--work-dir":
				options.workDir = resolve(next());
				break;
			case "--keep":
				options.keep = true;
				break;
			case "--json":
				options.jsonPath = resolve(next());
				break;
			case "--node-path":
				options.nodePath = resolve(next());
				break;
			case "--bun-path":
				options.bunPath = resolve(next());
				break;
			case "--electron-path":
				options.electronPath = resolve(next());
				break;
			case "--registry":
				options.registry = next();
				break;
			case "--skip-install":
				options.skipInstall = true;
				break;
			case "--timeout-ms":
				options.timeoutMs = Number.parseInt(next(), 10);
				if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 5_000) {
					throw new ProbeArgError("--timeout-ms 必须 ≥ 5000");
				}
				break;
			default:
				throw new ProbeArgError(`未知参数：${arg}（--help 查看用法）`);
		}
	}
	return options;
}

/** 目录是否位于仓库内（含仓库根本身）。用于隔离门禁。 */
export function isInsideRepository(dir, root = repositoryRoot) {
	const rel = relative(resolve(root), resolve(dir));
	return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * 解析各运行时的实际可执行入口。node 默认取当前 process.execPath；bun
 * 默认扫 PATH；electron 默认取仓库 apps/desktop 的已安装二进制。探测不到
 * 的运行时记为跳过并给出原因，不静默冒充。
 */
export function buildRuntimePlan({ runtimes, nodePath = null, bunPath = null, electronPath = null, resolveBun = resolveCommandFromPath }) {
	const electronDefault =
		process.platform === "win32"
			? join(repositoryRoot, "apps", "desktop", "node_modules", "electron", "dist", "electron.exe")
			: join(repositoryRoot, "apps", "desktop", "node_modules", "electron", "dist", "Electron");
	const commands = {
		node: { path: nodePath || process.execPath, reason: "未提供 --node-path 且当前进程无 execPath" },
		bun: { path: bunPath || resolveBun("bun") || null, reason: "未提供 --bun-path 且 PATH 中找不到 bun" },
		electron: {
			path: electronPath || electronDefault,
			reason: "未提供 --electron-path 且仓库内未找到 electron 二进制（apps/desktop 依赖未安装？）",
		},
	};
	return RUNTIME_ORDER.filter((runtime) => runtimes.includes(runtime)).map((runtime) => {
		const entry = commands[runtime];
		const usable = Boolean(entry.path) && (runtime === "bun" ? true : existsSync(entry.path));
		return {
			runtime,
			command: entry.path,
			available: usable,
			skipReason: usable ? null : entry.reason,
		};
	});
}

/** 汇总退出码：0 全过；3 有失败；4 一个都没执行。 */
export function summarizeExitCode(report) {
	const executed = report.runtimes.filter((runtime) => runtime.status !== "skipped");
	if (executed.length === 0) {
		return 4;
	}
	return executed.every((runtime) => runtime.ok) ? 0 : 3;
}

function formatCheckLine(check) {
	const mark = check.status === "pass" ? "PASS" : check.status === "fail" ? "FAIL" : "SKIP";
	const detail = check.detail ? ` — ${check.detail}` : "";
	return `  [${mark}] ${check.id}${detail}`;
}

/** 人类可读报告（stdout）。 */
export function renderReport(report) {
	const lines = [];
	lines.push(`驱动：${report.driver.spec}（解析版本 ${report.driver.version}）`);
	lines.push(`SQLite：${report.sqliteVersion ?? "（未知）"} | binding：${report.binding?.path ?? "（未知）"}`);
	if (report.binding?.sha256) {
		lines.push(`binding sha256：${report.binding.sha256}`);
	}
	lines.push(`宿主：${report.host.platform}/${report.host.arch} node=${report.host.node} bun=${report.host.bun ?? "-"}`);
	for (const runtime of report.runtimes) {
		if (runtime.status === "skipped") {
			lines.push(`\n== ${runtime.runtime} == 跳过：${runtime.skipReason}`);
			continue;
		}
		const verdict = runtime.ok ? "通过" : "失败";
		const versions = Object.entries(runtime.versions ?? {})
			.filter(([, value]) => value != null)
			.map(([key, value]) => `${key}=${value}`)
			.join(" ");
		lines.push(`\n== ${runtime.runtime} == ${verdict}${versions ? ` | ${versions}` : ""}`);
		for (const check of runtime.checks ?? []) {
			lines.push(formatCheckLine(check));
		}
	}
	lines.push(`\n退出码判定：${summarizeExitCode(report)}`);
	return lines.join("\n");
}

function runChild(command, args, options) {
	return new Promise((resolveRun) => {
		const child = spawn(command, args, { ...options, windowsHide: true, shell: false });
		let stdout = "";
		let stderr = "";
		let timer = null;
		const finish = (code, signal, timedOut) => {
			if (timer !== null) {
				clearTimeout(timer);
				timer = null;
			}
			resolveRun({ code, signal, timedOut, stdoutTail: stdout.slice(-2048), stderrTail: stderr.slice(-2048) });
		};
		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString("utf8");
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString("utf8");
		});
		timer = setTimeout(() => {
			if (process.platform === "win32") {
				spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
			} else {
				child.kill("SIGKILL");
			}
			finish(null, "SIGKILL", true);
		}, options.timeoutMs ?? 120_000);
		child.on("error", (error) => {
			if (timer !== null) {
				clearTimeout(timer);
				timer = null;
			}
			resolveRun({ code: null, signal: null, timedOut: false, spawnError: String(error), stdoutTail: stdout.slice(-2048), stderrTail: stderr.slice(-2048) });
		});
		child.on("close", (code, signal) => finish(code, signal, false));
	});
}

/** 在隔离目录安装固定版本驱动；返回绑定解析信息。 */
async function ensureDriverInstall(driverDir, driver, { registry, skipInstall }) {
	if (isInsideRepository(driverDir)) {
		throw new ProbeArgError(`驱动安装目录必须位于仓库之外：${driverDir}`);
	}
	await mkdir(driverDir, { recursive: true });
	const packageRoot = join(driverDir, "node_modules", driver.name);
	const installed = existsSync(join(packageRoot, "package.json"));
	if (!(skipInstall && installed)) {
		await writeFile(join(driverDir, "package.json"), `${JSON.stringify({ name: "of-memory-native-probe", private: true }, null, "\t")}\n`);
		const env = { ...process.env };
		if (registry) {
			env.npm_config_registry = registry;
			env.BUN_CONFIG_REGISTRY = registry;
		}
		const result = await runChild("bun", ["add", "--trust", "--cwd", driverDir, driver.spec], { timeoutMs: 180_000, env });
		if (result.code !== 0) {
			throw new Error(`bun add 失败（exit=${result.code}）：${result.stderrTail}`);
		}
	}
	const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
	if (manifest.version !== driver.version) {
		throw new Error(`驱动版本漂移：期望 ${driver.version}，实际安装 ${manifest.version}`);
	}
	const prebuildDir = join(packageRoot, "prebuilds");
	const primary = join(prebuildDir, `${process.platform}-${process.arch}.node`);
	const gypFallback = join(packageRoot, "build", "Release", "better_sqlite3.node");
	let bindingPath = null;
	if (existsSync(primary)) {
		bindingPath = primary;
	} else if (existsSync(gypFallback)) {
		bindingPath = gypFallback;
	} else {
		throw new Error(`未找到本机绑定（尝试 ${primary} 与 ${gypFallback}）`);
	}
	const altArch = process.arch === "x64" ? "arm64" : "x64";
	const altBinding = join(prebuildDir, `${process.platform}-${altArch}.node`);
	const hasAlt = existsSync(altBinding);
	return {
		packageRoot,
		modulesRoot: join(driverDir, "node_modules"),
		bindingPath,
		altBindingPath: hasAlt ? altBinding : null,
		altBindingArch: hasAlt ? `${process.platform}-${altArch}` : null,
	};
}

/** 子探测源码（node/bun 直接运行；electron 由 electronProbeSource 包装）。 */
export function childProbeSource() {
	return `
"use strict";
// TASK-0368 运行时内探测（由 verify-memory-native.mjs 生成；node/bun/electron 共用）。
// 短词断言实例（记/记忆/记忆升/记忆升级）与驱动侧 SHORT_WORD_CASES 一致。
const fs = require("node:fs");
const path = require("node:path");
const { Worker } = require("node:worker_threads");
const escapeFts5StringLiteral = ${escapeFts5StringLiteral.toString()};

const CORPUS = [
	{ id: 1, content: "记忆升级需要SQLite驱动与FTS5索引", authorized: 1 },
	{ id: 2, content: "记忆检索使用trigram与instr回退", authorized: 1 },
	{ id: 3, content: "路径 packages/runtime-node/src/memory 拓扑", authorized: 1 },
	{ id: 4, content: "错误码 ERR_DLOPEN_FAILED 表示ABI不匹配", authorized: 1 },
	{ id: 5, content: '引号"与星号*和NEAR是FTS5语法词', authorized: 1 },
	{ id: 6, content: "unauthorized row for scope check", authorized: 0 },
	{ id: 7, content: "alpha OR beta 字面量", authorized: 1 },
	{ id: 8, content: "alpha 单独出现", authorized: 1 },
];

async function runChecks(env) {
	const checks = [];
	const pass = (id, detail) => ({ id, status: "pass", detail: detail == null ? "" : String(detail) });
	const fail = (id, detail) => ({ id, status: "fail", detail: String(detail) });

	const BetterSqlite3 = require(path.join(env.driverRoot, "better-sqlite3"));
	const versions = {
		node: process.versions.node,
		modules: process.versions.modules,
		bun: process.versions.bun || null,
		electron: process.versions.electron || null,
		processType: process.type || null,
	};
	checks.push(pass("runtime-info", Object.entries(versions).filter(([, v]) => v).map(([k, v]) => k + "=" + v).join(" ")));

	const dbPath = env.dbPath;
	for (const stale of [dbPath, dbPath + "-wal", dbPath + "-shm", dbPath + ".backup.db", dbPath + ".worker.db"]) {
		if (fs.existsSync(stale)) fs.rmSync(stale, { force: true });
	}
	let db = new BetterSqlite3(dbPath, { nativeBinding: env.bindingPath });
	const sqliteVersion = db.prepare("SELECT sqlite_version() AS v").get().v;
	const compileOptions = db.pragma("compile_options").map((row) => Object.values(row)[0]);
	checks.push(
		compileOptions.includes("ENABLE_FTS5")
			? pass("load-binding", "sqlite " + sqliteVersion + "；显式 nativeBinding 加载成功")
			: fail("load-binding", "compile_options 缺 ENABLE_FTS5: " + compileOptions.join(",")),
	);

	db.pragma("journal_mode = WAL");
	db.pragma("foreign_keys = ON");
	db.pragma("busy_timeout = 5000");
	const journal = db.pragma("journal_mode", { simple: true });
	const foreignKeys = db.pragma("foreign_keys", { simple: true });
	const busyTimeout = db.pragma("busy_timeout", { simple: true });
	checks.push(
		journal === "wal" && foreignKeys === 1 && busyTimeout === 5000
			? pass("pragmas-wal", "wal=" + journal + " fk=" + foreignKeys + " busy=" + busyTimeout)
			: fail("pragmas-wal", "wal=" + journal + " fk=" + foreignKeys + " busy=" + busyTimeout),
	);

	db.exec("CREATE TABLE memory (id INTEGER PRIMARY KEY, content TEXT, authorized INTEGER)");
	db.exec("CREATE TABLE memory_parent (id INTEGER PRIMARY KEY)");
	db.exec("CREATE TABLE memory_child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES memory_parent(id))");
	db.exec("CREATE VIRTUAL TABLE memory_fts USING fts5(content, tokenize = 'unicode61')");
	db.exec("CREATE VIRTUAL TABLE memory_tri USING fts5(content, tokenize = 'trigram')");
	db.transaction(() => {
		for (const row of CORPUS) {
			db.prepare("INSERT INTO memory (id, content, authorized) VALUES (?, ?, ?)").run(row.id, row.content, row.authorized);
		}
	})();
	db.exec("BEGIN");
	db.prepare("INSERT INTO memory (id, content, authorized) VALUES (99, 'rollback-me', 1)").run();
	db.exec("ROLLBACK");
	const rolledBack = db.prepare("SELECT COUNT(*) AS n FROM memory WHERE id = 99").get().n === 0;
	const second = new BetterSqlite3(dbPath, { nativeBinding: env.bindingPath, readonly: true });
	const visible = second.prepare("SELECT COUNT(*) AS n FROM memory").get().n === CORPUS.length;
	second.close();
	db.exec("INSERT INTO memory_parent (id) VALUES (1)");
	db.prepare("INSERT INTO memory_child (id, parent_id) VALUES (1, 1)").run();
	let fkBlocked = false;
	try {
		db.prepare("DELETE FROM memory_parent WHERE id = 1").run();
	} catch (error) {
		fkBlocked = error instanceof Error && /FOREIGNKEY|constraint/i.test(error.code || error.message);
	}
	checks.push(
		rolledBack && visible && fkBlocked
			? pass("transactions", "回滚=" + rolledBack + " 第二连接可见=" + visible + " FK约束=" + fkBlocked)
			: fail("transactions", "回滚=" + rolledBack + " 第二连接可见=" + visible + " FK约束=" + fkBlocked),
	);

	for (const row of CORPUS) {
		db.prepare("INSERT INTO memory_fts (rowid, content) VALUES (?, ?)").run(row.id, row.content);
		db.prepare("INSERT INTO memory_tri (rowid, content) VALUES (?, ?)").run(row.id, row.content);
	}
	const u61 = (query) => db.prepare("SELECT rowid FROM memory_fts WHERE memory_fts MATCH ? ORDER BY rowid").all(query).map((r) => r.rowid);
	const tri = (query) => db.prepare("SELECT rowid FROM memory_tri WHERE memory_tri MATCH ? ORDER BY rowid").all(query).map((r) => r.rowid);
	const instr = (term) =>
		db.prepare("SELECT id FROM memory WHERE authorized = 1 AND instr(content, ?) > 0 ORDER BY id").all(term).map((row) => row.id);

	const u61Exact = JSON.stringify(u61("记忆升级需要SQLite驱动与FTS5索引")) === "[1]";
	const u61NoSegment = u61("记忆升级").length === 0;
	checks.push(
		u61Exact && u61NoSegment
			? pass("fts5-unicode61", "整串命中=" + u61Exact + "；CJK未分词（短词0命中，符合unicode61行为）")
			: fail("fts5-unicode61", "整串命中=" + u61Exact + " 短词0命中=" + u61NoSegment),
	);

	const triThree = tri("记忆升").includes(1);
	// 路径/标识符类查询必须先转义：裸 runtime-node 会被 FTS5 解析成 -node 列
	// 过滤并报 no such column——这是字面量转义合同要拦下的真实失败形态。
	const triSubLiteral = tri(escapeFts5StringLiteral("runtime-node")).includes(3);
	let rawPathError = false;
	try {
		tri("runtime-node");
	} catch (error) {
		rawPathError = true;
	}
	const triTwoCount = tri("记忆").length;
	const triOneCount = tri("记").length;
	checks.push(
		triThree && triSubLiteral && rawPathError && triTwoCount === 0 && triOneCount === 0
			? pass("fts5-trigram", "3字命中=" + triThree + " 转义子串命中=" + triSubLiteral + "；裸路径查询报错=" + rawPathError + "；2字/1字 MATCH 命中数=" + triTwoCount + "/" + triOneCount + "（官方<3字不匹配边界）")
			: fail("fts5-trigram", "3字=" + triThree + " 转义子串=" + triSubLiteral + " 裸路径报错=" + rawPathError + " 2字=" + triTwoCount + " 1字=" + triOneCount),
	);

	const instrOne = JSON.stringify(instr("记")) === "[1,2]";
	const instrTwo = JSON.stringify(instr("记忆")) === "[1,2]";
	const instrScoped = !instr("unauthorized").includes(6);
	checks.push(
		instrOne && instrTwo && instrScoped
			? pass("short-word-instr", "1字=" + instrOne + " 2字=" + instrTwo + "；授权过滤=" + instrScoped)
			: fail("short-word-instr", "1字=" + instrOne + " 2字=" + instrTwo + " 授权过滤=" + instrScoped),
	);

	const literalOp = escapeFts5StringLiteral("alpha OR beta");
	const literalOrHits = tri(literalOp);
	const bareOrHits = tri("alpha OR beta");
	const literalQuote = escapeFts5StringLiteral('引号"与星号*和NEAR');
	const literalQuoteHit = tri(literalQuote).includes(5);
	let rawQuoteError = false;
	try {
		tri('引号"与星号');
	} catch (error) {
		rawQuoteError = true;
	}
	checks.push(
		JSON.stringify(literalOrHits) === "[7]" && bareOrHits.includes(7) && bareOrHits.includes(8) && literalQuoteHit && rawQuoteError
			? pass("fts5-literal-escape", "字面量OR仅命中" + JSON.stringify(literalOrHits) + "；裸OR运算符命中" + JSON.stringify(bareOrHits) + "；含引号/星号字面量命中=" + literalQuoteHit + "；裸引号查询报错=" + rawQuoteError)
			: fail("fts5-literal-escape", "字面量=" + JSON.stringify(literalOrHits) + " 裸=" + JSON.stringify(bareOrHits) + " 引号字面量=" + literalQuoteHit + " 裸报错=" + rawQuoteError),
	);

	const beforeClose = db.prepare("SELECT COUNT(*) AS n FROM memory").get().n;
	db.close();
	db = new BetterSqlite3(dbPath, { nativeBinding: env.bindingPath });
	const afterReopen = db.prepare("SELECT COUNT(*) AS n FROM memory").get().n;
	const ftsAfterReopen = tri("trigram").includes(2);
	checks.push(
		beforeClose === CORPUS.length && afterReopen === beforeClose && ftsAfterReopen
			? pass("persistence-reopen", "重开行数=" + afterReopen + "；FTS索引跨进程保留=" + ftsAfterReopen)
			: fail("persistence-reopen", "关闭前行数=" + beforeClose + " 重开=" + afterReopen + " FTS=" + ftsAfterReopen),
	);

	const backupPath = dbPath + ".backup.db";
	await db.backup(backupPath);
	const backupDb = new BetterSqlite3(backupPath, { nativeBinding: env.bindingPath, readonly: true });
	const backupCount = backupDb.prepare("SELECT COUNT(*) AS n FROM memory").get().n;
	const backupFts = backupDb.prepare("SELECT rowid FROM memory_tri WHERE memory_tri MATCH ?").all("trigram").length;
	backupDb.close();
	checks.push(
		backupCount === CORPUS.length && backupFts === 1
			? pass("backup-restore", "备份行数=" + backupCount + "；备份FTS可查=" + backupFts)
			: fail("backup-restore", "备份行数=" + backupCount + " FTS=" + backupFts),
	);

	const workerDbPath = dbPath + ".worker.db";
	const workerResult = await new Promise((resolveWorker) => {
		const worker = new Worker(path.join(env.workDir, "probe-worker.cjs"), {
			workerData: { dbPath: workerDbPath, bindingPath: env.bindingPath, driverRoot: env.driverRoot },
		});
		const timeout = setTimeout(() => {
			worker.terminate().then((code) => resolveWorker({ ok: false, detail: "worker 超时，terminate code=" + code }));
		}, 30_000);
		worker.on("message", (message) => {
			clearTimeout(timeout);
			resolveWorker(message);
		});
		worker.on("error", (error) => {
			clearTimeout(timeout);
			resolveWorker({ ok: false, detail: "worker error: " + (error && error.message) });
		});
		worker.on("exit", (code) => {
			clearTimeout(timeout);
			if (code !== 0) resolveWorker({ ok: false, detail: "worker exit code=" + code });
		});
	});
	const workerVerify = new BetterSqlite3(workerDbPath, { nativeBinding: env.bindingPath, readonly: true });
	const workerRows = workerVerify.prepare("SELECT COUNT(*) AS n FROM memory_worker").get().n;
	workerVerify.close();
	checks.push(
		workerResult.ok && workerRows === 2
			? pass("worker-threads", "worker写入并干净关闭：" + workerResult.detail + "；主线程复核行数=" + workerRows)
			: fail("worker-threads", "worker=" + JSON.stringify(workerResult) + " 行数=" + workerRows),
	);

	let mismatchError = null;
	const mismatchMode = env.altBindingPath ? "wrong-arch" : "corrupted";
	try {
		if (env.altBindingPath) {
			require(env.altBindingPath);
		} else {
			const corruptedPath = path.join(env.workDir, "corrupted.node");
			fs.writeFileSync(corruptedPath, Buffer.from([0x4d, 0x5a, 0x00, 0x01, 0x02]));
			require(corruptedPath);
		}
	} catch (error) {
		mismatchError = error;
	}
	checks.push(
		mismatchError
			? pass("abi-mismatch-error", mismatchMode + " 加载失败（明确报错）: " + String(mismatchError.message).slice(0, 160))
			: fail("abi-mismatch-error", mismatchMode + " 二进制竟被加载成功——必须明确报错"),
	);

	db.close();
	return { ok: checks.every((item) => item.status !== "fail"), versions, checks, sqliteVersion };
}

module.exports = { runChecks };
if (require.main === module) {
	runChecks({
		driverRoot: process.env.OF_PROBE_DRIVER_ROOT,
		bindingPath: process.env.OF_PROBE_BINDING,
		dbPath: process.env.OF_PROBE_DB,
		altBindingPath: process.env.OF_PROBE_ALT_BINDING || null,
		workDir: process.env.OF_PROBE_WORK_DIR,
	})
		.then((result) => {
			fs.writeFileSync(process.env.OF_PROBE_RESULT, JSON.stringify(result));
			process.exitCode = result.ok ? 0 : 1;
		})
		.catch((error) => {
			fs.writeFileSync(
				process.env.OF_PROBE_RESULT,
				JSON.stringify({ ok: false, fatal: String(error && error.stack ? error.stack : error) }),
			);
			process.exitCode = 2;
		});
}
`;
}

function workerProbeSource() {
	return `
"use strict";
// TASK-0368 worker_threads 内加载驱动并干净关闭（由 verify-memory-native.mjs 生成）。
const path = require("node:path");
const { parentPort, workerData } = require("node:worker_threads");

(async () => {
	try {
		const BetterSqlite3 = require(path.join(workerData.driverRoot, "better-sqlite3"));
		const db = new BetterSqlite3(workerData.dbPath, { nativeBinding: workerData.bindingPath });
		db.exec("CREATE TABLE memory_worker (id INTEGER PRIMARY KEY, label TEXT)");
		db.prepare("INSERT INTO memory_worker (id, label) VALUES (1, 'worker-write')").run();
		db.prepare("INSERT INTO memory_worker (id, label) VALUES (2, 'worker-close')").run();
		const count = db.prepare("SELECT COUNT(*) AS n FROM memory_worker").get().n;
		db.close();
		parentPort.postMessage({ ok: count === 2, detail: "worker 内 open→write→close 完成，行数=" + count });
	} catch (error) {
		parentPort.postMessage({ ok: false, detail: "worker 内失败: " + (error && error.message) });
	}
})();
`;
}

function electronProbeSource() {
	return `
"use strict";
// TASK-0368 Electron 主进程包装：真实 browser 进程内运行同一探测（不用 ELECTRON_RUN_AS_NODE）。
const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
app.disableHardwareAcceleration();
app.setPath("userData", process.env.OF_PROBE_USER_DATA);
app.on("window-all-closed", () => {});
app
	.whenReady()
	.then(async () => {
		const { runChecks } = require(path.join(process.env.OF_PROBE_WORK_DIR, "probe-child.cjs"));
		const result = await runChecks({
			driverRoot: process.env.OF_PROBE_DRIVER_ROOT,
			bindingPath: process.env.OF_PROBE_BINDING,
			dbPath: process.env.OF_PROBE_DB,
			altBindingPath: process.env.OF_PROBE_ALT_BINDING || null,
			workDir: process.env.OF_PROBE_WORK_DIR,
		});
		fs.writeFileSync(process.env.OF_PROBE_RESULT, JSON.stringify(result));
		app.exit(result.ok ? 0 : 1);
	})
	.catch((error) => {
		fs.writeFileSync(
			process.env.OF_PROBE_RESULT,
			JSON.stringify({ ok: false, fatal: String(error && error.stack ? error.stack : error) }),
		);
		app.exit(2);
	});
`;
}

async function runRuntime(planEntry, workDir, env, { timeoutMs }) {
	const runtimeDir = join(workDir, "runtimes", planEntry.runtime);
	await mkdir(runtimeDir, { recursive: true });
	await writeFile(join(runtimeDir, "probe-child.cjs"), childProbeSource());
	await writeFile(join(runtimeDir, "probe-worker.cjs"), workerProbeSource());
	const dbPath = join(runtimeDir, "memory-probe.sqlite");
	const resultPath = join(runtimeDir, "result.json");
	const childEnv = {
		...process.env,
		OF_PROBE_DRIVER_ROOT: env.driverRoot,
		OF_PROBE_BINDING: env.bindingPath,
		OF_PROBE_DB: dbPath,
		OF_PROBE_ALT_BINDING: env.altBindingPath ?? "",
		OF_PROBE_WORK_DIR: runtimeDir,
		OF_PROBE_RESULT: resultPath,
		OF_PROBE_USER_DATA: join(runtimeDir, "electron-user-data"),
	};
	let args = [];
	if (planEntry.runtime === "electron") {
		await writeFile(join(runtimeDir, "electron-main.cjs"), electronProbeSource());
		args = ["--no-sandbox", join(runtimeDir, "electron-main.cjs")];
	} else {
		args = [join(runtimeDir, "probe-child.cjs")];
	}
	const run = await runChild(planEntry.command, args, { cwd: runtimeDir, env: childEnv, timeoutMs });
	let payload = null;
	try {
		payload = JSON.parse(await readFile(resultPath, "utf8"));
	} catch {
		payload = null;
	}
	if (!payload) {
		return {
			runtime: planEntry.runtime,
			status: "executed",
			ok: false,
			versions: {},
			checks: [
				{
					id: "runtime-info",
					status: "fail",
					detail: `未产出结果文件：exit=${run.code} signal=${run.signal} timedOut=${run.timedOut}${run.spawnError ? ` spawnError=${run.spawnError}` : ""} stderr尾=${run.stderrTail.slice(-400)}`,
				},
			],
		};
	}
	if (payload.fatal) {
		return {
			runtime: planEntry.runtime,
			status: "executed",
			ok: false,
			versions: {},
			checks: [{ id: "runtime-info", status: "fail", detail: `fatal: ${String(payload.fatal).slice(0, 500)}` }],
		};
	}
	return { runtime: planEntry.runtime, status: "executed", ok: payload.ok, versions: payload.versions, checks: payload.checks };
}

function extractSqliteVersion(results) {
	for (const runtime of results) {
		for (const check of runtime.checks ?? []) {
			if (check.id === "load-binding" && check.status === "pass" && check.detail?.startsWith("sqlite ")) {
				return check.detail.split("；")[0].replace("sqlite ", "");
			}
		}
	}
	return null;
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		console.log(usageText());
		process.exit(0);
	}
	const driver = parseDriverSpec(options.driver);
	const workDir = options.workDir ?? (await mkdtemp(join(tmpdir(), "of-memory-native-")));
	if (isInsideRepository(workDir)) {
		console.error(`拒绝：工作目录位于仓库内（${workDir}）。probe 必须在仓库外的隔离目录执行。`);
		process.exit(3);
	}
	console.log(`工作目录：${workDir}`);
	const install = await ensureDriverInstall(join(workDir, "driver"), driver, {
		registry: options.registry,
		skipInstall: options.skipInstall,
	});
	const { createHash } = await import("node:crypto");
	const hash = createHash("sha256");
	hash.update(await readFile(install.bindingPath));
	const bindingSha = hash.digest("hex");
	console.log(`驱动：${driver.spec} binding=${install.bindingPath} sha256=${bindingSha.slice(0, 16)}…`);

	const plan = buildRuntimePlan(options);
	const results = [];
	for (const entry of plan) {
		if (!entry.available) {
			console.log(`== ${entry.runtime} == 跳过：${entry.skipReason}`);
			results.push({ runtime: entry.runtime, status: "skipped", skipReason: entry.skipReason });
			continue;
		}
		console.log(`== ${entry.runtime} == 执行中（${entry.command}）`);
		const started = Date.now();
		const result = await runRuntime(
			entry,
			workDir,
			{ driverRoot: install.modulesRoot, bindingPath: install.bindingPath, altBindingPath: install.altBindingPath },
			{ timeoutMs: options.timeoutMs },
		);
		result.wallMs = Date.now() - started;
		results.push(result);
	}

	const report = {
		task: "TASK-0368",
		generatedAt: new Date().toISOString(),
		driver: { name: driver.name, version: driver.version, spec: driver.spec },
		sqliteVersion: extractSqliteVersion(results),
		binding: { path: install.bindingPath, sha256: bindingSha, altArch: install.altBindingArch },
		host: {
			platform: process.platform,
			arch: process.arch,
			node: process.versions.node,
			bun: process.versions.bun ?? null,
		},
		runtimes: results,
	};
	console.log(`\n${renderReport(report)}`);
	if (options.jsonPath) {
		await mkdir(dirname(options.jsonPath), { recursive: true });
		await writeFile(options.jsonPath, `${JSON.stringify(report, null, "\t")}\n`);
		console.log(`\nJSON 报告：${options.jsonPath}`);
	}
	if (!options.keep) {
		await rm(workDir, { recursive: true, force: true });
		console.log("已清理工作目录（--keep 可保留）。");
	} else {
		console.log(`保留工作目录：${workDir}`);
	}
	process.exit(summarizeExitCode(report));
}

function usageText() {
	return [
		"用法：node scripts/verify-memory-native.mjs [选项]",
		"",
		"选项：",
		`  --help                显示本帮助`,
		`  --driver <name@x.y.z> 固定版本候选驱动（默认 ${DEFAULT_DRIVER}）`,
		"  --runtime <list>      逗号分隔：node,bun,electron 或 all（默认 all）",
		"  --work-dir <dir>      隔离工作目录（必须在仓库外；默认系统临时目录）",
		"  --keep                保留工作目录（默认成功后清理）",
		"  --json <path>         另存机器可读 JSON 报告",
		"  --node-path <exe>     node 可执行文件（默认当前 process.execPath）",
		"  --bun-path <exe>      bun 可执行文件（默认 PATH 中的 bun）",
		"  --electron-path <exe> electron 可执行文件（默认仓库 apps/desktop 内二进制）",
		"  --registry <url>      bun add 使用的 registry",
		"  --skip-install        复用工作目录中已安装的驱动",
		"  --timeout-ms <n>      每运行时超时（默认 120000，最小 5000）",
		"",
		"退出码：0 全部通过；3 失败或超时；4 无运行时被执行。",
	].join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		console.error(error instanceof ProbeArgError ? error.message : error);
		process.exit(error instanceof ProbeArgError ? 2 : 3);
	});
}
