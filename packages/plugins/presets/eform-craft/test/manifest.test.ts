// Copyright The Open Forge contributors.
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { listPluginManifestResources, parsePluginManifest } from "@vetta-org/plugin-sdk/manifest";
import { describe, expect, it } from "vitest";

const pluginRoot = resolve(import.meta.dirname, "..");
const agentIds = ["eform", "requirements", "developer", "tester", "deployer"];
const skillNames = [
	"backend-crud-and-api-contract",
	"build-release-and-rollback",
	"database-change-control",
	"electronic-signature-field-implementation",
	"entity-form-attachment-parsing",
	"form-field-specification-and-base-data",
	"form-record-lifecycle",
	"frontend-buttons-and-forms",
	"idempotent-insert-operations",
	"integration-debugging",
	"lombok-annotation-processor-diagnosis",
	"operation-audit-domain",
	"organization-scope-and-data-permission",
	"project-architecture-and-runtime-map",
	"qiankun-subapp-integration",
	"query-pagination-and-n-plus-one",
	"relational-form-selector",
	"requirements-design-to-delivery",
	"user-metadata-and-audit-boundary",
];

function readSkill(name: string): Promise<string> {
	return readPluginFile(`agent/skills/${name}/SKILL.md`);
}

async function markdownFiles(directory: string): Promise<string[]> {
	const entries = await readdir(resolve(pluginRoot, directory), { withFileTypes: true });
	const nested = await Promise.all(
		entries.map((entry) => {
			const path = `${directory}/${entry.name}`;
			return entry.isDirectory() ? markdownFiles(path) : entry.name.endsWith(".md") ? [path] : [];
		}),
	);
	return nested.flat();
}

function readPluginFile(relative: string): Promise<string> {
	return readFile(resolve(pluginRoot, relative), "utf8");
}

async function readManifest() {
	const raw: unknown = JSON.parse(await readPluginFile("plugin.json"));
	return parsePluginManifest(raw);
}

describe("eform-craft five-role manifest", () => {
	it("uses the existing SDK contract without broadening plugin permissions", async () => {
		const manifest = await readManifest();
		expect(manifest.id).toBe("eform-craft");
		expect(manifest.pluginApiVersion).toBe("^2.11.0");
		expect(manifest.permissions).toEqual(["agent.skills.control"]);
		expect(manifest.agent?.agents?.map((agent) => agent.id)).toEqual(agentIds);
		expect(manifest.agent?.agents?.map((agent) => agent.roles)).toEqual([
			["master"],
			["business"],
			["developer"],
			["tester"],
			["deployer"],
		]);
		for (const agent of manifest.agent?.agents ?? []) {
			expect(agent.mode).toBe("coding");
			expect(agent.mentionHandle).toBe(agent.id === "eform" ? "eform" : `eform-${agent.id}`);
		}
	});

	it("keeps the team and leader IDs and binds all five members explicitly", async () => {
		const manifest = await readManifest();
		expect(manifest.agent?.teams).toHaveLength(1);
		const team = manifest.agent!.teams![0]!;
		expect(team.id).toBe("eform-studio");
		expect(team.mode).toBe("coding");
		expect(team.members.map((member) => member.agent)).toEqual(agentIds);
		expect(team.members.every((member) => !member.role && member.responsibility.trim())).toBe(true);
		expect(team.workflowPath).toBe("agent/workflows/studio.md");
	});

	it("ships all manifest-declared prompt and workflow resources", async () => {
		const manifest = await readManifest();
		for (const resource of listPluginManifestResources(manifest)) {
			if (resource.path.startsWith("dist/")) continue;
			const info = await stat(resolve(pluginRoot, resource.path));
			expect(info.isFile() || info.isDirectory(), resource.path).toBe(true);
		}
		for (const agent of manifest.agent?.agents ?? []) {
			expect(agent.systemPromptPath).toBe(`agent/agents/${agent.id}.md`);
			const prompt = await readPluginFile(agent.systemPromptPath!);
			expect(prompt).toContain("AIMES CustomDev");
			expect(prompt.trim().length).toBeGreaterThan(200);
		}
	});

	it("keeps Skills plugin-shared and resolves both locales", async () => {
		const manifest = await readManifest();
		expect(manifest.agent?.skillPaths).toEqual(["agent/skills"]);
		expect(manifest.agent?.skillPresentation?.defaultVisibility).toBe("hidden");
		const placeholders = [
			manifest.name,
			manifest.description,
			...(manifest.agent?.agents ?? []).flatMap((agent) => [agent.name, agent.description]),
			...(manifest.agent?.teams ?? []).flatMap((team) => [team.name, team.description]),
		];
		for (const locale of ["zh", "en"]) {
			const messages = JSON.parse(await readPluginFile(`locales/${locale}.json`)) as Record<string, string>;
			for (const raw of placeholders) {
				const key = /^%([^%]+)%$/.exec(raw ?? "")?.[1];
				expect(key, `${raw} must be a locale placeholder`).toBeDefined();
				expect(messages[key!], `${key} missing in ${locale}`).toBeTruthy();
			}
		}
	});
});

