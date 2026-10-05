// Copyright The Open Forge contributors.
import { spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	compileScope,
	globToRegExp,
	gitChangesSince,
	gitCheckpointChanges,
	gitWorkingChanges,
	matrixScopeFor,
	runGate,
	runSnapshot,
	runCheckpoint,
} from "../scripts/ac-audit.mjs";

/**
 * ac-audit.mjs 的行为测试（V2/V3/V4 校验节点）。
 * 每个用例在临时目录里搭一个真实 git 沙盒仓库，按「合法写入 vs 越权写入」两种剧本跑断言。
 * 规范出处：allstar-team-design.md §9.7（校验节点表）与 §9.2（角色权限矩阵 v1）。
 *
 * 注意：git 调用统一走 spawnSync + 文件描述符 stdio——权限沙箱拒绝子进程 pipe stdio（EPERM），
 * 与 ac-audit.mjs 自身的实现约束一致（被测物与测试环境同构）。
 */

let sandboxRoot: string;

function git(cwd: string, ...args: string[]): string {
	const out = join(tmpdir(), `ac-test-${Date.now()}-${Math.random().toString(36).slice(2)}.out`);
	const err = `${out}.err`;
	const fdOut = openSync(out, "w");
	const fdErr = openSync(err, "w");
	try {
		const result = spawnSync("git", args, { cwd, stdio: ["ignore", fdOut, fdErr], encoding: null });
		if (result.error || result.status !== 0) {
			throw new Error(`git ${args.join(" ")} failed: ${readFileSync(err, "utf8") || String(result.error)}`);
		}
		return readFileSync(out, "utf8");
	} finally {
		closeSync(fdOut);
		closeSync(fdErr);
		rmSync(out, { force: true });
		rmSync(err, { force: true });
	}
}

function writeFile(path: string, content: string): void {
	mkdirSync(join(path, ".."), { recursive: true });
	writeFileSync(path, content, "utf8");
}

/** 构造 git 沙盒：init + 首提交（基线干净），返回仓库根。 */
function makeRepo(name: string): string {
	const root = join(sandboxRoot, name);
	mkdirSync(root, { recursive: true });
	git(root, "init", "-q", "-b", "main");
	git(root, "config", "user.email", "test@ac.local");
	git(root, "config", "user.name", "ac-test");
	writeFile(join(root, "README.md"), "# sandbox\n");
	git(root, "add", "README.md");
	git(root, "commit", "-q", "-m", "init");
	return root;
}

/** 等待毫秒跨越（git 提交时间戳秒级精度，跨秒才能保证 --since 语义）。 */
function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

beforeAll(async () => {
	sandboxRoot = join(tmpdir(), `ac-audit-test-${Date.now()}`);
	mkdirSync(sandboxRoot, { recursive: true });
}, 30000);

afterAll(() => {
	rmSync(sandboxRoot, { recursive: true, force: true });
});

describe("glob 编译（写域声明的解析）", () => {
	it("`**` 跨目录匹配且边界正确", () => {
		const re = globToRegExp("docs/ac/prototype/**");
		expect(re.test("docs/ac/prototype/index.html")).toBe(true);
		expect(re.test("docs/ac/prototype/sub/page.js")).toBe(true);
		expect(re.test("docs/ac/prototype")).toBe(false); // 目录本体的匹配由 compileScope 兜底
		expect(re.test("docs/ac/requires.md")).toBe(false);
		expect(re.test("docs/ac/prototype-evil/x.md")).toBe(false);
		const scope = compileScope("docs/ac/prototype/**");
		expect(scope.matches("docs/ac/prototype")).toBe(true); // 目录本体也算写域内
	});

	it("`src/**/*.{ts,tsx}` 单段通配 + 花括号组", () => {
		const re = globToRegExp("src/**/*.{ts,tsx}");
		expect(re.test("src/a.ts")).toBe(true);
		expect(re.test("src/x/y.tsx")).toBe(true);
		expect(re.test("src/a.js")).toBe(false);
	});

	it("精确路径匹配其自身与子路径（目录语义）", () => {
		const scope = compileScope("docs/ac/requires.md");
		expect(scope.matches("docs/ac/requires.md")).toBe(true);
		expect(scope.matches("docs/ac/other.md")).toBe(false);
		const dir = compileScope("test");
		expect(dir.matches("test/foo.test.ts")).toBe(true);
	});

	it("逗号分隔与空白输入的容错", () => {
		const scope = compileScope(" docs/ac/whitebox.md , test/** ");
		expect(scope.patterns).toEqual(["docs/ac/whitebox.md", "test/**"]);
		expect(scope.matches("docs/ac/whitebox.md")).toBe(true);
		expect(scope.matches("test/unit/a.test.ts")).toBe(true);
	});
});

