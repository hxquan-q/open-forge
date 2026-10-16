// Copyright The Open Forge contributors.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface Manifest {
	readonly id: string;
	readonly name?: string;
	readonly description?: string;
	readonly version?: string;
	readonly permissions?: string[];
	readonly agent?: {
		readonly skillPaths?: string[];
		readonly skillPresentation?: {
			readonly defaultVisibility?: string;
		};
		readonly agents?: {
			id: string;
			name: string;
			description?: string;
			mentionHandle?: string;
			systemPromptPath?: string;
			roles?: string[];
		}[];
		readonly teams?: {
			id: string;
			name: string;
			description?: string;
			members: {
				agent?: string;
				role?: string;
				responsibility: string;
			}[];
			workflowPath?: string;
		}[];
	};
}

async function readManifest(): Promise<Manifest> {
	return JSON.parse(await readFile(resolve(import.meta.dirname, "../plugin.json"), "utf8")) as Manifest;
}

async function readLocale(locale: string): Promise<Record<string, string>> {
	return JSON.parse(await readFile(resolve(import.meta.dirname, `../locales/${locale}.json`), "utf8")) as Record<
		string,
		string
	>;
}

function readPluginFile(relative: string): Promise<string> {
	return readFile(resolve(import.meta.dirname, "..", relative), "utf8");
}

describe("eform-craft manifest", () => {
	it("declares the three-member team with the minimal skill-mount permission", async () => {
		const manifest = await readManifest();
		expect(manifest.id).toBe("eform-craft");
		expect(manifest.agent?.agents?.map((agent) => agent.id)).toEqual(["eform", "esign", "eaudit"]);
		// 纯提示词资产 preset：挂技能目录所需且仅此一项权限。
		expect(manifest.permissions).toEqual(["agent.skills.control"]);
		// 三成员角色：队长 master、签名专员 developer、审计专员 auditor。
		const roles = Object.fromEntries((manifest.agent?.agents ?? []).map((agent) => [agent.id, agent.roles]));
		expect(roles.eform).toContain("master");
		expect(roles.esign).toContain("developer");
		expect(roles.eaudit).toContain("auditor");
	});

	it("declares the eform-studio team led by eform with a workflow brief", async () => {
		const manifest = await readManifest();
		const teams = manifest.agent?.teams ?? [];
		expect(teams.map((team) => team.id)).toEqual(["eform-studio"]);
		const team = teams[0]!;
		// 第一个成员即队长，必须解析到本插件 agent（eform）。
		expect(team.members[0]?.agent).toBe("eform");
		expect(team.members.map((member) => member.agent)).toEqual(["eform", "esign", "eaudit"]);
		expect(team.workflowPath).toBe("agent/workflows/studio.md");
		const workflow = await readPluginFile(team.workflowPath!);
		expect(workflow.trim().length).toBeGreaterThan(400);
		// 团队任务书必须写死派工协议与共享契约验收。
		expect(workflow).toContain("team_delegate_task");
		expect(workflow).toContain("capabilities");
	});

	it("ships a readable system prompt for every agent", async () => {
		const manifest = await readManifest();
		for (const agent of manifest.agent?.agents ?? []) {
			expect(agent.systemPromptPath).toBeDefined();
			const prompt = await readPluginFile(agent.systemPromptPath!);
			expect(prompt.trim().length).toBeGreaterThan(200);
		}
	});

	it("hides plugin skills from product surfaces (internal manual)", async () => {
		const manifest = await readManifest();
		expect(manifest.agent?.skillPaths).toEqual(["agent/skills"]);
		expect(manifest.agent?.skillPresentation?.defaultVisibility).toBe("hidden");
	});

	it("resolves every %key% placeholder in both locales", async () => {
		const manifest = await readManifest();
		const placeholders = [
			manifest.name ?? "",
			manifest.description ?? "",
			...(manifest.agent?.agents ?? []).flatMap((agent) => [agent.name, agent.description ?? ""]),
			...(manifest.agent?.teams ?? []).flatMap((team) => [team.name, team.description ?? ""]),
		];
		expect(placeholders.length).toBeGreaterThan(0);
		for (const locale of ["zh", "en"]) {
			const messages = await readLocale(locale);
			for (const raw of placeholders) {
				const key = /^%([^%]+)%$/.exec(raw)?.[1];
				expect(key, `${raw} must be a locale placeholder`).toBeDefined();
				expect(messages[key!], `${key} missing in ${locale}`).toBeTruthy();
			}
		}
	});
});

