#!/usr/bin/env node
// Modified by The Open Forge contributors.
/**
 * TASK-0371：记忆 SQLite 驱动的打包 staging 与 nativeBinding 解析工具。
 *
 * 落地 S0b（TASK-0368）批准的 ABI 隔离方案：better-sqlite3@13.0.3 的 npm 包
 * 自带全平台 prebuilds（N-API 单二进制多运行时），无需 electron-rebuild；
 * 打包时需要 ①固定版本 ②.natvie 二进制 asar unpack ③运行时显式
 * nativeBinding 加载。本工具：
 *   - resolveBindingPath(driverRoot)：定位当前平台的 prebuilds/<plat>-<arch>.node；
 *   - buildStagingPlan(...)：给出复制清单（包清单 + binding，unpack 标记）；
 *   - stage(plan)：把包与 binding 复制到目标 staging 目录（不碰共享 node_modules）；
 *   - --verify：在隔离目录用显式 nativeBinding 实际加载并跑最小 SQL 合同。
 *
 * 用法：
 *   node apps/desktop/scripts/memory-native-staging.mjs --help
 *   node apps/desktop/scripts/memory-native-staging.mjs --stage --target <dir>
 *   node apps/desktop/scripts/memory-native-staging.mjs --verify --target <dir>
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
export const MEMORY_DRIVER_NAME = "better-sqlite3";
export const MEMORY_DRIVER_VERSION = "13.0.3";

/** 当前平台对应的 prebuilds 二进制相对路径。 */
export function prebuildRelativePath(platform = process.platform, arch = process.arch) {
	return join(MEMORY_DRIVER_NAME, "prebuilds", `${platform}-${arch}.node`);
}

/** 解析仓库依赖图中记忆驱动的包根与 binding 绝对路径（所有者：runtime-node）。 */
export function resolveMemoryDriver(root = repositoryRoot) {
	const resolutionBases = [join(root, "packages", "runtime-node", "package.json"), join(root, "package.json")];
	let packageEntry = null;
	let lastError = null;
	for (const base of resolutionBases) {
		try {
			packageEntry = createRequire(base).resolve(`${MEMORY_DRIVER_NAME}/package.json`);
			break;
		} catch (error) {
			lastError = error;
		}
	}
	if (packageEntry === null) {
		throw new Error(`无法解析 ${MEMORY_DRIVER_NAME}（应声明为 runtime-node 依赖）：${lastError?.message ?? ""}`);
	}
	const packageRoot = dirname(packageEntry);
	const manifest = JSON.parse(readFileSync(packageEntry, "utf8"));
	if (manifest.version !== MEMORY_DRIVER_VERSION) {
		throw new Error(
			`记忆驱动版本漂移：期望 ${MEMORY_DRIVER_NAME}@${MEMORY_DRIVER_VERSION}，实际 ${manifest.version}；按 ADR-0150 固定版本后重试`,
		);
	}
	const bindingPath = join(packageRoot, "prebuilds", `${process.platform}-${process.arch}.node`);
	if (!existsSync(bindingPath)) {
		throw new Error(`未找到本机 binding：${bindingPath}`);
	}
	return { packageRoot, manifest, bindingPath };
}

/** staging 计划：要复制的文件与目标布局（packaged-native-dependencies 的 unpack 输入）。 */
export function buildStagingPlan(options) {
	const { target, platform = process.platform, arch = process.arch, driver = resolveMemoryDriver() } = options;
	if (typeof target !== "string" || target.trim() === "") {
		throw new Error("--target 必须是非空目录");
	}
	const SKIP_DIRECTORIES = new Set(["node_modules", "build", "deps", "docs", "test", "benchmarks", ".github"]);
	const files = [];
	const walk = (directory, relativeDirectory) => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				if (SKIP_DIRECTORIES.has(entry.name)) continue;
				walk(join(directory, entry.name), join(relativeDirectory, entry.name));
			} else if (entry.isFile()) {
				files.push({
					source: join(directory, entry.name),
					destination: join(target, MEMORY_DRIVER_NAME, relativeDirectory, entry.name),
					unpack: entry.name.endsWith(".node"),
				});
			}
		}
	};
	walk(driver.packageRoot, "");
	const currentPlatformBinding = join(target, prebuildRelativePath(platform, arch));
	if (!files.some((file) => file.destination === currentPlatformBinding && file.unpack)) {
		throw new Error(`staging 计划缺少当前平台 binding：${currentPlatformBinding}`);
	}
	return {
		target,
		files,
		unpack: files.filter((file) => file.unpack).map((file) => relative(target, file.destination).replaceAll("\\", "/")),
	};
}