describe("权限矩阵（§9.2 基线）", () => {
	it("各角色写域互不重叠（重叠区 = 归因盲区）", () => {
		const files = [
			"docs/ac/state.md",
			"docs/ac/originModel.html",
			"docs/ac/requires.md",
			"docs/ac/design.md",
			"docs/ac/tasks.md",
			"docs/ac/reviews.md",
			"docs/ac/whitebox.md",
			"docs/ac/blackbox.md",
			"docs/ac/test-results/issues-latest.md",
			"test/foo.test.ts",
		];
		const owners = new Map<string, string[]>();
		for (const role of ["conductor", "requirements", "architect", "taskplanner", "reviewer", "whitebox", "blackbox"]) {
			const scope = matrixScopeFor(role);
			for (const file of files) {
				if (scope.matches(file)) owners.set(file, [...(owners.get(file) ?? []), role]);
			}
		}
		for (const [file, roles] of owners) {
			expect(roles, `${file} 被多个角色写域覆盖: ${roles.join(",")}`).toHaveLength(1);
		}
	});

	it("开发子无静态写域（契约动态下发）", () => {
		expect(matrixScopeFor("developer").patterns).toEqual([]);
	});
});

describe("V3 snapshot（评审前快照）", () => {
	it("域内未提交改动 → PASS", () => {
		const root = makeRepo("v3-pass");
		writeFile(join(root, "src/calc/dto.ts"), "export interface CalcDto {}\n");
		const result = runSnapshot({ root, scope: "src/calc/**" });
		expect(result.pass).toBe(true);
		expect(result.inScope).toContain("src/calc/dto.ts");
	});

	it("越权写入 review-log → FAIL 且点名文件", () => {
		const root = makeRepo("v3-fail");
		writeFile(join(root, "src/calc/dto.ts"), "export interface CalcDto {}\n");
		writeFile(join(root, "docs/ac/review-log.md"), "verdict: pass\n");
		const result = runSnapshot({ root, scope: "src/calc/**" });
		expect(result.pass).toBe(false);
		expect(result.outOfScope).toContain("docs/ac/review-log.md");
	});

	it("state.md 的主控写入不计入越权证据", () => {
		const root = makeRepo("v3-state");
		writeFile(join(root, "docs/ac/state.md"), "{}\n");
		const result = runSnapshot({ root, scope: "src/**" });
		expect(result.pass).toBe(true);
	});

	it("fence-log.jsonl 的围栏写入不计入越权证据（P1 回归：围栏拦截即记日志，不得反过来误报越权）", () => {
		const root = makeRepo("v3-fence-log");
		writeFile(join(root, "src/calc/dto.ts"), "export interface CalcDto {}\n");
		// 模拟围栏在本环节内拦截了一笔：docs/ac/fence-log.jsonl 被插件追加
		writeFile(
			join(root, "docs/ac/fence-log.jsonl"),
			'{"ts":"2025-01-01T00:00:00.000Z","tool":"write","inputDigest":"path=docs/ac/design.md","reason":"ac-fence：越权写"}\n',
		);
		const result = runSnapshot({ root, scope: "src/calc/**" });
		expect(result.pass).toBe(true);
		expect(result.outOfScope).not.toContain("docs/ac/fence-log.jsonl");
	});
});

