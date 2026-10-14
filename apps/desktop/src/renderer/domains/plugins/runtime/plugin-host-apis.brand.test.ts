// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import type { InstalledPlugin } from "@preload/api";
import { languageAtom } from "@shared/store/atoms";
import { getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it } from "vitest";
import { resolveDesktopBrandName } from "@/shared/desktop-brand";
import { createI18nApi, resolvePluginDisplayText } from "./plugin-host-apis.js";

/** 插件 catalog 仍按既有约定写遗留品牌名，由宿主按当前品牌档位归一。 */
const plugin = {
	id: "vetta-ui-design",
	activeVersion: "1.0.0",
	name: "Design",
	defaultLocale: "zh",
	locales: {
		zh: { "notes.author.agent": "Vetta" },
		en: { "notes.author.agent": "Vetta" },
	},
} as unknown as InstalledPlugin;

describe("插件文案在宿主侧随品牌档位归一", () => {
	beforeEach(() => {
		getDefaultStore().set(languageAtom, "zh");
	});

	it("插件 catalog 里的遗留品牌名按当前品牌渲染", () => {
		expect(createI18nApi(plugin).t("notes.author.agent")).toBe(resolveDesktopBrandName("zh"));
	});

	it("manifest 展示名的 %key% 占位同样归一", () => {
		expect(resolvePluginDisplayText(plugin, "%notes.author.agent%")).toBe(resolveDesktopBrandName("zh"));
	});
});