/** 执行 staging 计划：只复制计划内文件，不写共享 node_modules。 */
export function stageMemoryDriver(plan) {
	const copied = [];
	for (const file of plan.files) {
		if (!existsSync(file.source)) {
			throw new Error(`staging 源缺失：${file.source}`);
		}
		mkdirSync(dirname(file.destination), { recursive: true });
		copyFileSync(file.source, file.destination);
		copied.push(file.destination);
	}
	return { copied, unpack: plan.unpack };
}

/** 在隔离 staging 目录用显式 nativeBinding 加载并验证最小合同。 */
export function verifyStagedDriver(plan) {
	const binding = plan.files
		.find((file) => file.unpack && file.destination.endsWith(`${process.platform}-${process.arch}.node`))
		?.destination;
	if (!binding) {
		throw new Error("staging 计划缺少 unpack 的 binding 文件");
	}
	const driverEntry = plan.files.find((file) => file.destination.endsWith(join(MEMORY_DRIVER_NAME, "lib", "index.js")))
		?.destination;
	if (!driverEntry) {
		throw new Error("staging 计划缺少驱动入口文件");
	}
	const probe = `
const Database = require(${JSON.stringify(driverEntry)});
const db = new Database(${JSON.stringify(join(plan.target, "verify.sqlite"))}, { nativeBinding: ${JSON.stringify(binding)} });
db.pragma("journal_mode = WAL");
db.exec("CREATE TABLE memory_probe (id INTEGER PRIMARY KEY, content TEXT)");
db.prepare("INSERT INTO memory_probe (id, content) VALUES (1, 'staged-ok')").run();
const row = db.prepare("SELECT content FROM memory_probe WHERE id = 1").get();
const version = db.prepare("SELECT sqlite_version() AS v").get().v;
db.close();
if (row.content !== "staged-ok") throw new Error("staging 验证读写失败");
console.log(JSON.stringify({ ok: true, sqliteVersion: version }));
`;
	const result = spawnSync(process.execPath, ["--input-type=module", "-e", `import { createRequire } from "node:module"; const require = createRequire(import.meta.url); ${probe}`], {
		encoding: "utf8",
	});
	if (result.status !== 0) {
		throw new Error(`staging 验证失败：${result.stderr || result.stdout}`);
	}
	return JSON.parse(result.stdout.trim().split("\n").pop());
}

function printUsage() {
	console.log(`用法：
  node apps/desktop/scripts/memory-native-staging.mjs --help
  node apps/desktop/scripts/memory-native-staging.mjs --resolve        # 打印驱动包根与 binding 路径
  node apps/desktop/scripts/memory-native-staging.mjs --plan --target <dir>
  node apps/desktop/scripts/memory-native-staging.mjs --stage --target <dir>
  node apps/desktop/scripts/memory-native-staging.mjs --verify --target <dir>   # stage 后实际加载验证
版本合同：${MEMORY_DRIVER_NAME}@${MEMORY_DRIVER_VERSION}（ADR-0150 / TASK-0368）。`);
}

function parseArgv(argv) {
	const options = { help: false, resolve: false, plan: false, stage: false, verify: false, target: null };
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--help" || arg === "-h") options.help = true;
		else if (arg === "--resolve") options.resolve = true;
		else if (arg === "--plan") options.plan = true;
		else if (arg === "--stage") options.stage = true;
		else if (arg === "--verify") options.verify = true;
		else if (arg === "--target") options.target = argv[++index];
		else throw new Error(`未知参数：${arg}（--help 查看用法）`);
	}
	return options;
}

export function main(argv = process.argv.slice(2)) {
	const options = parseArgv(argv);
	if (options.help || (!options.resolve && !options.plan && !options.stage && !options.verify)) {
		printUsage();
		return 0;
	}
	if (options.resolve) {
		const driver = resolveMemoryDriver();
		console.log(JSON.stringify({ packageRoot: driver.packageRoot, bindingPath: driver.bindingPath }, null, 2));
	}
	if (options.plan || options.stage || options.verify) {
		if (!options.target) throw new Error("--plan/--stage/--verify 需要 --target <dir>");
		const plan = buildStagingPlan({ target: options.target });
		if (options.plan) {
			console.log(JSON.stringify(plan, null, 2));
		}
		if (options.stage || options.verify) {
			const staged = stageMemoryDriver(plan);
			console.log(JSON.stringify({ staged: staged.copied.length, unpack: staged.unpack }));
		}
		if (options.verify) {
			console.log(JSON.stringify(verifyStagedDriver(plan)));
		}
	}
	return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase()) {
	try {
		process.exitCode = main();
	} catch (error) {
		console.error(`[memory-native-staging] ${error instanceof Error ? error.message : String(error)}`);
		process.exitCode = 1;
	}
}
