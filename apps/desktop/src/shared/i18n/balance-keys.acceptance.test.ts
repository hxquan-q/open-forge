// Copyright The Open Forge contributors.
// 验收直测（flow-tester）：AC-5 新增文案 i18n 化、zh 为基准 en 镜像。
import { describe, expect, it } from "vitest";
import enCommon from "./locales/en/common.json";
import zhCommon from "./locales/zh/common.json";

type Catalog = Record<string, unknown>;

function balanceNode(catalog: Catalog): Record<string, unknown> {
	const modelSelect = catalog.modelSelect as Record<string, unknown> | undefined;
	expect(modelSelect, "modelSelect 分组缺失").toBeTruthy();
	const balance = modelSelect?.balance as Record<string, unknown> | undefined;
	expect(balance, "modelSelect.balance 分组缺失").toBeTruthy();
	return balance ?? {};
}

describe("AC-5 余额文案 i18n", () => {
	it("zh/en 均含 label 与 refresh（非空），且 balance 子树键集合一一对应", () => {
		for (const [name, catalog] of [
			["zh", zhCommon],
			["en", enCommon],
		] as const) {
			const balance = balanceNode(catalog as Catalog);
			for (const key of ["label", "refresh"]) {
				const value = balance[key];
				expect(typeof value, `${name}.${key} 应为字符串`).toBe("string");
				expect((value as string).trim().length, `${name}.${key} 不应为空`).toBeGreaterThan(0);
			}
		}
		const zhKeys = Object.keys(balanceNode(zhCommon as Catalog)).sort();
		const enKeys = Object.keys(balanceNode(enCommon as Catalog)).sort();
		expect(enKeys).toEqual(zhKeys);
	});

	it("en 是镜像翻译而非复制 zh（基准是 zh）", () => {
		const zh = balanceNode(zhCommon as Catalog);
		const en = balanceNode(enCommon as Catalog);
		expect(en.label).not.toBe(zh.label);
		expect(en.refresh).not.toBe(zh.refresh);
		// zh 基准应含中文「余额」；en 为英文。
		expect(String(zh.label)).toContain("余额");
		expect(String(en.label)).toContain("Balance");
	});
});
