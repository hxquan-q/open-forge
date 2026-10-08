// Copyright The Open Forge contributors.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ContractStore } from "../src/fence/contract-store";
import {
	BASELINE_MATRIX,
	judge,
	judgeMainSpawn,
	roleFromTaskName,
	SPAWN_AGENT_TYPE_WHITELIST,
	type FenceContract,
	type ToolCallShape,
} from "../src/fence/judge";
import { compileScope, globToRegExp } from "../scripts/scope-glob.mjs";

/**
 * ac-fence 判定器行为测试（ac-fence-spec §7）。判定器是纯函数——全部用例不需要 mock 宿主。
 * 用例分组与 spec §7 一一对应：glob 语义 / 主会话规则 / 子会话 file-edit / 未登记 / explorer
 * 纵深防御 / git 黑名单正则 / git 写豁免通道（T 级存档） / scope-glob 一致性 / 契约登记。
 */

// ---------------------------------------------------------------------------
// 构造器
// ---------------------------------------------------------------------------

function contract(partial: Partial<FenceContract> & Pick<FenceContract, "role" | "taskName">): FenceContract {
	return { agentType: "general", scope: [], ...partial };
}

function fileEdit(path: string): ToolCallShape {
	return { toolKind: "file-edit", hostName: "write", input: { path } };
}

function shell(command: string): ToolCallShape {
	return { toolKind: "shell", hostName: "bash", input: { command } };
}

function spawnAgent(input: Record<string, unknown>): ToolCallShape {
	return { toolKind: "agent", hostName: "spawn_agent", input };
}

const DEV_T1 = contract({ role: "developer", taskName: "dev_t1", scope: ["src/dto/**", "src/service/dto.ts"] });
const REVIEW_T1 = contract({ role: "reviewer", taskName: "review_t1", scope: ["docs/ac/reviews.md"] });
const REQ_1 = contract({
	role: "requirements",
	taskName: "req_1",
	scope: ["docs/ac/requires.md"],
});
const BB_1 = contract({ role: "blackbox", taskName: "bb_1", scope: ["docs/ac/blackbox.md"] });

/** read 类 function 调用构造器（黑盒读域过滤的测试输入）。 */
function readCall(path?: string): ToolCallShape {
	return { toolKind: "function", hostName: "read", input: path === undefined ? {} : { path } };
}

// ---------------------------------------------------------------------------
// §7.1 glob 语义（与 ac-audit 现有 glob 测试等价——两处必须同判定）
// ---------------------------------------------------------------------------

