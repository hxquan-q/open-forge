// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import {
	judge,
	judgeMainSpawn,
	type FenceContract,
	type ToolCallShape,
} from "../src/fence/judge";

/**
 * 绝对路径误拦回归（bill 项目 fence-log 实录 3 条自相矛盾拦截，2026-10）：
 *
 * 宿主 write/edit 传给插件的 path 是绝对路径（含 Windows 盘符）；旧判定器只做 \→/ 转换、
 * 不归一化为项目相对路径，相对 scope 模式天然不命中 → 合法写入被拦，子代理按 help_protocol
 * 登记诉求 → 主控代写/重派 → 调用膨胀（"越跑越卡"误拦正反馈的家族 A）。
 *
 * 修复语义（ac-revision-plan D8）：**项目根内的绝对路径**归一化为相对路径参与写域判定；
 * **项目根外的绝对路径**维持拦截（fail-safe——否则 scope 拦截可被绝对路径绕过）。
 */

const PROJECT_ROOT = "D:/Coding/WorkSpace/Practice/bill";

const TASKPLANNER = {
	agentType: "general",
	taskName: "plan_1",
	role: "taskplanner" as const,
	scope: ["docs/ac/tasks.md"],
} satisfies FenceContract;

const ARCHITECT = {
	agentType: "general",
	taskName: "arch_1",
	role: "architect" as const,
	scope: ["docs/ac/design.md"],
} satisfies FenceContract;

const ASSISTANT_FRONTEND = {
	agentType: "general",
	taskName: "git_t2_probe3",
	role: "assistant" as const,
	scope: ["frontend/**"],
} satisfies FenceContract;

function fileEdit(path: string): ToolCallShape {
	return { toolKind: "file-edit", hostName: "write", input: { path } };
}

describe("绝对路径归一化（项目根内 → 相对后判域；项目根外 → 维持拦截）", () => {
	it("bill 实录 1：arch_1 写 <root>/docs/ac/design.md（scope 即 design.md）应放行", () => {
		const verdict = judge(ARCHITECT, fileEdit(`${PROJECT_ROOT}/docs/ac/design.md`), false, PROJECT_ROOT);
		expect(verdict.allow, verdict.reason).toBe(true);
	});

	it("bill 实录 2：plan_1 写 <root>/docs/ac/tasks.md（scope 即 tasks.md）应放行", () => {
		const verdict = judge(TASKPLANNER, fileEdit(`${PROJECT_ROOT}\\docs\\ac\\tasks.md`), false, PROJECT_ROOT);
		expect(verdict.allow, verdict.reason).toBe(true);
	});

	it("bill 实录 3：assistant 写 <root>/frontend/src/api/records.ts（scope: frontend/**）应放行", () => {
		const verdict = judge(
			ASSISTANT_FRONTEND,
			fileEdit(`${PROJECT_ROOT}/frontend/src/api/records.ts`),
			false,
			PROJECT_ROOT,
		);
		expect(verdict.allow, verdict.reason).toBe(true);
	});

	it("项目根外的绝对路径维持拦截（fail-safe：归一化不得打开越权通道）", () => {
		for (const outside of [
			"D:/Coding/WorkSpace/Practice/other/docs/ac/tasks.md",
			"D:/Windows/system32/config",
			"E:/anywhere/else.md",
		]) {
			const verdict = judge(TASKPLANNER, fileEdit(outside), false, PROJECT_ROOT);
			expect(verdict.allow, outside).toBe(false);
			expect(verdict.reason, outside).toContain("越权写");
		}
	});

	it("根内绝对路径但 scope 外仍拦截（归一化只修形态，不扩域）", () => {
		const verdict = judge(TASKPLANNER, fileEdit(`${PROJECT_ROOT}/docs/ac/design.md`), false, PROJECT_ROOT);
		expect(verdict.allow).toBe(false);
	});

	it("相对路径判定不回归（不传 projectRoot 时保持旧语义）", () => {
		expect(judge(TASKPLANNER, fileEdit("docs/ac/tasks.md"), false).allow).toBe(true);
		expect(judge(TASKPLANNER, fileEdit("docs/ac/design.md"), false).allow).toBe(false);
		// 无 projectRoot 时绝对路径不可归一化 → 旧 fail-safe 语义（不命中相对 scope）
		expect(judge(TASKPLANNER, fileEdit(`${PROJECT_ROOT}/docs/ac/tasks.md`), false).allow).toBe(false);
	});

	it("盘符大小写与反斜杠形态均可归一化", () => {
		const verdict = judge(TASKPLANNER, fileEdit("d:\\Coding\\WorkSpace\\Practice\\bill\\docs\\ac\\tasks.md"), false, PROJECT_ROOT);
		expect(verdict.allow, verdict.reason).toBe(true);
	});
});

