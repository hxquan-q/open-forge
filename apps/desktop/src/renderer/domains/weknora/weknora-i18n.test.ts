// Copyright The Open Forge contributors.

import { describe, expect, it } from "vitest";
import enProject from "@/shared/i18n/locales/en/project.json";
import enWeKnora from "@/shared/i18n/locales/en/weknora.json";
import zhProject from "@/shared/i18n/locales/zh/project.json";
import zhWeKnora from "@/shared/i18n/locales/zh/weknora.json";

/** 展开成点路径键集；数组不参与（本 ns 无数组）。 */
function flattenKeys(value: unknown, prefix = ""): string[] {
	if (typeof value !== "object" || value === null) return [prefix];
	return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
		flattenKeys(child, prefix ? `${prefix}.${key}` : key),
	);
}

describe("weknora i18n catalog", () => {
	it("zh 与 en 的键集完全一致（AC-23）", () => {
		expect(flattenKeys(enWeKnora).sort()).toEqual(flattenKeys(zhWeKnora).sort());
	});

	it("所有叶子都是非空字符串", () => {
		for (const key of flattenKeys(zhWeKnora)) {
			const value = key.split(".").reduce<unknown>((acc, part) => (acc as Record<string, unknown>)[part], zhWeKnora);
			expect(typeof value).toBe("string");
			expect((value as string).trim().length).toBeGreaterThan(0);
		}
	});

	it("侧边栏导航标签键在 zh / en 都存在（AC-1）", () => {
		expect(zhProject.sidebar.nav.weknora).toBeTruthy();
		expect(enProject.sidebar.nav.weknora).toBeTruthy();
	});
});