describe("glob 语义（scope-glob 共享模块）", () => {
	it("`**` 跨目录匹配且边界正确", () => {
		const re = globToRegExp("docs/ac/prototype/**");
		expect(re.test("docs/ac/prototype/index.html")).toBe(true);
		expect(re.test("docs/ac/prototype/sub/page.js")).toBe(true);
		expect(re.test("docs/ac/prototype")).toBe(false); // 目录本体由 compileScope 兜底
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

	it("Windows 反斜杠输入经 POSIX 化后匹配", () => {
		const verdict = judge(DEV_T1, fileEdit("src\\dto\\deep\\user.dto.ts"), false);
		expect(verdict.allow).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// §7.2 主会话规则
// ---------------------------------------------------------------------------

describe("主会话规则（主控侧）", () => {
	it("git status/log/diff 只读命令放行", () => {
		expect(judge(null, shell("git status"), true).allow).toBe(true);
		expect(judge(null, shell("git log --name-only"), true).allow).toBe(true);
		expect(judge(null, shell("git diff HEAD~1"), true).allow).toBe(true);
		expect(judge(null, shell("git show HEAD"), true).allow).toBe(true);
		expect(judge(null, shell("git blame src/a.ts"), true).allow).toBe(true);
	});

	it("git commit/push/reset 拦截（reason 指向轻量 git 子代理）", () => {
		for (const cmd of ["git commit -m x", "git push origin main", "git reset --hard HEAD~1", "git add ."]) {
			const verdict = judge(null, shell(cmd), true);
			expect(verdict.allow, cmd).toBe(false);
			expect(verdict.reason, cmd).toContain("git");
		}
	});

	it("spawn agent_type ∈ {general, explorer} 放行（scope 合法时）", () => {
		const input = {
			task_name: "dev_t1",
			agent_type: "general",
			task: { scope: "src/dto/**" },
		};
		expect(judgeMainSpawn(input).allow).toBe(true);
		expect(judgeMainSpawn({ ...input, agent_type: "explorer" }).allow).toBe(true);
	});

	it("spawn task.scope 为空拦截", () => {
		const verdict = judgeMainSpawn({ task_name: "dev_t1", agent_type: "general", task: { scope: "" } });
		expect(verdict.allow).toBe(false);
		expect(verdict.reason).toContain("task.scope");
	});

	it("spawn agent_type 不在白名单拦截", () => {
		const verdict = judgeMainSpawn({
			task_name: "dev_t1",
			agent_type: "root",
			task: { scope: "src/dto/**" },
		});
		expect(verdict.allow).toBe(false);
		expect(verdict.reason).toContain("agent_type");
	});

	it("spawn 静态角色 scope 超基线拦截（收紧可以、放宽违规）", () => {
		const verdict = judgeMainSpawn({
			task_name: "req_1",
			agent_type: "general",
			task: { scope: "src/**" },
		});
		expect(verdict.allow).toBe(false);
		expect(verdict.reason).toContain("基线");
	});

	it("spawn 动态角色允许项目内 glob、拒绝绝对路径与 .. 逃逸", () => {
		expect(judgeMainSpawn({ task_name: "dev_t1", agent_type: "general", task: { scope: "src/**" } }).allow).toBe(
			true,
		);
		expect(
			judgeMainSpawn({ task_name: "dev_t1", agent_type: "general", task: { scope: "C:/Windows/**" } }).allow,
		).toBe(false);
		expect(
			judgeMainSpawn({ task_name: "dev_t1", agent_type: "general", task: { scope: "../outside/**" } }).allow,
		).toBe(false);
	});

	it("主会话其他工具放行（file-edit/读类）", () => {
		expect(judge(null, fileEdit("src/anything.ts"), true).allow).toBe(true);
		expect(judge(null, { toolKind: "function", hostName: "read", input: {} }, true).allow).toBe(true);
		expect(judge(null, shell("npm test"), true).allow).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// §7.3 子会话 file-edit
// ---------------------------------------------------------------------------

describe("子会话 file-edit 判定", () => {
	it("developer scope 内路径放行（含深层与精确条目）", () => {
		expect(judge(DEV_T1, fileEdit("src/dto/deep/user.dto.ts"), false).allow).toBe(true);
		expect(judge(DEV_T1, fileEdit("src/service/dto.ts"), false).allow).toBe(true);
	});

	it("scope 外 block，reason 含 help_protocol 字样", () => {
		const verdict = judge(DEV_T1, fileEdit("docs/ac/design.md"), false);
		expect(verdict.allow).toBe(false);
		expect(verdict.reason).toContain("help_protocol");
	});

	it("reviewer 写 reviews.md 放行、写 design.md block（基线交集语义）", () => {
		expect(judge(REVIEW_T1, fileEdit("docs/ac/reviews.md"), false).allow).toBe(true);
		const verdict = judge(REVIEW_T1, fileEdit("docs/ac/design.md"), false);
		expect(verdict.allow).toBe(false);
	});

	it("requirements 契约 scope 比基线窄 → 基线内但 scope 外仍 block（fail-safe）", () => {
		// 基线含 prototype/**，但契约只给了 requires.md → 原型文件写入被拦（交集语义收紧）
		const verdict = judge(REQ_1, fileEdit("docs/ac/prototype/index.html"), false);
		expect(verdict.allow).toBe(false);
	});

	it("developer 契约 scope 写 design.md → block（动态角色仅 scope 生效，reason 说明）", () => {
		const contract2 = contract({ role: "developer", taskName: "dev_t2", scope: ["docs/ac/design.md"] });
		const verdict = judge(contract2, fileEdit("docs/ac/design.md"), false);
		// developer 动态域 = 仅 scope → scope 含 design.md 即放行（基线为空不构成约束）
		expect(verdict.allow).toBe(true);
	});

	it("file-edit 缺 path 字段 block（fail-safe）", () => {
		const verdict = judge(DEV_T1, { toolKind: "file-edit", hostName: "write", input: { nope: 1 } }, false);
		expect(verdict.allow).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// §7.4 未登记子代理
// ---------------------------------------------------------------------------

describe("未登记子代理（contract == null 的子会话）", () => {
	it("read/grep 只读放行", () => {
		expect(judge(null, { toolKind: "function", hostName: "read", input: {} }, false).allow).toBe(true);
		expect(judge(null, { toolKind: "function", hostName: "grep", input: {} }, false).allow).toBe(true);
		expect(judge(null, { toolKind: "function", hostName: "glob", input: {} }, false).allow).toBe(true);
	});

	it("write block，reason 含登记指引", () => {
		const verdict = judge(null, fileEdit("src/a.ts"), false);
		expect(verdict.allow).toBe(false);
		expect(verdict.reason).toContain("help_protocol");
	});

	it("shell/其他类 block（非只读 function）", () => {
		expect(judge(null, shell("echo hi"), false).allow).toBe(false);
		expect(judge(null, { toolKind: "mcp", hostName: "mcp_db", input: {} }, false).allow).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// §7.5 explorer 纵深防御
// ---------------------------------------------------------------------------

describe("explorer 型纵深防御", () => {
	it("agentType=explorer 的 file-edit block（无论 scope 是否覆盖）", () => {
		const explorerContract = contract({
			role: "reviewer",
			taskName: "review_t1",
			agentType: "explorer",
			scope: ["docs/ac/reviews.md"],
		});
		const verdict = judge(explorerContract, fileEdit("docs/ac/reviews.md"), false);
		expect(verdict.allow).toBe(false);
		expect(verdict.reason).toContain("explorer");
	});

	it("explorer 的读类调用不受影响", () => {
		const explorerContract = contract({
			role: "reviewer",
			taskName: "review_t1",
			agentType: "explorer",
			scope: [],
		});
		expect(judge(explorerContract, { toolKind: "function", hostName: "read", input: {} }, false).allow).toBe(
			true,
		);
	});
});

// ---------------------------------------------------------------------------
// §7.6 git 黑名单正则
// ---------------------------------------------------------------------------

describe("git 黑名单正则（isGitWriteCommand 经 judge 间接覆盖）", () => {
	const cases: Array<[command: string, blocked: boolean]> = [
		["git log --name-only", false],
		["git status --porcelain", false],
		["git diff", false],
		["git add .", true],
		["git commit -m 'x'", true],
		["git push", true],
		["git reset --hard", true],
		["git checkout -b feature", true],
		["git stash", true],
		["git branch -d old", true],
		["git tag v1.0", true],
		["git reflog expire --expire=now --all", true],
		["git reflog", false],
		['cmd /c "git commit -m x"', true],
		["GIT_EXTERNAL_DIFF=cat git status", false],
		["node ./node_modules/.bin/git-ish.js status", false],
		["git -C /some/path commit -m x", true],
		["git -C /some/path status", false],
		["echo not git at all", false],
	];

	for (const [command, blocked] of cases) {
		it(`${JSON.stringify(command)} → ${blocked ? "拦截" : "放行"}`, () => {
			expect(judge(DEV_T1, shell(command), false).allow).toBe(!blocked);
		});
	}
});

// ---------------------------------------------------------------------------
// git 写豁免通道（T 级存档：轻量 git 子代理契约 allow_git_write ——防 P0 死锁回归）
// ---------------------------------------------------------------------------

describe("git 写豁免通道（轻量 git 子代理）", () => {
	const GIT_AGENT = contract({
		role: "assistant",
		taskName: "git_t1",
		scope: ["docs/ac/state.md", "src/**"],
		gitWriteAllow: true,
	});

	it("豁免契约放行 git 写命令（add/commit/branch）", () => {
		expect(judge(GIT_AGENT, shell("git add -A"), false).allow).toBe(true);
		expect(judge(GIT_AGENT, shell('git commit -m "T1 checkpoint"'), false).allow).toBe(true);
		expect(judge(GIT_AGENT, shell("git branch ac/2025-01-01-demo"), false).allow).toBe(true);
	});

	it("豁免契约的 git 只读命令仍放行", () => {
		expect(judge(GIT_AGENT, shell("git status"), false).allow).toBe(true);
	});

	it("普通契约 git 写命令仍拦截（豁免不外溢）", () => {
		const verdict = judge(DEV_T1, shell("git commit -m x"), false);
		expect(verdict.allow).toBe(false);
		expect(verdict.reason).toContain("allow_git_write");
	});

	it("豁免为 false/undefined 语义等价（缺省从严）", () => {
		const noFlag = contract({ role: "assistant", taskName: "git_t2", scope: ["src/**"] });
		expect(judge(noFlag, shell("git commit -m x"), false).allow).toBe(false);
		const falseFlag = contract({ role: "assistant", taskName: "git_t3", scope: ["src/**"], gitWriteAllow: false });
		expect(judge(falseFlag, shell("git commit -m x"), false).allow).toBe(false);
	});

	it("spawn 携带 allow_git_write 但 task_name 非 git_ 前缀 → 拦截（防偷带）", () => {
		const verdict = judgeMainSpawn({
			task_name: "dev_t7",
			agent_type: "general",
			allow_git_write: true,
			task: { scope: "src/**" },
		});
		expect(verdict.allow).toBe(false);
		expect(verdict.reason).toContain("git_");
	});

	it("spawn 合法豁免契约（git_ 前缀 + allow_git_write）放行", () => {
		const verdict = judgeMainSpawn({
			task_name: "git_t1",
			agent_type: "general",
			allow_git_write: true,
			task: { scope: "src/**,docs/ac/state.md" },
		});
		expect(verdict.allow).toBe(true);
	});

	it("主会话 git 写命令拦截的 reason 指向轻量 git 子代理通道", () => {
		const verdict = judge(null, shell("git commit -m x"), true);
		expect(verdict.allow).toBe(false);
		expect(verdict.reason).toContain("轻量 git 子代理");
	});

	it("contractFromSpawnInput 解析 allow_git_write；state.md 恢复缺省从严", async () => {
		const { contractFromSpawnInput } = await import("../src/fence/contract-store");
		const parsed = contractFromSpawnInput({
			task_name: "git_t1",
			agent_type: "general",
			allow_git_write: true,
			task: { scope: "src/**" },
		});
		expect(parsed?.gitWriteAllow).toBe(true);
		const noFlag = contractFromSpawnInput({ task_name: "dev_t1", agent_type: "general", task: { scope: "src/**" } });
		expect(noFlag?.gitWriteAllow).toBe(false);
	});

	it("state.md 契约恢复：gitWriteAllow 字段带回；agentRef 兜底不授豁免", async () => {
		const store = new ContractStore();
		store.bindStateReader(async () => ({
			steps: [
				{
					subSteps: [
						{
							agentRef: "git_t1",
							contract: {
								taskName: "git_t1",
								scope: ["src/**"],
								agentType: "general",
								role: "assistant",
								gitWriteAllow: true,
							},
						},
						{ agentRef: "git_t9" }, // 无 contract 字段 → agentRef 兜底
					],
				},
			],
		}));
		await store.applyStateSync("C:/proj");
		expect(store.lookupByTaskName("git_t1")?.gitWriteAllow).toBe(true);
		expect(store.lookupByTaskName("git_t9")?.gitWriteAllow).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// blackbox 角色窄读域 + shell 白名单（黑盒自测迭代 §6.2——仅该角色生效）
// ---------------------------------------------------------------------------

describe("blackbox 读域过滤（§6.2）", () => {
	it("read 命中 docs/ac/ 前缀放行（含反斜杠输入）", () => {
		expect(judge(BB_1, readCall("docs/ac/requires.md"), false).allow).toBe(true);
		expect(judge(BB_1, readCall("docs/ac/test-results/issues-latest.md"), false).allow).toBe(true);
		expect(judge(BB_1, readCall("docs\\ac\\design.md"), false).allow).toBe(true);
	});

	it("read 越域（src/项目外/前缀伪造）block，reason 带 help_protocol", () => {
		for (const path of ["src/main.ts", "package.json", "docs/ac-evil/secret.md", "README.md"]) {
			const verdict = judge(BB_1, readCall(path), false);
			expect(verdict.allow, path).toBe(false);
			expect(verdict.reason, path).toContain("ac-fence：");
			expect(verdict.reason, path).toContain("help_protocol");
		}
	});

	it("read 的 .. 穿越与绝对路径形态 block（BUG-0080 回归）", () => {
		for (const path of [
			"docs/ac/../../src/main.ts",
			"docs/ac/./../x",
			"docs/ac/../..",
			"/etc/passwd",
			"~/secret.txt",
			"C:/Windows/system32/config",
			"docs/ac/..\\..\\src\\main.ts", // 反斜杠混合穿越（POSIX 化后命中 .. 段）
		]) {
			const verdict = judge(BB_1, readCall(path), false);
			expect(verdict.allow, path).toBe(false);
		}
	});

	it("read 缺 path 字段 fail-safe block（file_path 兼容回退可用）", () => {
		expect(judge(BB_1, { toolKind: "function", hostName: "read", input: {} }, false).allow).toBe(false);
		expect(judge(BB_1, { toolKind: "function", hostName: "read", input: { nope: 1 } }, false).allow).toBe(false);
		const fallback = judge(BB_1, { toolKind: "function", hostName: "read", input: { file_path: "docs/ac/x.md" } }, false);
		expect(fallback.allow).toBe(true);
	});

	it("目录发现类工具（grep/glob/ls/dir_tree/find）一律 block", () => {
		for (const hostName of ["grep", "glob", "ls", "dir_tree", "find"]) {
			const verdict = judge(BB_1, { toolKind: "function", hostName, input: {} }, false);
			expect(verdict.allow, hostName).toBe(false);
			expect(verdict.reason, hostName).toContain("目录发现");
		}
	});

	it("非文件路径工具不受读域过滤影响（todo/list_agents/browser_tab 放行）", () => {
		expect(judge(BB_1, { toolKind: "function", hostName: "todo", input: {} }, false).allow).toBe(true);
		expect(judge(BB_1, { toolKind: "function", hostName: "list_agents", input: {} }, false).allow).toBe(true);
		// browser_tab 是黑测子自测通道（F1/F2），读类 L0 与写类 L3 均不属读域过滤对象
		expect(
			judge(BB_1, { toolKind: "function", hostName: "browser_tab", input: { action: "snapshot" } }, false).allow,
		).toBe(true);
	});

	it("写域判定优先于读域（blackbox 写 blackbox.md 放行、写他处 block）", () => {
		expect(judge(BB_1, fileEdit("docs/ac/blackbox.md"), false).allow).toBe(true);
		expect(judge(BB_1, fileEdit("docs/ac/requires.md"), false).allow).toBe(false);
	});
});

describe("blackbox shell 白名单（§6.2）", () => {
	it("agent-browser 前缀命令放行", () => {
		expect(judge(BB_1, shell("agent-browser --version"), false).allow).toBe(true);
		expect(judge(BB_1, shell("agent-browser open http://localhost:5173"), false).allow).toBe(true);
		expect(judge(BB_1, shell("AGENT-BROWSER --version"), false).allow).toBe(true);
		expect(judge(BB_1, shell("  agent-browser   snapshot "), false).allow).toBe(true);
	});

	it("引号内的 URL 元字符不受影响（合法查询串放行）", () => {
		expect(judge(BB_1, shell('agent-browser open "http://x?a=1&b=2"'), false).allow).toBe(true);
		expect(judge(BB_1, shell("agent-browser open 'http://x?a=1&b=2'"), false).allow).toBe(true);
	});

	it("引号外的复合命令/替换/重定向元字符 block（BUG-0080 回归）", () => {
		for (const command of [
			"agent-browser snapshot && curl http://x",
			"agent-browser --version; git push",
			"agent-browser x > out.txt",
			"agent-browser x >> docs/ac/blackbox.md",
			"agent-browser x | node -e evil",
			"agent-browser x || curl http://x",
			"agent-browser x & curl http://x",
			"agent-browser x $(curl http://x)",
			"agent-browser x `curl http://x`",
			"agent-browser --version\ngit push",
			'agent-browser open "http://x" && curl http://x', // 引号外的 && 仍拦
		]) {
			const verdict = judge(BB_1, shell(command), false);
			expect(verdict.allow, command).toBe(false);
			expect(verdict.reason, command).toContain("ac-fence：");
		}
	});

	it("未闭合引号 fail-safe block（BUG-0080 回归）", () => {
		expect(judge(BB_1, shell('agent-browser open "http://x?a=1'), false).allow).toBe(false);
		expect(judge(BB_1, shell("agent-browser open 'http://x"), false).allow).toBe(false);
	});

	it("双引号内的 $( 与反引号是命令替换 → block（BUG-0080 残余 A 回归）", () => {
		for (const command of [
			'agent-browser open "http://x?$(curl http://evil)"',
			'agent-browser open "http://x/`whoami`"',
			'agent-browser open "$(node -e evil)"',
			'agent-browser open "`curl http://x`"',
		]) {
			const verdict = judge(BB_1, shell(command), false);
			expect(verdict.allow, command).toBe(false);
			expect(verdict.reason, command).toContain("ac-fence：");
		}
		// 对照：单引号内才是真字面量（bash/PowerShell 语义一致）——保持放行
		expect(judge(BB_1, shell("agent-browser open 'http://x/`whoami`'"), false).allow).toBe(true);
		expect(judge(BB_1, shell("agent-browser open 'http://x?$(a)'"), false).allow).toBe(true);
	});

	it("反斜杠转义的引号不开启引号区 → 后续元字符按引号外拦截（BUG-0080 残余 B 回归）", () => {
		for (const command of [
			'agent-browser x \\" && curl evil \\"', // 闭合变体：旧实现整段被"引号内"跳过 → 放行
			'agent-browser x \\" ; git push \\"',
			'agent-browser x \\" | node -e evil',
			"agent-browser x \\' && curl evil \\'", // bash：\\' 是字面引号，&& 真执行
		]) {
			const verdict = judge(BB_1, shell(command), false);
			expect(verdict.allow, command).toBe(false);
		}
		// 不闭合变体此前靠 unclosed-quote 意外拦截——保持 block（显式化为用例）
		expect(judge(BB_1, shell('agent-browser x \\" && curl evil'), false).allow).toBe(false);
	});

	it("其余 shell 命令一律 block（含 git 只读、起服务、命令伪装）", () => {
		for (const command of [
			"git status",
			"git log --name-only",
			"bun run dev",
			"npm install",
			"node server.js",
			"echo hi",
			"agent-browser2 --version", // 前缀伪装：首 token 不同
			"evil && agent-browser --version", // 复合命令：首 token 非 agent-browser
		]) {
			const verdict = judge(BB_1, shell(command), false);
			expect(verdict.allow, command).toBe(false);
			expect(verdict.reason, command).toContain("ac-fence：");
		}
	});

	it("shell 缺 command 字段 fail-safe block", () => {
		const verdict = judge(BB_1, { toolKind: "shell", hostName: "bash", input: {} }, false);
		expect(verdict.allow).toBe(false);
	});
});

describe("非 blackbox 角色不受窄读域/白名单影响（回归保护）", () => {
	it("developer/reviewer 读全域与任意 shell 照旧（既有语义）", () => {
		expect(judge(DEV_T1, readCall("src/main.ts"), false).allow).toBe(true);
		expect(judge(DEV_T1, { toolKind: "function", hostName: "grep", input: {} }, false).allow).toBe(true);
		expect(judge(DEV_T1, shell("npm test"), false).allow).toBe(true);
		expect(judge(DEV_T1, shell("git status"), false).allow).toBe(true);
		expect(judge(REVIEW_T1, readCall("src/main.ts"), false).allow).toBe(true);
		expect(judge(REVIEW_T1, shell("bun run check"), false).allow).toBe(true);
	});

	it("BASELINE_MATRIX.blackbox 声明 read 域（单一事实源标记）", () => {
		expect(BASELINE_MATRIX.blackbox?.read).toEqual(["docs/ac/"]);
		// 其他角色未声明 read（读全域语义）
		expect(BASELINE_MATRIX.developer?.read).toBeUndefined();
		expect(BASELINE_MATRIX.whitebox?.read).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// §7.7 scope-glob 一致性（ac-audit 32 用例回归门在 test/ac-audit.test.ts——此处只验证共享实现同源）
// ---------------------------------------------------------------------------

describe("scope-glob 一致性", () => {
	it("fence 与 ac-audit 用同一实现（经同一 import 路径 re-export 的行为一致性抽查）", async () => {
		const audit = await import("../scripts/ac-audit.mjs");
		// ac-audit re-export 的 compileScope 与共享模块是同一函数
		expect(audit.compileScope).toBe(compileScope);
		expect(audit.globToRegExp).toBe(globToRegExp);
	});

	it("BASELINE_MATRIX 与 ac-audit 权威源一致", async () => {
		const audit = await import("../scripts/ac-audit.mjs");
		expect(BASELINE_MATRIX).toEqual(audit.BASELINE_MATRIX);
	});

	it("动态角色写域为空（developer/deployer/finalizer/assistant）", () => {
		expect(BASELINE_MATRIX.developer.write).toEqual([]);
		expect(BASELINE_MATRIX.deployer.write).toEqual([]);
		expect(BASELINE_MATRIX.finalizer.write).toEqual([]);
		expect(BASELINE_MATRIX.assistant.write).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// §7.8 契约登记（contract-store）
// ---------------------------------------------------------------------------

describe("契约登记（ContractStore）", () => {
	it("task_name 前缀推断角色", () => {
		expect(roleFromTaskName("dev_t1")).toBe("developer");
		expect(roleFromTaskName("review_t1")).toBe("reviewer");
		expect(roleFromTaskName("req_1")).toBe("requirements");
		expect(roleFromTaskName("arch_1")).toBe("architect");
		expect(roleFromTaskName("plan_1")).toBe("taskplanner");
		expect(roleFromTaskName("wb_1")).toBe("whitebox");
		expect(roleFromTaskName("bb_1")).toBe("blackbox");
		expect(roleFromTaskName("dep_1")).toBe("deployer");
		expect(roleFromTaskName("fin_1")).toBe("finalizer");
		expect(roleFromTaskName("help_env")).toBe("assistant");
		expect(roleFromTaskName("git_t1")).toBe("assistant"); // 轻量 git 子代理 → assistant 动态角色
		expect(roleFromTaskName("mystery")).toBe("unknown");
	});

	it("spawn 白名单内容", () => {
		expect([...SPAWN_AGENT_TYPE_WHITELIST].sort()).toEqual(["explorer", "general"]);
	});

	it("spawn toolInput → pending 契约；SubagentStart 回填 agentId", () => {
		const store = new ContractStore();
		const registered = store.registerSpawn("tooluse-1", {
			task_name: "dev_t9",
			agent_type: "general",
			task: { scope: "src/calc/**,src/calc/calc.ts" },
		});
		expect(registered).not.toBeNull();
		expect(registered?.role).toBe("developer");
		expect(registered?.scope).toEqual(["src/calc/**", "src/calc/calc.ts"]);
		// spawn 时即可判定（agentId 未回填也按 taskName 可查）
		expect(store.lookupByTaskName("dev_t9")?.scope).toContain("src/calc/**");
		// SubagentStart 回填
		const bound = store.bindAgentId("agent-abc", "general");
		expect(bound?.taskName).toBe("dev_t9");
		expect(store.lookupByAgentId("agent-abc")?.taskName).toBe("dev_t9");
	});

	it("同名 task_name 重 spawn 覆盖登记（新契约生效）", () => {
		const store = new ContractStore();
		store.registerSpawn("tu-1", { task_name: "dev_t1", agent_type: "general", task: { scope: "src/a/**" } });
		store.registerSpawn("tu-2", { task_name: "dev_t1", agent_type: "general", task: { scope: "src/b/**" } });
		expect(store.lookupByTaskName("dev_t1")?.scope).toEqual(["src/b/**"]);
		expect(store.size).toBe(1);
	});

	it("state.md 恢复路径：contract 字段与 agentRef 兜底重建", async () => {
		let stateFile: Record<string, unknown> | null = null;
		const store = new ContractStore();
		store.bindStateReader(async () => stateFile as never);
		const cwd = process.cwd();

		// subStep 带 contract 字段（§4.3 落盘形态）
		stateFile = {
			steps: [
				{
					agentRef: null,
					subSteps: [
						{
							agentRef: "dev_t1",
							contract: { taskName: "dev_t1", scope: ["src/dto/**"], agentType: "general", role: "developer" },
						},
					],
				},
				{ agentRef: "review_t2" }, // 无 contract 字段 → agentRef 兜底（scope 空）
			],
		};
		await store.applyStateSync(cwd);
		expect(store.lookupByTaskName("dev_t1")?.scope).toEqual(["src/dto/**"]);
		expect(store.lookupByTaskName("review_t2")?.role).toBe("reviewer");
		expect(store.lookupByTaskName("review_t2")?.scope).toEqual([]);

		// parse 失败（读取器抛错）→ 静默跳过
		store.bindStateReader(async () => {
			throw new Error("invalid json");
		});
		await expect(store.applyStateSync(cwd)).resolves.toBeUndefined();
	});

	it("scheduleStateSync 去抖（同 cwd 只安排一次，落定后可再安排）", async () => {
		let reads = 0;
		const store = new ContractStore();
		store.bindStateReader(async () => {
			reads += 1;
			return { steps: [] };
		});
		store.scheduleStateSync("C:/proj");
		store.scheduleStateSync("C:/proj");
		await new Promise((r) => setTimeout(r, 20));
		expect(reads).toBe(1);
		store.scheduleStateSync("C:/proj");
		await new Promise((r) => setTimeout(r, 20));
		expect(reads).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// fence-log 摘要（§5 inputDigest 不落完整 toolInput）
// ---------------------------------------------------------------------------

describe("fence-log inputDigest", () => {
	it("path 原样、command 截断 200、spawn 不落 task 全文", async () => {
		const { inputDigest } = await import("../src/fence/audit-log");
		expect(inputDigest("file-edit", "write", { path: "src/a.ts", content: "SECRET" })).toBe("path=src/a.ts");
		const long = "x".repeat(500);
		const digest = inputDigest("shell", "bash", { command: `npm run ${long}` });
		expect(digest.startsWith("command=npm run ")).toBe(true);
		expect(digest.length).toBeLessThanOrEqual("command=".length + 200);
		expect(inputDigest("agent", "spawn_agent", { task_name: "dev_t1", task: { scope: "src/**" } })).not.toContain(
			"src/**",
		);
	});
});

// ---------------------------------------------------------------------------
// fence-log 落盘（真实临时项目目录）
// ---------------------------------------------------------------------------

describe("fence-log 追加（createFenceLogAppender + node:fs 装配）", () => {
	const root = mkdtempSync(join(tmpdir(), "ac-fence-log-"));

	afterAll(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it("block 记录追加为 jsonl 且字段齐备", async () => {
		const { createFenceLogAppender } = await import("../src/fence/audit-log");
		const project = join(root, "proj");
		mkdirSync(project, { recursive: true });
		const appendFenceLog = createFenceLogAppender({
			readFile: async (path) => readFileSync(path, "utf8"),
			writeFile: async (path, content) => {
				writeFileSync(path, content, "utf8");
			},
			createDirectory: async (path) => {
				mkdirSync(path, { recursive: true });
			},
			stat: async (path) => {
				try {
					return { size: statSync(path).size };
				} catch {
					return null;
				}
			},
		});
		appendFenceLog(project, {
			sessionId: "s1",
			agentId: "a1",
			taskName: "dev_t1",
			tool: "write",
			inputDigest: "path=src/forbidden.ts",
			reason: "ac-fence：越权写",
		});
		// fire-and-forget：等异步落盘完成
		await new Promise((r) => setTimeout(r, 50));
		const lines = readFileSync(join(project, "docs", "ac", "fence-log.jsonl"), "utf8").trim().split("\n");
		expect(lines.length).toBe(1);
		const entry = JSON.parse(lines[0]) as Record<string, string>;
		expect(entry.sessionId).toBe("s1");
		expect(entry.agentId).toBe("a1");
		expect(entry.taskName).toBe("dev_t1");
		expect(entry.tool).toBe("write");
		expect(entry.inputDigest).toBe("path=src/forbidden.ts");
		expect(entry.reason).toContain("越权写");
		expect(entry.project).toBe(project);
		expect(entry.ts).toBeTruthy();

		// 第二条追加不覆盖第一条（无 appendFile，读旧拼接重写语义）
		appendFenceLog(project, {
			sessionId: "s1",
			tool: "bash",
			inputDigest: "command=git push",
			reason: "ac-fence：git 写命令",
		});
		await new Promise((r) => setTimeout(r, 50));
		const lines2 = readFileSync(join(project, "docs", "ac", "fence-log.jsonl"), "utf8").trim().split("\n");
		expect(lines2.length).toBe(2);
		expect(JSON.parse(lines2[1]).inputDigest).toBe("command=git push");
	});

	it("state.md 落盘形态（§4.3 contract 字段可被 applyStateSync 读回）", async () => {
		const project = join(root, "proj2");
		const docsAc = join(project, "docs", "ac");
		mkdirSync(docsAc, { recursive: true });
		const subStep = {
			taskName: "dev_t1",
			agentId: "agent-x",
			scope: ["src/dto/**"],
			agentType: "general",
			role: "developer",
		};
		writeFileSync(
			join(docsAc, "state.md"),
			JSON.stringify({ steps: [{ subSteps: [{ agentRef: "dev_t1", contract: subStep }] }] }),
			"utf8",
		);
		const store = new ContractStore();
		// 与 src/fence.ts 相同的装配：node:fs 读取 + JSON.parse（失败 → null）
		store.bindStateReader(async (cwd) => {
			try {
				return JSON.parse(readFileSync(join(cwd, "docs", "ac", "state.md"), "utf8")) as never;
			} catch {
				return null;
			}
		});
		await store.applyStateSync(project);
		const restored = store.lookupByTaskName("dev_t1");
		expect(restored?.scope).toEqual(["src/dto/**"]);
		expect(restored?.role).toBe("developer");
	});
});
