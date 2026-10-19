// Modified by The Open Forge contributors.
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
	app: {
		getSystemLocale: () => "zh-CN",
		getLocale: () => "zh-CN",
	},
}));

vi.mock("../config/desktop-config-store.js", () => ({
	readConfigSync: () => ({}),
}));

describe("main process i18n namespace surface", () => {
	it("serves every namespace prefix that mainT call sites use", async () => {
		const { initAppLanguage, mainT } = await import("./index.js");
		initAppLanguage();
		// mainT 调用面的全部 ns 前缀（src/main 正则枚举）：默认 main + 4 个前缀。
		// 新增第 6 个 ns 前缀调用时须同步 shared/i18n/main-resources.ts，本测试兜底拦截。
		const samples = [
			"tray.showWindow", // main（默认 ns）
			"common:manageApproval.webhook.botSuffix",
			"settings:whTestTitle",
			"skills:tabs.scene",
			"pet:notice.lifecycle.started",
		];
		for (const key of samples) {
			const translated = mainT(key);
			expect(translated, `key=${key}`).toBeTruthy();
			expect(translated, `key=${key}`).not.toBe(key); // 装载缺失时会露原始 key
		}
	});

	it("keeps main resources aligned with MAIN_NAMESPACES for both languages", async () => {
		const { MAIN_NAMESPACES, mainResources } = await import("../../shared/i18n/main-resources.js");
		expect(MAIN_NAMESPACES).toEqual(["main", "common", "settings", "skills", "pet"]);
		for (const language of ["zh", "en"] as const) {
			for (const ns of MAIN_NAMESPACES) {
				const catalog = mainResources[language][ns];
				expect(Object.keys(catalog).length, `${language}/${ns}`).toBeGreaterThan(0);
			}
		}
	});
});
