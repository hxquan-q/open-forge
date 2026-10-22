// Copyright The Open Forge contributors.
/**
 * TASK-0368 probe 驱动的合同测试（node --test 直跑；不需要网络、原生驱动
 * 或真实运行时环境）。真实多运行时矩阵由 scripts/verify-memory-native.mjs
 * 实际执行产出，证据记录在任务交付记录与交接报告中，不在这里伪造。
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
	CHECK_IDS,
	DEFAULT_DRIVER,
	ProbeArgError,
	RUNTIME_ORDER,
	SHORT_WORD_CASES,
	buildRuntimePlan,
	childProbeSource,
	escapeFts5StringLiteral,
	isInsideRepository,
	parseArgs,
	parseDriverSpec,
	renderReport,
	resolveCommandFromPath,
	summarizeExitCode,
} from "./verify-memory-native.mjs";

const scriptPath = fileURLToPath(import.meta.url);

test("parseArgs 提供隔离 probe 的默认值", () => {
	const options = parseArgs([]);
	assert.equal(options.driver, DEFAULT_DRIVER);
	assert.deepEqual(options.runtimes, RUNTIME_ORDER);
	assert.equal(options.keep, false);
	assert.equal(options.skipInstall, false);
	assert.equal(options.workDir, null);
	assert.equal(options.timeoutMs, 120_000);
});

test("parseArgs --help 不触发取值解析", () => {
	assert.equal(parseArgs(["--help"]).help, true);
	assert.equal(parseArgs(["-h"]).help, true);
});

test("parseArgs 拒绝未知参数、缺取值与非法运行时", () => {
	assert.throws(() => parseArgs(["--nope"]), ProbeArgError);
	assert.throws(() => parseArgs(["--runtime"]), ProbeArgError);
	assert.throws(() => parseArgs(["--runtime", "--keep"]), ProbeArgError);
	assert.throws(() => parseArgs(["--runtime", "node,deno"]), /未知运行时/);
});

test("parseArgs 支持逗号列表、去重排序与显式路径", () => {
	const options = parseArgs(["--runtime", "electron,node,electron", "--json", "out.json", "--keep"]);
	assert.deepEqual(options.runtimes, ["electron", "node"]);
	assert.ok(options.jsonPath?.endsWith("out.json"));
	assert.equal(options.keep, true);
});

test("parseDriverSpec 只接受精确固定版本", () => {
	assert.deepEqual(parseDriverSpec("better-sqlite3@13.0.3"), {
		name: "better-sqlite3",
		version: "13.0.3",
		spec: "better-sqlite3@13.0.3",
	});
	for (const bad of ["better-sqlite3@^13.0.0", "better-sqlite3@latest", "better-sqlite3", "better-sqlite3@13"]) {
		assert.throws(() => parseDriverSpec(bad), ProbeArgError, bad);
	}
});

test("escapeFts5StringLiteral 双引号包裹并把内部引号翻倍", () => {
	assert.equal(escapeFts5StringLiteral("abc"), '"abc"');
	assert.equal(escapeFts5StringLiteral('a"b'), '"a""b"');
	assert.equal(escapeFts5StringLiteral("记忆"), '"记忆"');
	assert.equal(escapeFts5StringLiteral("a*OR b"), '"a*OR b"');
	assert.throws(() => escapeFts5StringLiteral(42), TypeError);
});

test("SHORT_WORD_CASES 表内不变量与官方 tokenizer 合同一致", () => {
	assert.ok(SHORT_WORD_CASES.length >= 4);
	for (const item of SHORT_WORD_CASES) {
		assert.equal([...item.term].length, item.length, item.term);
		// trigram 边界：少于 3 个 Unicode 字符不匹配。
		assert.equal(item.trigramMatch, item.length >= 3, item.term);
		// unicode61 不做 CJK 分词：落在更长 token 内的短词不命中。
		assert.equal(item.unicode61Match, false, item.term);
		// 参数化 instr 回退不受长度限制。
		assert.equal(item.instrFallback, true, item.term);
	}
});

test("isInsideRepository 识别仓库内目录并放行外部目录", async () => {
	const repoRoot = dirname(dirname(scriptPath));
	assert.equal(isInsideRepository(repoRoot, repoRoot), true);
	assert.equal(isInsideRepository(join(repoRoot, "scripts"), repoRoot), true);
	const outside = await mkdtemp(join(tmpdir(), "of-probe-test-"));
	try {
		assert.equal(isInsideRepository(outside, repoRoot), false);
	} finally {
		await rm(outside, { recursive: true, force: true });
	}
});

test("buildRuntimePlan 按固定顺序输出并给不可用运行时记跳过原因", () => {
	const plan = buildRuntimePlan({
		runtimes: ["electron", "node", "bun"],
		nodePath: process.execPath,
		bunPath: null,
		electronPath: join(tmpdir(), "missing-electron.exe"),
		resolveBun: () => null,
	});
	assert.deepEqual(
		plan.map((entry) => entry.runtime),
		RUNTIME_ORDER,
	);
	assert.equal(plan[0].available, true);
	assert.match(plan[1].skipReason, /bun/);
	assert.equal(plan[1].available, false);
	assert.match(plan[2].skipReason, /electron/);
});

test("buildRuntimePlan 显式 bun 路径按可用处理（由真实执行结果裁决）", () => {
	const plan = buildRuntimePlan({
		runtimes: ["bun"],
		bunPath: join(tmpdir(), "bun"),
		resolveBun: () => null,
	});
	assert.equal(plan[0].available, true);
	assert.equal(plan[0].skipReason, null);
});

test("summarizeExitCode：全过 0、有失败 3、全跳过 4", () => {
	const base = { driver: {}, binding: {}, host: {} };
	assert.equal(summarizeExitCode({ ...base, runtimes: [{ status: "executed", ok: true }] }), 0);
	assert.equal(
		summarizeExitCode({
			...base,
			runtimes: [
				{ status: "executed", ok: true },
				{ status: "executed", ok: false },
			],
		}),
		3,
	);
	assert.equal(summarizeExitCode({ ...base, runtimes: [{ status: "skipped", skipReason: "x" }] }), 4);
});

test("renderReport 呈现跳过原因、失败检查与 binding 证据", () => {
	const text = renderReport({
		driver: { spec: "better-sqlite3@13.0.3", version: "13.0.3" },
		sqliteVersion: "3.53.4",
		binding: { path: "C:/tmp/prebuilds/win32-x64.node", sha256: "deadbeef" },
		host: { platform: "win32", arch: "x64", node: "26.3.1", bun: "1.4.2" },
		runtimes: [
			{
				runtime: "node",
				status: "executed",
				ok: true,
				versions: { node: "26.3.1" },
				checks: [{ id: "load-binding", status: "pass", detail: "sqlite 3.53.4" }],
			},
			{ runtime: "electron", status: "skipped", skipReason: "仓库内未找到 electron 二进制" },
			{
				runtime: "bun",
				status: "executed",
				ok: false,
				versions: {},
				checks: [{ id: "worker-threads", status: "fail", detail: "worker error" }],
			},
		],
	});
	assert.match(text, /跳过：仓库内未找到 electron 二进制/);
	assert.match(text, /\[FAIL\] worker-threads — worker error/);
	assert.match(text, /sha256：deadbeef/);
	assert.match(text, /退出码判定：3/);
});

test("子探测模板覆盖全部检查 ID、短词实例与转义实现", () => {
	const source = childProbeSource();
	for (const id of CHECK_IDS) {
		assert.ok(source.includes(`"${id}"`) || source.includes(`'${id}'`), id);
	}
	for (const term of ["记忆", "记忆升", "instr(content, ?)"]) {
		assert.ok(source.includes(term), term);
	}
	assert.ok(source.includes("const escapeFts5StringLiteral = function escapeFts5StringLiteral("));
	assert.ok(source.includes("nativeBinding: env.bindingPath"));
	assert.ok(!source.includes("ELECTRON_RUN_AS_NODE"));
});

test("resolveCommandFromPath 扫描 PATH 并在无命中时返回 null", async () => {
	const dir = await mkdtemp(join(tmpdir(), "of-path-test-"));
	try {
		await mkdir(dir, { recursive: true });
		const exeName = process.platform === "win32" ? "bun.exe" : "bun";
		await writeFile(join(dir, exeName), "");
		assert.equal(resolveCommandFromPath("bun", join(dir)), join(dir, exeName));
		assert.equal(resolveCommandFromPath("bun", `${dir}${process.platform === "win32" ? ";" : ":"}${dir}`), join(dir, exeName));
		assert.equal(resolveCommandFromPath("no-such-of-probe-cmd", dir), null);
		assert.equal(resolveCommandFromPath("anything", ""), null);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("--help 子进程退出 0 并输出用法与退出码说明", () => {
	const result = spawnSync(process.execPath, [scriptPath.replace(/\.node-test\.mjs$/, ".mjs"), "--help"], {
		encoding: "utf8",
		timeout: 30_000,
	});
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /用法：node scripts\/verify-memory-native\.mjs/);
	assert.match(result.stdout, /--driver/);
	assert.match(result.stdout, /退出码：0 全部通过；3 失败或超时；4 无运行时被执行/);
});
