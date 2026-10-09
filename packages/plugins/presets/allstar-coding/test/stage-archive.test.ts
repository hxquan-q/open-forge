// Copyright The Open Forge contributors.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 环节级存档制（v0.5）的行为合同。
 * 规范出处：agent/skills/ac-pipeline/SKILL.md §0.5（唯一权威源）。
 * 这里锁定「规范文本自洽 + 各阶段手册/persona/workflow 与总纲一致」，
 * 保证未来编辑不会静默丢掉 stage 档规则或回退到仅 T 级存档。
 */

function readPluginFile(relative: string): Promise<string> {
	return readFile(resolve(import.meta.dirname, "..", relative), "utf8");
}

describe("stage-level archive rules (ac-pipeline §0.5)", () => {
	it("defines both archive kinds with machine-checkable commit message formats", async () => {
		const pipeline = await readPluginFile("agent/skills/ac-pipeline/SKILL.md");
		expect(pipeline).toContain("### 0.5 环节级存档制");
		// T 档：评审 pass 触发，提交信息 `T<n>: <摘要>`
		expect(pipeline).toContain("**T 档**（开发任务档）");
		// stage 档：其余（子）环节 done 触发，提交信息 `stage <seq>/<环节名>: <摘要>`
		expect(pipeline).toContain("**stage 档**（环节收口档）");
		expect(pipeline).toContain("`stage <seq>/<环节名>: <摘要>`");
		// 每档提交信息有示例（可机判格式的锚点）
		expect(pipeline).toMatch(/stage 3\/需求确认门: 需求文档定稿/);
		expect(pipeline).toMatch(/T1: dto 层实现/);
		// 档内必须包含 state.md（账本随档入史）
		expect(pipeline).toContain("账本随档入史");
		// 派发前规则通用化到所有（子）环节
		expect(pipeline).toContain("**派发前规则（通用）**");
	});

	it("keeps the git ledger ↔ state.md one-to-one mapping claim", async () => {
		const pipeline = await readPluginFile("agent/skills/ac-pipeline/SKILL.md");
		// git 历史与 state.md 一一映射（V6 逐档对位的依据）
		expect(pipeline).toMatch(/一一映射|逐档对位/);
		// V6 终局对账按档对位
		expect(pipeline).toContain("每个 commit 对位一个 done");
	});

	it("no stage manual still prescribes T-only archiving", async () => {
		const pipeline = await readPluginFile("agent/skills/ac-pipeline/SKILL.md");
		// 旧名「T 级存档制」已被「环节级存档制」取代——正文中不允许再出现旧制名
		// （历史版本的 README v0.4 段落除外，那里记录的是 v0.4 时代的行为）
		expect(pipeline.includes("T 级存档制")).toBe(false);
	});

	it("every non-dev stage manual instructs a stage checkpoint at handoff", async () => {
		const handoffs: Array<[skill: string, marker: string]> = [
			["ac-requirements", "stage 3/需求确认门"],
			["ac-design", "stage 5/开发文档"],
			["ac-taskplan", "stage 7/任务清单"],
			["ac-whitebox", "stage 9/白盒测试"],
			["ac-blackbox", "stage 11/黑盒测试"],
		];
		for (const [skill, marker] of handoffs) {
			const content = await readPluginFile(`agent/skills/${skill}/SKILL.md`);
			expect(content, `${skill} must reference its stage checkpoint`).toContain(marker);
			expect(content, `${skill} must route via the git subagent + V4`).toMatch(/轻量 git 子代理 \+ V4/);
		}
	});

	it("dev-side manuals keep T-checkpoint wording aligned with §0.5", async () => {
		const dev = await readPluginFile("agent/skills/ac-dev/SKILL.md");
		expect(dev).toContain("**T 档存档**");
		expect(dev).toMatch(/环节级存档制/);
		const review = await readPluginFile("agent/skills/ac-review/SKILL.md");
		expect(review).toContain("T 档存档");
	});

	it("ac-gate closes every stage with an archive check", async () => {
		const gate = await readPluginFile("agent/skills/ac-gate/SKILL.md");
		expect(gate).toContain("### G5 存档已执行（每环节收口）");
		// G5 同时覆盖 T 档与 stage 档
		expect(gate).toMatch(/每个 T 都有对应 T 档提交/);
		expect(gate).toMatch(/有对应 stage 档提交/);
		// 收口流程含打档步骤
		expect(gate).toMatch(/\*\*打档\*\*（§0.5/);
	});

	it("conductor persona and workflow mandate stage checkpoints", async () => {
		const persona = await readPluginFile("agent/agents/allstar.md");
		expect(persona).toMatch(/环节级存档制 §0\.5/);
		expect(persona).toMatch(/打档（环节级存档制 §0\.5/);
		const workflow = await readPluginFile("agent/workflows/pipeline.md");
		expect(workflow).toContain("stage <seq>/<name>: <summary>");
		expect(workflow).toMatch(/mirrors the state ledger one-to-one/);
	});
});