describe("V4 checkpoint（存档点）", () => {
	it("checkpoint 提交只含域内文件 → PASS", () => {
		const root = makeRepo("v4-pass");
		writeFile(join(root, "src/calc/dto.ts"), "export interface CalcDto {}\n");
		git(root, "add", "src/calc/dto.ts");
		git(root, "commit", "-q", "-m", "T1: dto 层实现");
		const result = runCheckpoint({ root, scope: "src/calc/**" });
		expect(result.pass).toBe(true);
		expect(result.files).toContain("src/calc/dto.ts");
	});

	it("checkpoint 夹带私货（越域提交）→ FAIL", () => {
		const root = makeRepo("v4-fail");
		writeFile(join(root, "src/calc/dto.ts"), "export interface CalcDto {}\n");
		writeFile(join(root, "docs/ac/requires.md"), "# 需求\n");
		git(root, "add", "src/calc/dto.ts", "docs/ac/requires.md");
		git(root, "commit", "-q", "-m", "T1: dto + 私货");
		const result = runCheckpoint({ root, scope: "src/calc/**" });
		expect(result.pass).toBe(false);
		expect(result.outOfScope).toContain("docs/ac/requires.md");
	});

	it("state.md 随档提交不算越权（主控预期写入）", () => {
		const root = makeRepo("v4-state");
		writeFile(join(root, "src/a.ts"), "export {}\n");
		writeFile(join(root, "docs/ac/state.md"), "{}\n");
		git(root, "add", "src/a.ts", "docs/ac/state.md");
		git(root, "commit", "-q", "-m", "T1: a");
		const result = runCheckpoint({ root, scope: "src/**" });
		expect(result.pass).toBe(true);
	});

	it("fence-log.jsonl 误入提交不算越权（插件预期写入）", () => {
		const root = makeRepo("v4-fence-log");
		writeFile(join(root, "src/a.ts"), "export {}\n");
		writeFile(join(root, "docs/ac/fence-log.jsonl"), '{"tool":"write"}\n');
		git(root, "add", "src/a.ts", "docs/ac/fence-log.jsonl");
		git(root, "commit", "-q", "-m", "T1: a + fence-log");
		const result = runCheckpoint({ root, scope: "src/**" });
		expect(result.pass).toBe(true);
	});
});