describe("eform-craft skill (board 1: form generation)", () => {
	it("ships the manual with valid frontmatter and substantive body", async () => {
		const content = await readPluginFile("agent/skills/eform-craft/SKILL.md");
		expect(content.startsWith("---")).toBe(true);
		const frontmatterEnd = content.indexOf("---", 3);
		expect(frontmatterEnd).toBeGreaterThan(0);
		const frontmatter = content.slice(3, frontmatterEnd);
		expect(frontmatter).toContain("name: eform-craft");
		expect(frontmatter.match(/description:/)).toBeTruthy();
		const body = content.slice(frontmatterEnd + 3);
		expect(body.trim().length).toBeGreaterThan(500);
	});

	it("keeps the recognition contract tables intact in the manual", async () => {
		const content = await readPluginFile("agent/skills/eform-craft/SKILL.md");
		// 识别合同锚点：固定命名映射的六个 fieldName 与类型标记枚举必须在场。
		for (const fieldName of [
			"F_Process",
			"F_Lot Number",
			"F_Product Name",
			"F_Operator",
			"F_Reviewer",
			"F_Quality Inspector",
		]) {
			expect(content).toContain(fieldName);
		}
		for (const marker of ["[文本]", "[日期]", "[长日期]", "[整数]", "[组织]", "[电子签]"]) {
			expect(content).toContain(marker);
		}
		// 页面定位锚点：form.html/index.html 是一期交付的实际表单应用，
		// 不是"视觉可糙"的原型——防止定位回退。
		expect(content).toContain("实际表单应用");
		expect(content).not.toContain("视觉可糙");
	});

	it("keeps the six-artifact contract and record lifecycle in the manual", async () => {
		const content = await readPluginFile("agent/skills/eform-craft/SKILL.md");
		for (const artifact of ["schema.json", "form.html", "index.html", "mock-data.json", "form-spec.md", "audit-log.jsonl", "__EFORM_MOCK__"]) {
			expect(content).toContain(artifact);
		}
		// 数据生命周期状态机（draft→saved→approved 单向，approved 锁定）。
		expect(content).toContain(`["draft","saved","approved"]`);
		expect(content).toContain("approved 是终态");
		// 按钮语义针对数据记录，不是网页文件的增删查改。
		expect(content).toContain("数据记录的增删查改");
	});

	it("keeps the shared contract section as the single authority", async () => {
		const content = await readPluginFile("agent/skills/eform-craft/SKILL.md");
		// §6 共享契约：锚点、键前缀、桩函数、五类埋点事件、audit-log.jsonl 落点。
		expect(content).toContain("共享契约（三成员唯一权威源");
		expect(content).toContain("ESIGN-ANCHOR: signature components inject here (do not remove)");
		expect(content).toContain("AUDIT-ANCHOR: audit components inject here (do not remove)");
		expect(content).toContain("eform:<slug>:records");
		expect(content).toContain("eform:<slug>:auditEnabled");
		expect(content).toContain("eform:<slug>:audit-log");
		expect(content).toContain("window.EFORM");
		for (const event of ["eform:audit:create", "eform:audit:save", "eform:audit:approve", "eform:audit:print", "eform:audit:export"]) {
			expect(content).toContain(event);
		}
		// capabilities 默认值：audit 默认 false。
		expect(content).toContain("默认 **false**");
	});
});

describe("esign-craft skill (board 2: e-signature)", () => {
	it("ships the manual with valid frontmatter and the full signing flow", async () => {
		const content = await readPluginFile("agent/skills/esign-craft/SKILL.md");
		expect(content.startsWith("---")).toBe(true);
		const frontmatterEnd = content.indexOf("---", 3);
		expect(frontmatterEnd).toBeGreaterThan(0);
		expect(content.slice(3, frontmatterEnd)).toContain("name: esign-craft");
		const body = content.slice(frontmatterEnd + 3);
		expect(body.trim().length).toBeGreaterThan(500);
		// 签名全流程要素：验证弹窗、手写录入、清空重签、审核锁定。
		for (const anchor of ["身份验证", "手写", "清空重签", "锁定"]) {
			expect(body).toContain(anchor);
		}
		// 签名数据模型与状态。
		expect(body).toContain("signatures");
		expect(body).toContain("pending | signed | locked");
		// 共享契约引用（不重述）与演示明示。
		expect(body).toContain("eform-craft 技能 §6 共享契约");
		expect(body).toContain("演示验证");
	});

	it("keeps the injection discipline (anchor-only writes, idempotent, prefixed)", async () => {
		const content = await readPluginFile("agent/skills/esign-craft/SKILL.md");
		expect(content).toContain("ESIGN-ANCHOR");
		expect(content).toContain("幂等");
		expect(content).toContain("eform-esign-");
		expect(content).toContain("不重定义");
	});
});

