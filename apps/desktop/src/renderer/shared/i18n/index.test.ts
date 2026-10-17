// Modified by The Open Forge contributors.
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

describe("renderer i18n language split", () => {
	it("initializes synchronously with full bundles for the initial language and switches intact", async () => {
		vi.stubGlobal("window", {
			vetta: {
				i18n: { initialState: { preference: "en", language: "en" }, onLanguageChanged: () => () => {} },
			},
		});
		const { i18n, initI18n } = await import("./index.js");

		// en 初值在测试环境走静态分支：initI18n 完全同步（生产构建被摇树，en 按需装载）。
		expect(initI18n()).toBeUndefined();
		expect(i18n.isInitialized).toBe(true);
		expect(i18n.language).toBe("en");

		const namespaces = [
			"common",
			"chat",
			"settings",
			"project",
			"pet",
			"main",
			"message",
			"skills",
			"abilities",
			"batch-tasks",
			"automation",
			"agent-teams",
		];
		for (const ns of namespaces) {
			expect(Object.keys(i18n.getResourceBundle("en", ns) ?? {}), `en ns=${ns}`).not.toHaveLength(0);
			// fallback：zh 恒静态在场。
			expect(Object.keys(i18n.getResourceBundle("zh", ns) ?? {}), `zh ns=${ns}`).not.toHaveLength(0);
		}

		// 幂等：再次调用不重复初始化。
		expect(initI18n()).toBeUndefined();

		// 切回 zh 后取值正常（切换装载路径由生产分支覆盖，此处验证实例完整性）。
		await i18n.changeLanguage("zh");
		const settings = i18n.getResourceBundle("zh", "settings");
		expect(Object.keys(settings ?? {})).not.toHaveLength(0);
	});
});