describe("eform-craft shared Skills and migration", () => {
	it("integrates all five reviewed candidates and all fourteen eformSkill topics, without legacy duplicates", async () => {
		const directories = await readdir(resolve(pluginRoot, "agent/skills"));
		expect(directories.sort()).toEqual(skillNames);
		for (const name of skillNames) {
			const content = await readSkill(name);
			const header = /^---\r?\nname: ([^\r\n]+)\r?\ndescription: ("[^\r\n]+")\r?\n---/.exec(content);
			expect(header, name).not.toBeNull();
			expect(header![1]).toBe(name);
			const description: unknown = JSON.parse(header![2]!);
			expect(typeof description).toBe("string");
			expect(String(description).length).toBeLessThanOrEqual(1024);
			expect(content).toContain("来源");
		}
	});

	it("has no broken packaged Markdown links or hardcoded workstation paths", async () => {
		for (const path of ["README.md", ...(await markdownFiles("agent"))]) {
			const content = await readPluginFile(path);
			expect(content, path).not.toMatch(/[A-Z]:[\\/]/i);
			for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
				const target = match[1]!.split("#")[0]!;
				if (!target || /^[a-z]+:\/\//i.test(target)) continue;
				const info = await stat(resolve(pluginRoot, dirname(path), target));
				expect(info.isFile(), `${path} -> ${target}`).toBe(true);
			}
		}
	});

	it("keeps each shared domain rule under one authoritative Skill", async () => {
		const skills = await Promise.all(skillNames.map(async (name) => ({ name, text: await readSkill(name) })));
		expect(skills.filter(({ text }) => text.includes("UNIX_TIMESTAMP()")).map(({ name }) => name)).toEqual([
			"database-change-control",
		]);
		expect(skills.filter(({ text }) => text.includes("creator_id")).map(({ name }) => name)).toEqual([
			"user-metadata-and-audit-boundary",
		]);
		expect(skills.filter(({ text }) => text.includes("t_base_organization")).map(({ name }) => name)).toEqual([
			"project-architecture-and-runtime-map",
		]);
		const metadata = await readSkill("user-metadata-and-audit-boundary");
		for (const marker of ["modifier_id", "BIGINT", "t_sys_user.id", "UserContextHolder", "不接受 DTO 提交"]) {
			expect(metadata).toContain(marker);
		}
		const database = await readSkill("database-change-control");
		expect(database).toContain("秒级");
		expect(database).toContain("Workshop");
	});

	it("limits Workshop UI rules and retains verified evidence without inventing CustomDev contracts", async () => {
		const ui = await readSkill("frontend-buttons-and-forms");
		expect(ui).toContain("不是 CustomDev 强制 UI 合同");
		for (const marker of ["primary", "success", "danger", "mes-form", "#footer"]) expect(ui).toContain(marker);
		const facts = await readSkill("project-architecture-and-runtime-map");
		for (const marker of [
			"2026-11-06",
			"t_base_workshop",
			"department_id",
			"t_base_material",
			"material_code",
			"t_base_process",
			"t_base_personnel",
			"personnel_code",
			"待验证",
		]) {
			expect(facts).toContain(marker);
		}
	});

	it("removes legacy persona and injection protocols instead of advertising them as CustomDev features", async () => {
		expect((await readdir(resolve(pluginRoot, "agent/agents"))).sort()).toEqual(
			agentIds.map((id) => `${id}.md`).sort(),
		);
		for (const path of await markdownFiles("agent")) {
			const content = await readPluginFile(path);
			for (const legacy of [
				"ESIGN-ANCHOR",
				"AUDIT-ANCHOR",
				"window.EFORM",
				"__EFORM_MOCK__",
				"F_Process",
				"admin123",
			]) {
				expect(content, path).not.toContain(legacy);
			}
		}
		const readme = await readPluginFile("README.md");
		expect(readme).toContain("旧 `@esign` / `@eaudit` Agent 不再提供");
		expect(readme).toContain("自建 Team/配置需用户改绑");
		expect(readme).toContain("不是 per-agent Skill 隔离");
	});
});