describe("eaudit-craft skill (board 3: operation audit)", () => {
	it("ships the manual with valid frontmatter and the five audited events", async () => {
		const content = await readPluginFile("agent/skills/eaudit-craft/SKILL.md");
		expect(content.startsWith("---")).toBe(true);
		const frontmatterEnd = content.indexOf("---", 3);
		expect(frontmatterEnd).toBeGreaterThan(0);
		expect(content.slice(3, frontmatterEnd)).toContain("name: eaudit-craft");
		const body = content.slice(frontmatterEnd + 3);
		expect(body.trim().length).toBeGreaterThan(500);
		// 五类操作事件 + 日志行结构。
		expect(body).toContain("create | save | approve | print | export");
		expect(body).toContain("fieldsSnapshot");
		expect(body).toContain("recordId");
		// 审计开关：默认 false（需求原文语义）。
		expect(body).toContain("默认 **false**");
	});

	it("keeps the view-only red line and the shared contract reference", async () => {
		const content = await readPluginFile("agent/skills/eaudit-craft/SKILL.md");
		// 仅查看不可删（无删除入口、仅追加）。
		expect(content).toContain("仅查看不可删");
		expect(content).toContain("不提供任何删除");
		expect(content).toContain("追加");
		// 共享契约引用与注入纪律。
		expect(content).toContain("eform-craft 技能 §6 共享契约");
		expect(content).toContain("AUDIT-ANCHOR");
		expect(content).toContain("eform-audit-");
		expect(content).toContain("幂等");
		// 落盘文件。
		expect(content).toContain("audit-log.jsonl");
	});
});

describe("eform-fields-catalog skill (board 1 support: field types)", () => {
	it("ships the manual with valid frontmatter and substantive body", async () => {
		const content = await readPluginFile("agent/skills/eform-fields-catalog/SKILL.md");
		expect(content.startsWith("---")).toBe(true);
		const frontmatterEnd = content.indexOf("---", 3);
		expect(frontmatterEnd).toBeGreaterThan(0);
		expect(content.slice(3, frontmatterEnd)).toContain("name: eform-fields-catalog");
		const body = content.slice(frontmatterEnd + 3);
		expect(body.trim().length).toBeGreaterThan(500);
	});

	it("keeps the three-column catalog using the JSON type vocabulary", async () => {
		const content = await readPluginFile("agent/skills/eform-fields-catalog/SKILL.md");
		// 速查总表固定三列（业务叫法 / fieldType / 值结构），且 type 词与 billformSchema 统一。
		expect(content).toContain("| 业务叫法 | fieldType | 值结构 |");
		// 用户点名与新增的类型全部在场，且用词为 JSON type 词。
		for (const type of ["string", "int", "double", "date", "datetime", "time", "boolean", "object", "select", "entry", "subEntry"]) {
			expect(content).toContain(type);
		}
		// 单据体 / 子单据体的值结构与自嵌套约束在场。
		expect(content).toContain("Array<Row>");
		expect(content).toContain("可自嵌套");
	});

	it("keeps the replacement framing and cross-references", async () => {
		const content = await readPluginFile("agent/skills/eform-fields-catalog/SKILL.md");
		// 本手册是字段类型唯一权威，取代 §1 的字段语义（非补充）。
		expect(content).toContain("唯一权威");
		// 层级归属交给结构模板 skill。
		expect(content).toContain("eform-structure-templates");
		// 电子签不在本主 agent 目录内，归 esign 专员子agent。
		expect(content).toContain("esign-craft");
	});
});

describe("eform-structure-templates skill (board 1 support: structure template)", () => {
	it("ships the manual with the inline sample JSON and substantive body", async () => {
		const content = await readPluginFile("agent/skills/eform-structure-templates/SKILL.md");
		// 本手册无 frontmatter（仅 H1 标题）；只校验正文体量。
		expect(content.trim().length).toBeGreaterThan(500);
		// 原样内联 billformSchema.json，层级以它为锚，不得二次抽象丢层级。
		expect(content).toContain("billformSchema.json");
		// 原样 JSON 锚点：工具栏 / 单据体 / 子单据体三层角色。
		expect(content).toContain(`"name": "工具栏"`);
		expect(content).toContain(`"type": "entry"`);
		expect(content).toContain(`"type": "subEntry"`);
	});

	it("keeps the layered-logic framing (template, not a fixed skeleton)", async () => {
		const content = await readPluginFile("agent/skills/eform-structure-templates/SKILL.md");
		// 价值在层级区分的逻辑，而非具体内容。
		expect(content).toContain("层级区分的逻辑");
		// 子单据体允许自嵌套，结构不封顶。
		expect(content).toContain("允许自嵌套");
		// 灵活形态：多单据体 / 多子单据体 / 仅单据头均合法（非绝对三/两层）。
		expect(content).toContain("0~N 张单据体");
		// 示例非绝对：尽信书不如无书。
		expect(content).toContain("尽信书不如无书");
		// 反向流转按钮保留提示（撤销提交 / 反审核）。
		expect(content).toContain("撤销提交");
		expect(content).toContain("反审核");
		// 值类型去查字段目录 skill。
		expect(content).toContain("eform-fields-catalog");
	});
});