describe("git branch 子命令读写细分（bill 实录 5 条误拦）", () => {
	const GIT_AGENT: FenceContract = {
		agentType: "general",
		taskName: "git_t1",
		role: "assistant",
		scope: ["docs/ac/state.md"],
		gitWriteAllow: true,
	};
	// 非豁免契约（普通子代理）：branch 只读应放行、branch 写仍拦
	const DEV: FenceContract = {
		agentType: "general",
		taskName: "dev_t1",
		role: "developer",
		scope: ["src/**"],
	};

	function shell(command: string): ToolCallShape {
		return { toolKind: "shell", hostName: "bash", input: { command } };
	}

	it("git branch --show-current 只读放行（bill 实录：探测基线被拦 5 次）", () => {
		expect(judge(DEV, shell("git -C D:/Coding branch --show-current"), false).allow).toBe(true);
		expect(judge(DEV, shell("git branch --show-current"), false).allow).toBe(true);
	});

	it("git branch 无参 / -a / -v / --list 只读放行", () => {
		expect(judge(DEV, shell("git branch"), false).allow).toBe(true);
		expect(judge(DEV, shell("git branch -a"), false).allow).toBe(true);
		expect(judge(DEV, shell("git branch -v"), false).allow).toBe(true);
		expect(judge(DEV, shell("git branch --list"), false).allow).toBe(true);
		expect(judge(DEV, shell("git branch --list 'ac/*'"), false).allow).toBe(true);
		expect(judge(DEV, shell("git branch --show-current"), false).allow).toBe(true);
	});

	it("git branch <name> / -d / -D / -m / -M 仍判写（拦普通子代理）", () => {
		for (const command of [
			"git branch feature-x",
			"git branch -d old",
			"git branch -D old",
			"git branch -m rename",
			"git branch -M rename",
			"git -C D:/Coding branch ac/2026-10-13-qingchang-record master",
		]) {
			const verdict = judge(DEV, shell(command), false);
			expect(verdict.allow, command).toBe(false);
		}
	});

	it("豁免契约（git_ 前缀）branch 写操作照旧放行", () => {
		expect(judge(GIT_AGENT, shell("git branch ac/2026-10-14-demo"), false).allow).toBe(true);
		expect(judge(GIT_AGENT, shell("git branch -d merged"), false).allow).toBe(true);
	});

	it("主会话 branch 只读放行、branch 写仍拦", () => {
		expect(judge(null, shell("git branch --show-current"), true).allow).toBe(true);
		expect(judge(null, shell("git branch feature-x"), true).allow).toBe(false);
	});

	it("只读 branch 与其他只读子命令组合串仍按整串判定", () => {
		// 组合串里含 branch 只读 + status 只读 → 整串放行
		expect(judge(DEV, shell("git branch --show-current; git status --short"), false).allow).toBe(true);
		// 组合串里混入 checkout -b（写）→ 整串拦
		expect(judge(DEV, shell("git branch --show-current; git checkout -b x"), false).allow).toBe(false);
	});
});

describe("helper（assistant 动态角色）spawn scope 兜底", () => {
	it("helper 契约 scope 为通配全域（** 或单 *）时 spawn 拒绝——防主控图省事发全域写权", () => {
		for (const scope of ["**", "*", "**/**"]) {
			const verdict = judgeMainSpawn({
				task_name: "help_env_setup",
				agent_type: "general",
				task: { scope },
			});
			expect(verdict.allow, scope).toBe(false);
			expect(verdict.reason, scope).toContain("help_");
		}
	});

	it("helper 正常点状 scope 照旧放行", () => {
		const verdict = judgeMainSpawn({
			task_name: "help_env_setup",
			agent_type: "general",
			task: { scope: "docs/ac/interface-card.md,scripts/setup.mjs" },
		});
		expect(verdict.allow, verdict.reason).toBe(true);
	});

	it("developer 等其他动态角色的通配 scope 不受影响（写域本就按任务卡收紧）", () => {
		const verdict = judgeMainSpawn({
			task_name: "dev_t1",
			agent_type: "general",
			task: { scope: "src/**" },
		});
		expect(verdict.allow).toBe(true);
	});
});
