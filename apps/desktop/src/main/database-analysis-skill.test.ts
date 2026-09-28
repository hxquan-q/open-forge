// Copyright The Open Forge contributors.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseCanvasChart } from "../renderer/domains/activity-panel/services/canvas-chart.js";
import en from "../shared/i18n/locales/en/skills.json";
import zh from "../shared/i18n/locales/zh/skills.json";
import { builtinSkillText, getBuiltinSkillPaths, readBuiltinSkillsManifest } from "./builtin-skills.js";
import { applyLanguagePreference, initAppLanguage } from "./i18n/index.js";

vi.mock("electron", () => ({
	app: { isPackaged: false, getAppPath: () => fileURLToPath(new URL("../../", import.meta.url)) },
}));
// Isolate the real i18n/skill loading path from the user's persisted Desktop settings.
vi.mock("./config/desktop-config-store.js", () => ({ readConfigSync: () => ({ language: "zh" }) }));

afterEach(() => vi.unstubAllEnvs());

describe("数据库分析技能的产品装配", () => {
	it.each(["false", "true"])("云构建=%s 时真实清单中的问数技能均可加载，并可切换中英文", (cloud) => {
		vi.stubEnv("VETTA_CLOUD_ENABLED", cloud);
		const registration = readBuiltinSkillsManifest()["database-analysis"];
		expect(registration).toMatchObject({
			name: "database-analysis",
			source: "builtin",
			enabled: true,
			type: "skill",
		});
		const skillPath = getBuiltinSkillPaths().find((path) => path.endsWith("database-analysis"));
		expect(skillPath).toBeDefined();
		if (!skillPath) throw new Error("Database analysis skill was not loaded");
		const content = readFileSync(join(skillPath, "SKILL.md"), "utf8");
		expect(content).toMatch(/^---\r?\nname: database-analysis\r?\n/);
		for (const match of content.matchAll(/\]\((references\/[^)]+)\)/g)) {
			expect(existsSync(join(skillPath, match[1]))).toBe(true);
		}
		initAppLanguage();
		expect(builtinSkillText("database-analysis", "name")).toBe(zh.builtin["database-analysis"].name);
		applyLanguagePreference("en");
		expect(builtinSkillText("database-analysis", "name")).toBe(en.builtin["database-analysis"].name);
		expect(builtinSkillText("database-analysis", "description")).toBe(en.builtin["database-analysis"].description);
	});

	it.each(["false", "true"])("云构建=%s 时随包分发的脚本输出可被真实画布合同读取", (cloud) => {
		const root = mkdtempSync(join(tmpdir(), "database-skill-package-"));
		// The staging helper clears its destination: only pass a freshly owned child of this temp root.
		const target = join(root, "system-skills");
		try {
			const stagingUrl = new URL("../../scripts/stage-system-skills.mjs", import.meta.url);
			execFileSync(
				process.execPath,
				[
					"--input-type=module",
					"-e",
					`import { stageSystemSkills } from ${JSON.stringify(stagingUrl.href)}; stageSystemSkills(process.argv[1]);`,
					target,
				],
				{ env: { ...process.env, VETTA_CLOUD_ENABLED: cloud }, encoding: "utf8", timeout: 10_000 },
			);
			expect(existsSync(join(target, "database-analysis", "SKILL.md"))).toBe(true);
			const result = spawnSync(
				process.execPath,
				[join(target, "database-analysis", "scripts", "analyze.mjs"), "-"],
				{
					input: JSON.stringify({
						rows: [
							{ channel: "web", revenue: "200.00" },
							{ channel: "store", revenue: "50.00" },
						],
						dimension: "channel",
						metrics: ["revenue"],
						truncated: false,
					}),
					encoding: "utf8",
					timeout: 10_000,
				},
			);
			expect(result.status, result.stderr).toBe(0);
			const report: unknown = JSON.parse(result.stdout);
			if (report === null || typeof report !== "object" || !("chart" in report))
				throw new Error("Analysis did not produce a chart");
			expect(parseCanvasChart(JSON.stringify(report.chart))).toEqual({
				type: "bar",
				labels: ["web", "store"],
				series: [{ name: "revenue", values: [200, 50] }],
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