describe("V2 gate（环节收口双链比对）", () => {
	it("链 A 抓提交过的越权（开发子私自 commit 场景）", async () => {
		const root = makeRepo("v2-chain-a");
		await sleep(1100); // 跨秒，保证 --since 语义
		const since = new Date().toISOString();
		await sleep(1100);
		// 开发子越权：域外提交（模拟 T5 事件 ①）
		writeFile(join(root, "src/calc/dto.ts"), "export interface CalcDto {}\n");
		writeFile(join(root, "docs/ac/review-log.md"), "verdict: pass\n");
		git(root, "add", "src/calc/dto.ts", "docs/ac/review-log.md");
		git(root, "commit", "-q", "-m", "T1: 越权提交");
		const result = runGate({
			root,
			since,
			roles: "developer,reviewer",
			extraScope: "src/calc/**",
		});
		// developer 无静态写域 + 契约 src/calc/**；review-log.md 不在任何参与角色写域 → FAIL
		expect(result.pass).toBe(false);
		expect(result.outOfScope).toContain("docs/ac/review-log.md");
	}, 30000);

	it("链 B 抓改了没提交的越权（评审子越权写入场景）", async () => {
		const root = makeRepo("v2-chain-b");
		await sleep(1100);
		const since = new Date().toISOString();
		await sleep(1100);
		// 评审子越权：写 review-log（T5 事件 ②——不提交，靠 mtime 链抓）
		writeFile(join(root, "docs/ac/review-log.md"), "verdict: pass 0/0/0\n");
		const result = runGate({
			root,
			since,
			roles: "developer",
			extraScope: "src/**",
		});
		expect(result.pass).toBe(false);
		expect(result.outOfScope).toContain("docs/ac/review-log.md");
		// 未提交 → 链 A 抓不到，链 B 抓到（双链互补的证明）
		expect(result.chainA.files).not.toContain("docs/ac/review-log.md");
		expect(result.chainB.files).toContain("docs/ac/review-log.md");
	}, 30000);

	it("围栏拦截记录（fence-log.jsonl）不进链 B 越权证据（P1 回归）", async () => {
		const root = makeRepo("v2-fence-log");
		await sleep(1100);
		const since = new Date().toISOString();
		await sleep(1100);
		// 本环节内：开发子写域内实现 + 围栏拦了一笔越权写（fence-log.jsonl mtime 刷新）
		writeFile(join(root, "src/calc/dto.ts"), "export interface CalcDto {}\n");
		writeFile(
			join(root, "docs/ac/fence-log.jsonl"),
			'{"ts":"2025-01-01T00:00:00.000Z","tool":"write","inputDigest":"path=docs/ac/design.md","reason":"ac-fence：越权写"}\n',
		);
		const result = runGate({
			root,
			since,
			roles: "developer",
			extraScope: "src/calc/**",
		});
		expect(result.pass).toBe(true);
		expect(result.chainB.files).not.toContain("docs/ac/fence-log.jsonl");
		expect(result.outOfScope).not.toContain("docs/ac/fence-log.jsonl");
	}, 30000);

	it("全部落在写域并集内 → PASS（链 A ∪ 链 B ⊆ 写域）", async () => {
		const root = makeRepo("v2-pass");
		await sleep(1100);
		const since = new Date().toISOString();
		await sleep(1100);
		// 开发子写域内实现 + 评审子写 reviews.md + 主控写 state.md（预期写入）
		writeFile(join(root, "src/calc/dto.ts"), "export interface CalcDto {}\n");
		writeFile(join(root, "docs/ac/reviews.md"), "## T1 · 第 1 评审\nverdict: pass\n");
		writeFile(join(root, "docs/ac/state.md"), "{}\n");
		git(root, "add", "-A");
		git(root, "commit", "-q", "-m", "T1: dto + reviews + state");
		const result = runGate({
			root,
			since,
			roles: "developer,reviewer",
			extraScope: "src/calc/**",
		});
		expect(result.pass).toBe(true);
		expect(result.union).toContain("src/calc/dto.ts");
		expect(result.union).toContain("docs/ac/reviews.md");
		expect(result.union).not.toContain("docs/ac/state.md");
	}, 30000);

	it("评审子基线写域含 reviews.md（修正 T5 事件的合法落点）", () => {
		expect(matrixScopeFor("reviewer").matches("docs/ac/reviews.md")).toBe(true);
		expect(matrixScopeFor("reviewer").matches("docs/ac/review-log.md")).toBe(false);
	});

	it("时间锚之前的历史提交不进证据链", async () => {
		const root = makeRepo("v2-anchor");
		// 锚点前的合法历史提交
		writeFile(join(root, "src/legacy.ts"), "export {}\n");
		git(root, "add", "src/legacy.ts");
		git(root, "commit", "-q", "-m", "legacy");
		await sleep(1100);
		const since = new Date().toISOString();
		await sleep(1100);
		// 锚点后无任何改动
		const result = runGate({ root, since, roles: "developer", extraScope: "src/**" });
		expect(result.pass).toBe(true);
		expect(result.chainA.files).not.toContain("src/legacy.ts");
	}, 30000);
});

describe("git 工具函数边界", () => {
	it("gitWorkingChanges 解析重命名/删除/新增", () => {
		const root = makeRepo("working-changes");
		writeFile(join(root, "src/a.ts"), "1\n");
		git(root, "add", "src/a.ts");
		git(root, "commit", "-q", "-m", "add a");
		writeFile(join(root, "src/b.ts"), "2\n");
		git(root, "mv", "src/a.ts", "src/c.ts");
		const files = gitWorkingChanges(root);
		expect(files).toContain("src/b.ts");
		expect(files).toContain("src/a.ts"); // 重命名删除侧
		expect(files).toContain("src/c.ts"); // 重命名新增侧
	});

	it("gitChangesSince 排除 state.md（主控预期写入）", async () => {
		const root = makeRepo("since-state");
		await sleep(1100);
		const since = new Date().toISOString();
		await sleep(1100);
		writeFile(join(root, "docs/ac/state.md"), "{}\n");
		writeFile(join(root, "src/x.ts"), "export {}\n");
		git(root, "add", "-A");
		git(root, "commit", "-q", "-m", "state + x");
		const files = gitChangesSince(root, since);
		expect(files).toContain("src/x.ts");
		expect(files).not.toContain("docs/ac/state.md");
	}, 30000);
});
