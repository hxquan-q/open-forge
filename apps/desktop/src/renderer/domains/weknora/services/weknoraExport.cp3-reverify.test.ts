// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { i18n, initI18n } from "@shared/i18n";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import enWeKnora from "@/shared/i18n/locales/en/weknora.json";
import zhWeKnora from "@/shared/i18n/locales/zh/weknora.json";
import { exportFileName, exportFileNames, MAX_FILE_NAME_BYTES, safeFileName, uniqueFileNames } from "./weknoraExport";

/**
 * flow-tester CP3 复验用例（weknora-session-management，独立角度）。
 *
 * 复验对象（06-review-fixes.md 的两处修复）：
 * - **① AC-7 文件名字节截断**（提交 5ffaf8d47）：超长会话标题按 UTF-8 字节截断防 ENAMETOOLONG。
 *   本文件从**码点完整性**角度独立核验——结果必须是原文的「整码点字节前缀」（逐字节比对
 *   `Buffer` 前缀），绝不劈多字节字符 / 代理对；覆盖四类边界、组合上限（基名 + 扩展名 + 序号
 *   < 255B）、以及**短名与修复前逐字节一致**的零回归（对照 5ffaf8d47^ 的旧 `safeFileName`）。
 * - **② AC-11 结果明细冒号串**（提交 ce50795e4）：两处结果弹窗失败明细整串下沉 i18n。
 *   独立核验两个 key 在 zh（全角 U+FF1A）/ en（半角 + 空格）**真 i18n 运行时**的插值结果、
 *   catalog zh/en 镜像结构一致、en 无 CJK，并加一条源码级防回归守卫（正控 = 确实用了两个 key）。
 *
 * 与实现者用例（weknoraExport.acceptance.test.ts 的 A-19、weknora-session-i18n.acceptance.test.ts）
 * 的角度差异：A-19 断言具体截断结果字面量；本文件用「字节前缀相等 + 下一个码点放不下」的**结构性
 * 不变量**证明不劈码点（对任意样例成立）；i18n 侧既有用例用最小 mustache 复算模板，本文件用**真
 * i18next 运行时**插值，且补 en 插值串无 CJK 与组件源码守卫。
 */

const utf8 = new TextEncoder();

function byteLength(value: string): number {
	return utf8.encode(value).length;
}

function toBuffer(value: string): Buffer {
	return Buffer.from(value, "utf8");
}

/** 孤立代理项检测：`for…of` 下 1 字长的 D800–DFFF 码点即半个代理对。 */
function hasLoneSurrogate(value: string): boolean {
	for (const char of value) {
		const code = char.codePointAt(0) ?? 0;
		if (code >= 0xd800 && code <= 0xdfff) return true;
	}
	return false;
}

/** 与实现同源的非法字符正则（修复前 / 后一致，用于重建旧行为对照物）。 */
const ILLEGAL_FILE_NAME_RE = /[<>:"/\\|?*\u0000-\u001f]/g;

/**
 * 修复前（提交 5ffaf8d47^）的 `safeFileName`：净化 + 空回退，**不截断**。
 * 用作「短名零回归」的独立对照物 —— 新实现对 ≤ 上限的输入必须与它逐字节相同。
 */
function legacySafeFileName(title: string): string {
	const normalized = title.trim().replace(ILLEGAL_FILE_NAME_RE, "_");
	return normalized || i18n.t("weknora:conversation.untitled");
}

function flattenKeys(value: unknown, prefix = ""): string[] {
	if (typeof value !== "object" || value === null) return [prefix];
	return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
		flattenKeys(child, prefix ? `${prefix}.${key}` : key),
	);
}

function valueAt(catalog: unknown, path: string): unknown {
	return path.split(".").reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], catalog);
}

/** 模板里的占位符名序列（如 `["name", "reason"]`）。 */
function placeholders(template: string): string[] {
	return [...template.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1] ?? "");
}

/** 去掉占位符后的剩余串 = 分隔符（zh 应为全角「：」，en 应为半角「: 」）。 */
function separator(template: string): string {
	return template.replace(/\{\{\w+\}\}/g, "");
}

// 用 `import.meta.dirname`（jsdom 下 `import.meta.url` 的顶层求值不稳定，dirname 实测可靠）。
const componentPath = resolve(
	(import.meta as ImportMeta & { dirname: string }).dirname,
	"../components/ConversationList.tsx",
);

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

afterEach(async () => {
	await i18n.changeLanguage("zh");
});

