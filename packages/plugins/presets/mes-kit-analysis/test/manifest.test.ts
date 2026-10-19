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

describe("mes-kit-analysis manifest", () => {
	it("declares the single kit-analyst agent with the minimal skill-mount permission", async () => {
		const manifest = await readManifest();
		expect(manifest.id).toBe("mes-kit-analysis");
		expect(manifest.agent?.agents?.map((agent) => agent.id)).toEqual(["kit-analyst"]);
		// 纯提示词资产 preset：挂技能目录所需且仅此一项权限。
		expect(manifest.permissions).toEqual(["agent.skills.control"]);
		const agent = manifest.agent?.agents?.[0];
		expect(agent?.roles).toContain("master");
		expect(agent?.mentionHandle).toBe("kitcheck");
	});

	it("ships a readable system prompt and skill manual", async () => {
		const manifest = await readManifest();
		for (const agent of manifest.agent?.agents ?? []) {
			expect(agent.systemPromptPath).toBeDefined();
			const prompt = await readPluginFile(agent.systemPromptPath!);
			expect(prompt.trim().length).toBeGreaterThan(200);
		}
		const skill = await readPluginFile("agent/skills/mes-kit-analysis/SKILL.md");
		expect(skill).toContain("R1");
		expect(skill).toContain("fail-closed");
	});

	it("ships the engine, contract tests and references the manual relies on", async () => {
		// SKILL.md 引用的技能内资产必须随插件存在（引擎/契约/模板/参考实现）。
		for (const relative of [
			"agent/skills/mes-kit-analysis/scripts/analyze.py",
			"agent/skills/mes-kit-analysis/scripts/test_analyze.py",
			"agent/skills/mes-kit-analysis/references/api_reference.md",
			"agent/skills/mes-kit-analysis/references/extract-as.sql",
			"agent/skills/mes-kit-analysis/references/build-snapshot-as.py",
			"agent/skills/mes-kit-analysis/assets/dashboard.html",
		]) {
			const content = await readPluginFile(relative);
			expect(content.trim().length).toBeGreaterThan(0);
		}
	});

	it("resolves every locale key referenced by the manifest", async () => {
		const manifest = await readManifest();
		for (const locale of ["zh", "en"]) {
			const table = await readLocale(locale);
			const referenced = [
				manifest.name ?? "",
				manifest.description ?? "",
				...(manifest.agent?.agents ?? []).flatMap((agent) => [agent.name, agent.description ?? ""]),
			].filter((value) => value.startsWith("%") && value.endsWith("%"));
			for (const value of referenced) {
				expect(table[value.slice(1, -1)], `${locale}:${value}`).toBeTruthy();
			}
		}
	});
});
