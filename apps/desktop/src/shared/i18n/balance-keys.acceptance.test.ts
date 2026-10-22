// Copyright The Open Forge contributors.
// 验收直测（flow-tester）：AC-10 选型面板余额新增文案 i18n 化、zh 为基准 en 镜像。
import { describe, expect, it } from "vitest";
import enCommon from "./locales/en/common.json";
import zhCommon from "./locales/zh/common.json";

type Catalog = Record<string, unknown>;

/** AC-10 要求新增的用户可见文案：show（闭眼按钮）、hide（睁眼按钮）。 */
const REQUIRED_KEYS = ["label", "refresh", "show", "hide"] as const;

function balanceNode(catalog: Catalog): Record<string, unknown> {
	const modelSelect = catalog.modelSelect as Record<string, unknown> | undefined;
	expect(modelSelect, "modelSelect 分组缺失").toBeTruthy();
	const balance = modelSelect?.balance as Record<string, unknown> | undefined;
	expect(balance, "modelSelect.balance 分组缺失").toBeTruthy();
	return balance ?? {};
}

describe("AC-10 余额文案 i18n", () => {
	it("zh/en 均含 label/refresh/show/hide（非空），且 balance 子树键集合一一对应", () => {
		for (const [name, catalog] of [
			["zh", zhCommon],
			["en", enCommon],
		] as const) {
			const balance = balanceNode(catalog as Catalog);
			for (const key of REQUIRED_KEYS) {
				const value = balance[key];
				expect(typeof value, `${name}.${key} 应为字符串`).toBe("string");
				expect((value as string).trim().length, `${name}.${key} 不应为空`).toBeGreaterThan(0);
			}
		}
		const zhKeys = Object.keys(balanceNode(zhCommon as Catalog)).sort();
		const enKeys = Object.keys(balanceNode(enCommon as Catalog)).sort();
		expect(enKeys).toEqual(zhKeys);
		expect(zhKeys).toEqual([...REQUIRED_KEYS].sort());
	});

	it("en 是镜像翻译而非复制 zh（基准是 zh）", () => {
		const zh = balanceNode(zhCommon as Catalog);
		const en = balanceNode(enCommon as Catalog);
		for (const key of REQUIRED_KEYS) {
			expect(en[key], `en.${key} 不应照抄 zh`).not.toBe(zh[key]);
		}
		// zh 基准；en 为对应英文。
		expect(String(zh.label)).toContain("余额");
		expect(String(en.label)).toContain("Balance");
		expect(String(zh.show)).toBe("显示余额");
		expect(String(en.show)).toBe("Show balance");
		expect(String(zh.hide)).toBe("隐藏余额");
		expect(String(en.hide)).toBe("Hide balance");
		// 宿主用 label 插入已格式化金额（AC-6）。
		expect(String(zh.label)).toContain("{{value}}");
		expect(String(en.label)).toContain("{{value}}");
	});
});