describe("eform-craft workflow text contracts (not LLM behavior evaluation)", () => {
	it("delivers one shared operation contract to members and routes standalone agents to it", async () => {
		const manifest = await readManifest();
		const team = manifest.agent!.teams![0]!;
		expect(team.members[0]?.instructionsPath).toBeUndefined();
		for (const member of team.members.slice(1)) expect(member.instructionsPath).toBe("agent/operating-contract.md");
		for (const id of agentIds) {
			expect(await readPluginFile(`agent/agents/${id}.md`)).toContain("../operating-contract.md");
		}
		expect(await readPluginFile(team.workflowPath!)).toContain("../operating-contract.md");
	});

	it("preserves the common source-attachment-to-engineering handoffs and test-server acceptance order", async () => {
		const workflow = await readPluginFile("agent/workflows/studio.md");
		const stages = [
			"## 1. 环境预检",
			"## 2. 需求与规格",
			"## 3. 开发",
			"## 4. 本地测试",
			"## 5. 校验占位（跳过）",
			"## 6. dev 集成",
			"## 7. dev 测试包与测试服务器验收",
		];
		let previous = -1;
		for (const stage of stages) {
			const index = workflow.indexOf(stage);
			expect(index, stage).toBeGreaterThan(previous);
			previous = index;
		}
		for (const marker of ["team_delegate_task", "team_wait_tasks", "自包含", "不重做已产生的副作用"]) {
			expect(workflow).toContain(marker);
		}
		const requirements = await readPluginFile("agent/agents/requirements.md");
		expect(requirements.indexOf("entity-form-attachment-parsing")).toBeLessThan(
			requirements.indexOf("requirements-design-to-delivery"),
		);
		expect(requirements).toContain("没有表单附件的一般二开");
		expect(requirements).toContain("原型是需求材料，不替代");
		expect(requirements).toContain("form-field-specification-and-base-data");
	});

	it("documents each conditional Skill's positive and negative trigger", async () => {
		const signature = await readSkill("electronic-signature-field-implementation");
		for (const marker of [
			"同时确认",
			"最终需求字段清单",
			"明确要求新增/修改",
			"仅有 signature 字段",
			"均不触发",
			"先由需求角色",
			"不可抵赖",
		])
			expect(signature).toContain(marker);
		const field = await readSkill("form-field-specification-and-base-data");
		for (const marker of [
			"classXxx",
			"独立 `signature`",
			"不并行输出旧",
			"实际数据库标准列名",
			"已有列直接沿用",
			"非展示关联",
		])
			expect(field).toContain(marker);
		const lifecycle = await readSkill("form-record-lifecycle");
		expect(lifecycle).toContain("只有需求或已核实项目行为显示状态流转时才调用");
		expect(lifecycle).toContain("不是 CustomDev 默认");
		const audit = await readSkill("operation-audit-domain");
		expect(audit).toContain("仅用户明确要求新增/修改表单操作审计功能时调用");
		expect(audit).toContain("纸面签字栏不触发");
		expect(audit).toContain("不默认保存完整表单快照");
	});

	it("documents Runtime dual roots, Nacos failure and secret boundaries, without adding host gates", async () => {
		const contract = await readPluginFile("agent/operating-contract.md");
		for (const marker of [
			"Runtime",
			"per-project AI workspace",
			"project-config.md",
			"不自行拼接",
			"不继续依赖",
			"明确不存在",
			"读取失败",
			"配置冲突",
			"环境身份不明",
			"任何情况下都不修改 Nacos",
			"不连接生产数据库",
			"不复制到 Skill、源码、日志、提交说明或普通输出",
			"DBX `aimes`",
			"不执行写入或 DDL",
			"不是 per-agent Skill 隔离",
			"不是实现于宿主的不可绕过硬门禁",
		]) {
			expect(contract).toContain(marker);
		}
	});

	it("keeps the agreed Git sequence, risk-based tests and test-only deployment fallback", async () => {
		const contract = await readPluginFile("agent/operating-contract.md");
		for (const marker of [
			"有未提交改动先报告",
			"询问要新建的分支名",
			"每项涉及 `dev`",
			"任务级全权",
			"不插入额外的本地复测",
			"创建指向 `dev` 的远端 PR",
			"实际集成提交",
			"完整 CustomDev",
			"computer-use",
			"本地行为测试",
			"不停止同机其他服务",
			"只交付构建产物",
			"不处理生产 `main` PR",
		])
			expect(contract).toContain(marker);
		const tester = await readPluginFile("agent/agents/tester.md");
		expect(tester).toContain("不可用/失败时说明原因");
		expect(tester).toContain("不等于跳过本地测试或测试服务器验收");
		const deployer = await readPluginFile("agent/agents/deployer.md");
		expect(deployer).toContain("回滚路径");
		expect(deployer).toContain("不猜目录/命令");
	});
});
