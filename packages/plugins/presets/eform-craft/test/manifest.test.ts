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
			systemPromptPath?: string;
			roles?: string[];
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
	it("declares the single crafter agent with the minimal skill-mount permission", async () => {
		const manifest = await readManifest();
		expect(manifest.id).toBe("eform-craft");
		expect(manifest.agent?.agents?.map((agent) => agent.id)).toEqual(["eform"]);
		// 纯提示词资产 preset：挂技能目录所需且仅此一项权限。
		expect(manifest.permissions).toEqual(["agent.skills.control"]);
	});

	it("ships a readable system prompt for the agent", async () => {
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

describe("eform-craft skill", () => {
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
		// 产物四件套与 mock 层钩子必须在场。
		for (const artifact of ["schema.json", "preview.html", "mock-data.json", "form-spec.md", "__EFORM_MOCK__"]) {
			expect(content).toContain(artifact);
		}
	});
});
