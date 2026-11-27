// Copyright The Open Forge contributors.
import { readFile } from "node:fs/promises";
import { listPluginManifestResources, parsePluginManifest } from "@vetta-org/plugin-sdk/manifest";
import { describe, expect, it } from "vitest";

const ids = ["demo", "requirements", "prototype", "tester", "deployer"];

function read(path: string): Promise<string> {
	return readFile(new URL(path, import.meta.url), "utf8");
}

async function readJson(path: string): Promise<unknown> {
	return JSON.parse(await read(path));
}

function prompt(id: string): Promise<string> {
	return read(`../agent/agents/${id}.md`);
}

const manifest = parsePluginManifest(await readJson("../plugin.json"));

async function memberGuide(id: string): Promise<string> {
	const path = manifest.agent?.teams?.[0]?.members.find(({ agent }) => agent === id)?.instructionsPath;
	if (!path) throw new Error(`Missing packaged guide for ${id}`);
	return read(`../${path}`);
}

// These checks protect shipped instructions and assembly, not model behavior.
describe("AIMES form demo preset", () => {
	it("is offered alongside formal eform in both Desktop profiles", async () => {
		const selection = await readJson("../../../tenants.json");
		const common = expect.arrayContaining(["eform-craft", manifest.id]);
		expect(selection).toMatchObject({
			profiles: { development: { common }, production: { common } },
		});
	});

	it("assembles a distinct Code Team with five explicit local members and no permissions", async () => {
		expect(manifest.id).toBe("eform-demo");
		expect(manifest.permissions).toEqual([]);
		expect(manifest.agent?.agents?.map(({ id, mode, mentionHandle }) => [id, mode, mentionHandle])).toEqual(
			ids.map((id) => [id, "coding", id === "demo" ? "eform-demo" : `eform-demo-${id}`]),
		);
		expect(manifest.agent?.teams).toHaveLength(1);
		const team = manifest.agent?.teams?.[0];
		expect(team).toMatchObject({ id: "eform-demo-studio", mode: "coding", workflowPath: "agent/workflows/demo.md" });
		expect(team?.members.map(({ agent }) => agent)).toEqual(ids);
		for (const resource of listPluginManifestResources(manifest)) {
			if (resource.field !== "entry") expect(await read(`../${resource.path}`), resource.field).not.toBe("");
		}
	});

	it("resolves all localized entry and member labels in Chinese and English", async () => {
		const entries = [manifest, ...(manifest.agent?.teams ?? []), ...(manifest.agent?.agents ?? [])];
		for (const lang of ["zh", "en"]) {
			const messages = await readJson(`../locales/${lang}.json`);
			for (const text of entries.flatMap(({ name, description }) => [name, description])) {
				expect(text).toMatch(/^%[^%]+%$/);
				expect(messages).toHaveProperty([text?.slice(1, -1) ?? ""], expect.stringMatching(/\S/));
			}
		}
	});

	it("routes a user request through requirements, prototype, tester, and deployer without leader re-review", async () => {
		const workflow = await read("../agent/workflows/demo.md");
		expect(workflow).toMatch(/`requirements`[\s\S]*`prototype`[\s\S]*`tester`[\s\S]*`deployer`/);
		expect(workflow).toContain("默认包含 AIMES 内嵌入口");
		expect(await prompt("demo")).toContain("不复审产物");
	});

	it("restricts the lead to relaying: no member work, no attachment parsing, act only on member request", async () => {
		const lead = await prompt("demo");
		expect(lead).toContain("主控只面向用户，不面向执行");
		expect(lead).toContain("不解析附件");
		expect(lead).toContain("原样转交目标成员");
		expect(lead).toContain("不做任何事，只传话");
		const workflow = await read("../agent/workflows/demo.md");
		expect(workflow).toContain("不代做成员职责内的工作");
		expect(workflow).toContain("只转发用户目标与材料");
	});

	it("closes the pipeline after one pass and forbids re-dispatch to completed stages without a member request", async () => {
		const lead = await prompt("demo");
		expect(lead).toContain("流程按工作流完整走一遍即结束");
		expect(lead).toContain("不得对已完成阶段重复派工");
		const workflow = await read("../agent/workflows/demo.md");
		expect(workflow).toContain("不得对已完成阶段重复派工");
		expect(workflow).toContain("不安排复测、复验或第二遍执行");
	});

	it("keeps CustomDev project discovery with the lead and permits standalone preview only on request", async () => {
		const lead = await prompt("demo");
		expect(lead).toContain("Runtime 给出的项目根/AI workspace 根与当前授权");
		expect(lead).toContain("确认会话绑定的是目标 AIMES CustomDev 项目");
		expect(lead).toContain("不要求本机启动 CustomDev 后端或容器");
		expect(lead).toContain("只有用户明确只要本机预览");
		expect(lead).not.toMatch(/operating-contract\.md|project-architecture-and-runtime-map/);
	});

	it("passes source evidence and one usable field contract to prototype without requiring database introspection", async () => {
		const requirements = await prompt("requirements");
		expect(requirements).toContain("有实体表单附件时");
		expect(requirements).toContain("已确认、演示假设和待核实");
		const guide = await memberGuide("requirements");
		expect(guide).toContain("无法确定是对象还是文本时默认对象");
		expect(guide).toContain("`material.name` 才是文本");
		expect(guide).toMatch(/取值来源[\s\S]*默认值[\s\S]*精度[\s\S]*空值[\s\S]*联动/);
		expect(guide).toContain("不查库");
	});

	it("ships a deployment guide that distinguishes menu route, HTML entry, mount and rollback", async () => {
		const guide = await memberGuide("deployer");
		expect(guide).toContain("子应用 HTML 入口，不是宿主业务路由");
		expect(guide).toContain("只能通过运行态验收确认");
		expect(guide).toContain("团队不打开页面、不请求真实 API");
		expect(guide).toContain("恢复上一版匹配的前端制品及菜单/注册配置");
		expect(guide).toContain("不覆盖其他模块");
	});

	it("carries list and form field shapes to a portable mock-only prototype", async () => {
		const requirements = await prompt("requirements");
		expect(requirements).toContain("列表页、表单页");
		const prototype = await prompt("prototype");
		expect(prototype).toContain("字段类型贯穿 mock、表单和保存回显");
		expect(prototype).toContain("`base: './'`");
		expect(prototype).toContain("在构建时导入并嵌入前端产物");
		expect(prototype).toContain("不要 `fetch` 本地 JSON");
		expect(prototype).toContain("默认接入目标 AIMES 的 qiankun 主界面");
		expect(prototype).toContain("不要在界面上加「原型」「演示」「Mock」或「非生产」");
	});

	it("limits team testing to builds, static review, and optional unit tests", async () => {
		const tester = await prompt("tester");
		expect(tester).toContain("只做必要的构建检查与静态代码审视");
		expect(tester).toContain("单元测试能不用就不用");
		expect(tester).toContain("不做实际交互测试或操作测试");
		const workflow = await read("../agent/workflows/demo.md");
		expect(workflow).toContain("不把交互验收改派给其他成员");
		expect(await memberGuide("deployer")).toContain("由用户自行决定是否执行");
	});

	it("ships a frontend-only merged candidate while keeping mock scoped to the new form", async () => {
		const deployer = await prompt("deployer");
		expect(deployer).toContain("从同一个合并后的候选用项目实际脚本只构建前端包");
		expect(deployer).toContain("不构建后端制品、不打 jar、不替换 jar、不重启后端服务");
		const workflow = await read("../agent/workflows/demo.md");
		expect(workflow).toContain("后端无改动，不打 jar、不重启服务");
		const prototype = await prompt("prototype");
		expect(prototype).toContain("mock 作用域仅限本次演示表单");
		expect(prototype).toContain("保留既有模块的真实 API");
		const tester = await prompt("tester");
		expect(tester).toContain("已依赖真实后端的现有模块");
	});

	it("builds immediately after a clean merge and hands off without post-build checks", async () => {
		const deployer = await prompt("deployer");
		expect(deployer).toContain("合并无冲突就直接构建");
		expect(deployer).toContain("仅在合并出现实际冲突时");
		expect(deployer).toContain("构建成功后不再追加测试、静态检测或制品复验");
		const workflow = await read("../agent/workflows/demo.md");
		expect(workflow).toContain("构建成功即出部署指导");
		expect(await memberGuide("deployer")).toContain("不加跑测试或制品复验");
	});

	it("preserves demo mock across master integration and documents user-run acceptance", async () => {
		const deployer = await prompt("deployer");
		expect(deployer).toMatch(
			/推送私有分支[\s\S]*`master`[\s\S]*合入本地私有分支[\s\S]*从同一个合并后的候选用项目实际脚本只构建前端包/,
		);
		expect(deployer).toContain("保留本表单的随包 JSON mock、不为它新增后端");
		expect(deployer).toContain("`base: './'`");
		expect(deployer).toContain("AIMES 菜单配置与目标路由");
		expect(await memberGuide("deployer")).toContain("从 AIMES 菜单进入并完成核心操作");
		expect(await prompt("tester")).toContain("不能把构建成功写成实际接入通过");
	});
});
