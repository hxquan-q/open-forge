// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { i18n, initI18n } from "@shared/i18n";
import { describe, expect, it } from "vitest";
import enWeKnora from "@/shared/i18n/locales/en/weknora.json";
import zhWeKnora from "@/shared/i18n/locales/zh/weknora.json";

/**
 * flow-tester 独立验收测试(weknora-kb-citation,AC-10 i18n)。
 *
 * 实现者的 catalog 测试(weknora-i18n.test.ts)断言整 ns 键集一致;本文件聚焦 citation 子树:
 * zh/en 键集一致、叶子非空、badgeLabel 双语都带 {{doc}} 插值占位,并用真实 i18n 实例在 en
 * 语言下逐键消费(插值产物逐字比对)——证明 en 镜像是被真实消费的,不是"键在但没人用"。
 * 文件尾部另有一个**编译期实证桩**:错误 key 用 @ts-expect-error 钉住,tsc 全量 exit 0 即
 * 证明该错误确实被 tsc 拦下(指令未被判"未使用");若键校验失效,tsc 会反向报错。
 */

function flatten(value: unknown, prefix = ""): string[] {
	if (typeof value !== "object" || value === null) return [prefix];
	return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
		flatten(child, prefix ? `${prefix}.${key}` : key),
	);
}

function pick(source: Record<string, unknown>, dotted: string): unknown {
	return dotted.split(".").reduce<unknown>((acc, part) => (acc as Record<string, unknown>)[part], source);
}

describe("weknora i18n 验收 · citation 子树(AC-10)", () => {
	it("citation 子树 zh/en 键集完全一致,叶子全部非空", () => {
		const zhCitation = flatten((zhWeKnora as Record<string, unknown>).citation, "citation").sort();
		const enCitation = flatten((enWeKnora as Record<string, unknown>).citation, "citation").sort();
		expect(enCitation).toEqual(zhCitation);
		// 本 feature 的键齐全(F2/F3 授权契约演进:4 → 7,新增 close/imagePlaceholder/imageFailed)。
		expect(zhCitation).toEqual([
			"citation.badgeLabel",
			"citation.close",
			"citation.imageFailed",
			"citation.imagePlaceholder",
			"citation.loadFailed",
			"citation.loading",
			"citation.popoverTitle",
		]);
		for (const key of zhCitation) {
			const zhValue = pick(zhWeKnora, key);
			const enValue = pick(enWeKnora, key);
			expect(typeof zhValue).toBe("string");
			expect(typeof enValue).toBe("string");
			expect((zhValue as string).trim().length).toBeGreaterThan(0);
			expect((enValue as string).trim().length).toBeGreaterThan(0);
		}
	});

	it("badgeLabel 双语都带 {{doc}} 插值占位(en 镜像可插值,非硬编码拼串)", () => {
		const zhBadge = pick(zhWeKnora, "citation.badgeLabel");
		const enBadge = pick(enWeKnora, "citation.badgeLabel");
		expect(zhBadge).toContain("{{doc}}");
		expect(enBadge).toContain("{{doc}}");
	});

	it("en 语言下 4 键全部经真实 i18n 实例消费,插值产物逐字正确", async () => {
		initI18n();
		await i18n.changeLanguage("en");
		try {
			expect(i18n.t("weknora:citation.badgeLabel", { doc: "手册.md" })).toBe("Cited source: 手册.md");
			expect(i18n.t("weknora:citation.popoverTitle")).toBe(pick(enWeKnora, "citation.popoverTitle"));
			expect(i18n.t("weknora:citation.loading")).toBe(pick(enWeKnora, "citation.loading"));
			expect(i18n.t("weknora:citation.loadFailed")).toBe(pick(enWeKnora, "citation.loadFailed"));
		} finally {
			await i18n.changeLanguage("zh");
		}
		// zh 基准同样消费(回退闭环)。
		expect(i18n.t("weknora:citation.badgeLabel", { doc: "手册.md" })).toBe("引用资料:手册.md");
	});
});

/**
 * 编译期实证(AC-10「tsc i18n 类型校验」):下面的错误 key 必须在类型层报错。
 * - 键校验生效时:tsc 报"不存在该键",@ts-expect-error 把它压住 → 指令被使用,编译通过;
 * - 键校验失效时(回归):没有错误可压,tsc 反向报"Unused '@ts-expect-error' directive"。
 * 两种情况都让 `bun x tsc --noEmit -p apps/desktop/tsconfig.json` 非 exit 0 失败——
 * 本桩因此是"tsc 拦键"的双向证明(执行证据见 05-tests.md 的 tsc 命令输出)。
 */
function compileTimeProofNeverCalled(): string {
	// @ts-expect-error weknora:citation.badgeLabelTypo 不在 catalog 中,必须被 tsc 拦下
	return i18n.t("weknora:citation.badgeLabelTypo");
}
void compileTimeProofNeverCalled;