describe("AC-7 · 文件名 UTF-8 字节截断（CP3① 复验）", () => {
	it("码点完整性：结果是原文的整码点字节前缀，绝不劈多字节字符 / 代理对（逐段核）", () => {
		const samples = [
			"a".repeat(250), // 1B
			"长".repeat(300), // 3B
			"😀".repeat(80), // 4B（代理对）
			"a".repeat(197) + "😀".repeat(5), // 1B 前缀 + 4B 代理对
			"长".repeat(60) + "a".repeat(50) + "😀".repeat(5), // 恰好 200B 命中
			"会话·2026 ✅【重要】".repeat(40), // 混合宽度
			`${"a".repeat(199)}长b`, // 3B 码点恰好跨 200B 边界
			"a".repeat(190) + "😀".repeat(10), // 4B 码点跨边界
			"𝒜".repeat(120), // U+1D49C，4B 代理对
		];

		for (const sample of samples) {
			const result = safeFileName(sample);
			const resultBytes = toBuffer(result);
			const fullBytes = toBuffer(sample);

			expect(resultBytes.length, `样例「${sample.slice(0, 8)}…」结果超上限`).toBeLessThanOrEqual(
				MAX_FILE_NAME_BYTES,
			);
			// 逐字节：结果 == 原文编码的字节前缀（整码点边界）。
			expect(
				fullBytes.subarray(0, resultBytes.length).equals(resultBytes),
				`样例「${sample.slice(0, 8)}…」的结果不是原文的整码点字节前缀（劈了码点）`,
			).toBe(true);
			expect(result).not.toContain("�"); // 无替换字符
			expect(hasLoneSurrogate(result), `样例「${sample.slice(0, 8)}…」含孤立代理项`).toBe(false);

			// 若确实截断：被丢弃的下一个码点放不下（证明「不超截、不少截」）。
			if (resultBytes.length < fullBytes.length) {
				const next = [...sample][[...result].length];
				expect(next).toBeDefined();
				expect(byteLength(next ?? "")).toBeGreaterThan(MAX_FILE_NAME_BYTES - resultBytes.length);
			}
		}
	});

	it("四类边界：ASCII 长名 / 中文长名 / 恰好上限不截与超 1 字节才截 / 截断后重名序号", () => {
		// 1) ASCII 长名：300B → 200B
		expect(safeFileName("a".repeat(300))).toBe("a".repeat(200));
		expect(byteLength(safeFileName("a".repeat(300)))).toBe(200);

		// 2) 中文长名：900B → 66 字（198B；第 67 字到 201B 超限）
		expect(safeFileName("长".repeat(300))).toBe("长".repeat(66));
		expect(byteLength(safeFileName("长".repeat(300)))).toBe(198);

		// 3) 恰好 200B 不截、超 1 字节才截（ASCII / 4B 代理对 / 3B 中文各一）
		expect(safeFileName("a".repeat(200))).toBe("a".repeat(200));
		expect(safeFileName("a".repeat(201))).toBe("a".repeat(200));
		expect(safeFileName("😀".repeat(50))).toBe("😀".repeat(50)); // 恰好 200B
		expect(safeFileName("😀".repeat(51))).toBe("😀".repeat(50)); // 204B → 200B
		expect(safeFileName("长".repeat(66))).toBe("长".repeat(66)); // 198B，未超
		expect(safeFileName("长".repeat(67))).toBe("长".repeat(66)); // 201B，截回 66 字

		// 4) 截断后重名：两个超长同名会话按出现顺序加尾序号，不覆盖
		const base = "长".repeat(66);
		expect(exportFileNames(["长".repeat(300), "长".repeat(300)], "txt")).toEqual([`${base}.txt`, `${base} (2).txt`]);
		expect(uniqueFileNames([base, base, base])).toEqual([base, `${base} (2)`, `${base} (3)`]);
	});

	it("组合上限：截断名 + 扩展名 + 序号 总字节 < 255（三格式 × 大批重名）", () => {
		const asciiWorst = "a".repeat(300); // 截断后 200B 基名（最坏基名）
		const zhWorst = "长".repeat(300); // 截断后 198B

		for (const format of ["txt", "md", "docx"] as const) {
			for (const title of [asciiWorst, zhWorst]) {
				for (const count of [2, 100, 1200]) {
					const names = exportFileNames(
						Array.from({ length: count }, () => title),
						format,
					);
					expect(new Set(names).size, `${format}/${count} 出现覆盖`).toBe(count);
					for (const name of names) {
						expect(byteLength(name), `${format}/${count}：「${name.slice(0, 10)}…」≥ 255B`).toBeLessThan(255);
					}
				}
			}
		}

		// 最坏组合的精确值：200B 基名 + 「 (100)」6B + 「.docx」5B = 211B
		const worst = exportFileNames(
			Array.from({ length: 100 }, () => asciiWorst),
			"docx",
		);
		expect(byteLength(worst[worst.length - 1] ?? "")).toBe(211);
	});

	it("短名输出与修复前逐字节一致（零回归；对照 5ffaf8d47^ 的旧 safeFileName）", () => {
		const shortTitles = [
			"正常标题",
			"报告:Q1/Q2",
			'  a<b>c:d"e/f\\g|h?i*j  ',
			"会话·2026 ✅【重要】",
			"中文 English 混合 123",
			"",
			"   ",
			"\t\n  ",
			"\u0001\u0002x\u001f",
			"a".repeat(200), // 恰好上限
			"a".repeat(199),
			"长".repeat(66), // 198B
			"CON",
			".hidden",
			"..",
			" trailing ",
			"😀 emoji 名",
		];

		for (const title of shortTitles) {
			const fresh = safeFileName(title);
			const legacy = legacySafeFileName(title);
			expect(fresh, `「${title}」与修复前不一致`).toBe(legacy);
			expect(toBuffer(fresh).equals(toBuffer(legacy)), `「${title}」逐字节不一致`).toBe(true);
		}

		// 关键短名的字面量（独立于实现，来自票面 / 规格的已知良好值）
		expect(safeFileName("报告:Q1/Q2")).toBe("报告_Q1_Q2");
		expect(safeFileName("   ")).toBe("未命名会话");
		expect(safeFileName("a".repeat(200))).toBe("a".repeat(200));
	});

	it("真空区：极端长名 + 重名 + 多格式组合；截断后扩展名保留", () => {
		const title = "长".repeat(300); // 900B
		const base = "长".repeat(66); // 198B

		for (const format of ["txt", "md", "docx"] as const) {
			// 截断后扩展名保留
			expect(exportFileName(title, format)).toBe(`${base}.${format}`);
			expect(exportFileName(title, format).endsWith(`.${format}`)).toBe(true);
			// 三连重名：截断 + 序号 + 扩展名 三者顺序正确
			expect(exportFileNames([title, title, title], format)).toEqual([
				`${base}.${format}`,
				`${base} (2).${format}`,
				`${base} (3).${format}`,
			]);
			// 每个名 < 255B
			for (const name of exportFileNames([title, title, title], format)) {
				expect(byteLength(name)).toBeLessThan(255);
			}
		}

		// 与短名交错：只对超长项截断，短项原样；重名序号按出现顺序
		expect(exportFileNames(["短", title, "短"], "txt")).toEqual(["短.txt", `${base}.txt`, "短 (2).txt"]);
	});
});

