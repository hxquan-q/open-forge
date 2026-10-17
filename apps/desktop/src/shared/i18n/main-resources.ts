// Modified by The Open Forge contributors.
// 主进程专用 catalog 子集（ISSUE-0021 B 第一片）：main 的实际 ns 使用面只有
// {main, common, settings, skills, pet}（默认 ns + mainT 的 ns 前缀调用，正则
// 全量枚举核实并由单测锁定）。renderer 继续走 resources.ts 全量静态打包；
// main 若新增第 6 个 ns 前缀调用，须同步本文件，否则该 ns 会露原始 key。

import enCommon from "./locales/en/common.json";
import enMain from "./locales/en/main.json";
import enPet from "./locales/en/pet.json";
import enSettings from "./locales/en/settings.json";
import enSkills from "./locales/en/skills.json";
import zhCommon from "./locales/zh/common.json";
import zhMain from "./locales/zh/main.json";
import zhPet from "./locales/zh/pet.json";
import zhSettings from "./locales/zh/settings.json";
import zhSkills from "./locales/zh/skills.json";

/** 主进程装载的 ns 全集；与上方 import 一一对应。 */
export const MAIN_NAMESPACES = ["main", "common", "settings", "skills", "pet"] as const;

export const mainResources = {
	zh: {
		main: zhMain,
		common: zhCommon,
		settings: zhSettings,
		skills: zhSkills,
		pet: zhPet,
	},
	en: {
		main: enMain,
		common: enCommon,
		settings: enSettings,
		skills: enSkills,
		pet: enPet,
	},
} as const;
