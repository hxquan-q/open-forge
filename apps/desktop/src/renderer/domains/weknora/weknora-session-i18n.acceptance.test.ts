// Copyright The Open Forge contributors.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import enWeKnora from "@/shared/i18n/locales/en/weknora.json";
import zhWeKnora from "@/shared/i18n/locales/zh/weknora.json";

/**
 * flow-tester 独立验收测试（weknora-session-management，AC-2 / AC-11）。
 *
 * AC-2：4 个替换确认 i18n key 与死代码（`confirmOpen` / 相关文案）清理干净。
 * AC-11：本 feature 新增的导出 / 多选 / 批量文案 zh 与 en **镜像齐全**、无硬编码中文残留。
 */

function flattenKeys(value: unknown, prefix = ""): string[] {
	if (typeof value !== "object" || value === null) return [prefix];
	return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
		flattenKeys(child, prefix ? `${prefix}.${key}` : key),
	);
}

function valueAt(catalog: unknown, path: string): unknown {
	return path.split(".").reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], catalog);
}

/** 最小 mustache 插值（仅用于断言模板的最终串，不引入 i18n 运行时 —— 本文件跑在 node 环境）。 */
function interpolate(template: string, vars: Record<string, string>): string {
	return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

/** 本 feature 新增、且必须 zh/en 成对存在的文案键（AC-11）。 */
const REQUIRED_KEYS = [
	"menu.multiSelect",
	"menu.export",
	"selection.selected",
	"selection.selectAll",
	"selection.export",
	"selection.delete",
	"selection.exit",
	"export.citationSource",
	"export.formatTitleSingle",
	"export.formatTitleBatch",
	"export.formatDescription",
	"export.formatTxt",
	"export.formatMd",
	"export.formatDocx",
	"export.cancel",
	"export.saveTitle",
	"export.singleSuccess",
	"export.singleFailed",
	"batchExport.exporting",
	"batchExport.resultTitle",
	"batchExport.resultSucceeded",
	"batchExport.resultFailed",
	"batchExport.resultFailedItem",
	"batchExport.writeFailed",
	"batchExport.close",
	"batchDelete.confirmTitle",
	"batchDelete.confirmBody",
	"batchDelete.resultTitle",
	"batchDelete.resultSucceeded",
	"batchDelete.resultFailed",
	"batchDelete.resultFailedItem",
] as const;

/** 已移除的替换确认 key：任一 catalog 残留即 AC-2 失败。 */
const REMOVED_KEYS = [
	"conversation.confirmTitle",
	"conversation.confirmBody",
	"conversation.confirmCancel",
	"conversation.confirmOk",
] as const;

const here = fileURLToPath(new URL(".", import.meta.url));

function collectSourceFiles(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = `${dir}${entry.name}`;
		if (entry.isDirectory()) files.push(...collectSourceFiles(`${full}/`));
		else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) files.push(full);
	}
	return files;
}

describe("AC-11 · 导出 / 多选 / 批量文案 zh-en 镜像", () => {
	it("本 feature 新增文案键在 zh 与 en 均存在且非空", () => {
		for (const key of REQUIRED_KEYS) {
			expect(valueAt(zhWeKnora, key), `zh 缺 ${key}`).toBeTruthy();
			expect(valueAt(enWeKnora, key), `en 缺 ${key}`).toBeTruthy();
		}
	});

	it("zh 与 en 键集完全一致（无单边新增 / 漏译）", () => {
		expect(flattenKeys(enWeKnora).sort()).toEqual(flattenKeys(zhWeKnora).sort());
	});

	it("引用来源前缀：zh=来源 / en=Source（导出文件里用户可见，走 i18n 非硬编码）", () => {
		expect(valueAt(zhWeKnora, "export.citationSource")).toBe("来源");
		expect(valueAt(enWeKnora, "export.citationSource")).toBe("Source");
	});

	// CP3②：结果明细原为 JSX 硬编码全角冒号 `{name}：{reason}`（en 下渲染成「Title：reason」）。
	// 整串下沉 i18n 后，此处钉住 zh 全角 / en 半角 + 名称与原因插值，防再退化成硬编码分隔符。
	it("批量结果明细整串走 i18n：zh 全角冒号 / en 半角冒号 + 名称与原因插值（防硬编码回归）", () => {
		for (const key of ["batchDelete.resultFailedItem", "batchExport.resultFailedItem"] as const) {
			expect(interpolate(String(valueAt(zhWeKnora, key)), { name: "会话 A", reason: "网络不可达" })).toBe(
				"会话 A：网络不可达",
			);
			expect(interpolate(String(valueAt(enWeKnora, key)), { name: "Chat A", reason: "Network unreachable" })).toBe(
				"Chat A: Network unreachable",
			);
		}
	});

	it("en 侧不含任何中日韩字符（漏译检测）", () => {
		for (const key of flattenKeys(enWeKnora)) {
			const value = valueAt(enWeKnora, key);
			if (typeof value === "string") {
				expect(value, `en.${key} 含 CJK 字符，疑似漏译`).not.toMatch(/[一-鿿]/);
			}
		}
	});
});

describe("AC-2 · 替换确认 key 与死代码清理", () => {
	it("4 个 conversation.confirm* key 在 zh / en 均不存在", () => {
		for (const key of REMOVED_KEYS) {
			expect(valueAt(zhWeKnora, key), `zh 残留 ${key}`).toBeUndefined();
			expect(valueAt(enWeKnora, key), `en 残留 ${key}`).toBeUndefined();
		}
	});

	it("weknora 域源码无替换确认死代码（confirmOpen / 相关文案）", () => {
		const files = collectSourceFiles(here);
		expect(files.length).toBeGreaterThan(10);
		const banned = [/confirmOpen/, /替换当前对话/, /当前对话将被替换/, /打开历史会话/];
		const violations: string[] = [];
		for (const file of files) {
			const text = readFileSync(file, "utf8");
			for (const pattern of banned) {
				if (pattern.test(text)) violations.push(`${file} 命中 ${pattern}`);
			}
		}
		expect(violations).toEqual([]);
	});
});