describe("AC-11 · 结果明细冒号串 i18n（CP3② 复验）", () => {
	it("zh 态：两个 key 插值均为全角冒号 U+FF1A，名称 / 原因就位（真 i18n 运行时）", async () => {
		await i18n.changeLanguage("zh");
		const items = [
			i18n.t("weknora:batchDelete.resultFailedItem", { name: "会话 A", reason: "网络不可达" }),
			i18n.t("weknora:batchExport.resultFailedItem", { name: "会话 A", reason: "网络不可达" }),
		];
		for (const text of items) {
			expect(text).toBe("会话 A：网络不可达");
			expect(text).toContain("："); // 全角冒号
			expect(text).not.toContain(": "); // 不是半角 + 空格
		}
	});

	it("en 态：两个 key 插值均为半角冒号 + 空格，且不含 CJK（真 i18n 运行时）", async () => {
		await i18n.changeLanguage("en");
		const items = [
			i18n.t("weknora:batchDelete.resultFailedItem", { name: "Chat A", reason: "Network unreachable" }),
			i18n.t("weknora:batchExport.resultFailedItem", { name: "Chat A", reason: "Network unreachable" }),
		];
		for (const text of items) {
			expect(text).toBe("Chat A: Network unreachable");
			expect(text).toContain(": ");
			expect(text).not.toContain("：");
			expect(text).not.toMatch(/[㐀-鿿豈-﫿]/); // 无 CJK
		}
	});

	it("catalog zh / en 镜像一致：模板结构相同，仅分隔符不同", () => {
		for (const key of ["batchDelete.resultFailedItem", "batchExport.resultFailedItem"] as const) {
			const zh = String(valueAt(zhWeKnora, key));
			const en = String(valueAt(enWeKnora, key));
			expect(placeholders(zh)).toEqual(["name", "reason"]);
			expect(placeholders(en)).toEqual(["name", "reason"]);
			expect(separator(zh)).toBe("：");
			expect(separator(en)).toBe(": ");
		}
		// 两 catalog 键集完全一致（无单边新增 / 漏译）
		expect(flattenKeys(enWeKnora).sort()).toEqual(flattenKeys(zhWeKnora).sort());
	});

	it("en catalog 全键不含 CJK（漏译检测）", () => {
		for (const key of flattenKeys(enWeKnora)) {
			const value = valueAt(enWeKnora, key);
			if (typeof value === "string") {
				expect(value, `en.${key} 含 CJK 字符，疑似漏译`).not.toMatch(/[㐀-鿿豈-﫿]/);
			}
		}
	});

	it("组件不再硬编码全角冒号分隔符（防回归；正控 = 确实用了两个 i18n key）", () => {
		const source = readFileSync(componentPath, "utf8");
		// 正控：修复确实把整串接到 i18n key 上（否则本守卫会因「没这回事」而空过）。
		expect(source).toMatch(/"batchDelete\.resultFailedItem"/);
		expect(source).toMatch(/"batchExport\.resultFailedItem"/);
		// 反例形态：JSX 里 `{…}：{…}` 的硬编码全角冒号。
		expect(source).not.toMatch(/\}\s*：\s*\{/);
	});
});
