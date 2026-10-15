// Copyright The Open Forge contributors.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface Manifest {
	readonly id: string;
	readonly name?: string;
	readonly description?: string;
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
			avatar?: string;
			systemPromptPath?: string;
			roles?: string[];
		}[];
		readonly teams?: {
			id: string;
			name: string;
			description?: string;
			members: { agent: string; responsibility: string }[];
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

describe("AllstarCoding manifest", () => {
	it("declares the conductor and helper agents with minimal permissions", async () => {
		const manifest = await readManifest();
		expect(manifest.id).toBe("allstar-coding");
		expect(manifest.agent?.agents?.map((agent) => agent.id)).toEqual(["allstar", "helper"]);
		// 声明面（agents/teams）不需要权限；声明的是技能挂载 + ac-fence 事中拦截（hook 注册与执行），
		// 以及 fence.ts 装配实际调用的 ctx.fs 方法：fence-log 去重读/stat 与 state.md 兜底（fs.read）、
		// fence-log 落盘 writeFile/createDirectory（fs.write）。少一项都会出现 permission denied 或静默失效。
		expect(manifest.permissions).toEqual([
			"agent.skills.control",
			"agent.hooks.register",
			"agent.hookHandler.execute",
			"fs.read",
			"fs.write",
		]);
	});

	it("ships a readable system prompt for every agent", async () => {
		const manifest = await readManifest();
		for (const agent of manifest.agent?.agents ?? []) {
			expect(agent.systemPromptPath).toBeDefined();
			const prompt = await readPluginFile(agent.systemPromptPath!);
			expect(prompt.trim().length).toBeGreaterThan(200);
		}
	});

	it("builds the pipeline team led by the conductor with the resident helper", async () => {
		const manifest = await readManifest();
		const agentIds = new Set((manifest.agent?.agents ?? []).map((agent) => agent.id));
		const teams = manifest.agent?.teams ?? [];
		expect(teams.map((team) => team.id)).toEqual(["allstar-pipeline"]);
		for (const team of teams) {
			// 队长必须是本插件自己的智能体（第一个成员）。
			expect(team.members[0]?.agent).toBe("allstar");
			expect(team.members.every((member) => agentIds.has(member.agent))).toBe(true);
			expect(team.members.every((member) => member.responsibility.trim().length > 0)).toBe(true);
			const workflow = await readPluginFile(team.workflowPath!);
			expect(workflow.trim().length).toBeGreaterThan(200);
		}
	});

	it("hides plugin skills from product surfaces (internal stage manuals)", async () => {
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

const STAGE_SKILLS = [
	"ac-pipeline",
	"ac-requirements",
	"ac-design",
	"ac-taskplan",
	"ac-dev",
	"ac-review",
	"ac-whitebox",
	"ac-blackbox",
	"ac-deploy",
	"ac-finalize",
	"ac-gate",
] as const;

describe("AllstarCoding stage skills", () => {
	it("ships all eleven stage manuals with valid frontmatter", async () => {
		for (const skill of STAGE_SKILLS) {
			const content = await readPluginFile(`agent/skills/${skill}/SKILL.md`);
			expect(content.startsWith("---"), `${skill} must start with frontmatter`).toBe(true);
			const frontmatterEnd = content.indexOf("---", 3);
			expect(frontmatterEnd, `${skill} frontmatter must close`).toBeGreaterThan(0);
			const frontmatter = content.slice(3, frontmatterEnd);
			expect(frontmatter, `${skill} frontmatter must name itself`).toContain(`name: ${skill}`);
			expect(frontmatter.match(/description:/), `${skill} must declare a description`).toBeTruthy();
			const body = content.slice(frontmatterEnd + 3);
			expect(body.trim().length, `${skill} body must be substantive`).toBeGreaterThan(500);
		}
	});

	it("cross-references between skills stay within the shipped set", async () => {
		const shipped = new Set<string>(STAGE_SKILLS);
		for (const skill of STAGE_SKILLS) {
			const content = await readPluginFile(`agent/skills/${skill}/SKILL.md`);
			// 只统计「技能引用」：ac-audit 是工具（scripts/ac-audit.mjs）、
			// ac-archive 是产物归档目录（docs/ac-archive/）、ac-fence 是围栏代码模块（src/fence），都不是技能
			const references = [...content.matchAll(/`?(ac-[a-z-]+)`?/g)]
				.map((match) => match[1])
				.filter((ref) => ref !== "ac-audit" && ref !== "ac-archive" && ref !== "ac-fence");
			for (const reference of new Set(references)) {
				expect(shipped.has(reference), `${skill} references missing skill ${reference}`).toBe(true);
			}
		}
	});
});
