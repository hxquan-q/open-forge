// Copyright The Open Forge contributors.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenMarketplaceDetailBlock } from "../../../preload/api-types/abilities.js";
import { getBuiltinSkillsDir, readBuiltinSkillsManifest } from "../../builtin-skills.js";
import { listLocalAbilityPresentations } from "../presentation/local-ability-presentations.js";
import { marketplaceDetailBlockSchema } from "./marketplace-schema.js";

// 内置预设随包分发，事实源仍是各包自己的 ability.json；这里按开发实例的 appPath
// 解析真实预设目录，不把仓库相对路径写死在测试里。
vi.mock("electron", () => ({
	app: { isPackaged: false, getAppPath: () => fileURLToPath(new URL("../../../../", import.meta.url)) },
}));
// 捕获降级告警：描述解析失败时展示会被静默丢掉，测试失败时要能看到真实 ZodError。
const captured = vi.hoisted(() => ({ warnings: [] as unknown[] }));
vi.mock("../../logger.js", () => ({
	getAppLogger: () => ({
		warn: (...args: unknown[]) => captured.warnings.push(...args),
		info: () => {},
		error: () => {},
	}),
}));
vi.mock("../../plugins/plugin-catalog.js", () => ({ listPlugins: () => [] }));
vi.mock("../../skills/skill-service.js", () => ({ getSkillBaseDir: () => "", readSkillsManifest: () => ({}) }));

afterEach(() => {
	vi.unstubAllEnvs();
	captured.warnings.length = 0;
});

interface PresetDescriptor {
	readonly slug: string;
	readonly path: string;
	readonly detail?: {
		readonly blocks?: unknown[];
		readonly i18n?: Record<string, { readonly blocks?: unknown[] } | undefined>;
	};
}

function builtinPresetsDir(): string {
	const dir = getBuiltinSkillsDir();
	if (!dir) throw new Error("内置技能目录未解析：测试需要仓库内 packages/skill-presets 存在 skills-manifest.json");
	return dir;
}

/** 只认随包发布描述文件的预设；database-analysis 这类纯脚本技能没有 ability.json。 */
function readPresetDescriptors(): PresetDescriptor[] {
	const dir = builtinPresetsDir();
	return readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, "ability.json")))
		.map((entry) => {
			const path = join(dir, entry.name, "ability.json");
			// 描述文件损坏时不吞异常：语法错误要在此处直接暴露，而不是被当成本预设不存在。
			return { slug: entry.name, path, ...(JSON.parse(readFileSync(path, "utf-8")) as object) };
		});
}

/** 默认档与各语言档，键即失败信息里的定位标签。 */
function detailVariants(preset: PresetDescriptor): Array<[string, { readonly blocks?: unknown[] } | undefined]> {
	const variants: Array<[string, { readonly blocks?: unknown[] } | undefined]> = [["default", preset.detail]];
	for (const [locale, detail] of Object.entries(preset.detail?.i18n ?? {})) {
		variants.push([`i18n.${locale}`, detail]);
	}
	return variants;
}

function showcaseMotif(blocks: OpenMarketplaceDetailBlock[] | undefined): string | undefined {
	const showcase = blocks?.find((block) => block.type === "showcase");
	return showcase?.type === "showcase" ? showcase.showcase.canvas : undefined;
}

describe("内置预设展示描述的市场 Schema 合同", () => {
	it("从本地能力展示索引入口装载全部内置预设，report-canvas 默认档与英文档均可解析", () => {
		// cloud 构建是超集：lite 只是把 requiresCloud 的 publish-ability 整体隐藏，
		// 描述文件的合同与构建开关无关，故只覆盖完整集合。
		vi.stubEnv("VETTA_CLOUD_ENABLED", "true");
		const presets = readPresetDescriptors();
		expect(presets.map((preset) => preset.slug)).toContain("report-canvas");

		const presentations = listLocalAbilityPresentations({
			getBuiltinSkillsDir,
			readBuiltinSkillsManifest,
			readSkillsManifest: () => ({}),
			getSkillBaseDir: () => "",
			listPlugins: () => [],
		});

		const missing = presets
			.map((preset) => preset.slug)
			.filter((slug) => presentations[`skill:${slug}`] === undefined);
		expect(
			missing,
			`这些内置预设的展示被 Schema 拒绝后降级丢弃：${missing.join(", ")}\n${captured.warnings.map(String).join("\n")}`,
		).toEqual([]);

		const report = presentations["skill:report-canvas"];
		expect(report).toBeDefined();
		expect(showcaseMotif(report?.detail?.blocks)).toBe("docs");
		expect(showcaseMotif(report?.detail?.i18n?.en?.blocks)).toBe("docs");
	});

	it("每个内置预设的详情区块（含各语言档）都能通过市场详情 Schema", () => {
		const problems: string[] = [];
		const scanned: string[] = [];
		for (const preset of readPresetDescriptors()) {
			for (const [label, detail] of detailVariants(preset)) {
				(detail?.blocks ?? []).forEach((block, index) => {
					scanned.push(`${preset.slug}/${label}[${index}]`);
					const result = marketplaceDetailBlockSchema.safeParse(block);
					if (result.success) return;
					for (const issue of result.error.issues) {
						problems.push(
							`${preset.path} ${label}.blocks[${index}] ${issue.path.join(".") || "<root>"}: ${issue.message}`,
						);
					}
				});
			}
		}

		// 防止遍历空转：预设被移走或改名时这里先红，而不是悄悄零断言通过。
		expect(scanned).toContain("report-canvas/default[0]");
		expect(scanned).toContain("report-canvas/i18n.en[0]");
		expect(problems).toEqual([]);
	});
});
