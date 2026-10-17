// Modified by The Open Forge contributors.
// en catalog 聚合（ISSUE-0021 B 第二片）：本模块**只被动态 import**
// （renderer/shared/i18n 的按需装载与切换路径），Vite 会把它整体切成独立
// lazy chunk——zh 用户（默认）不加载。除测试同步性分支（import.meta.env.TEST，
// 生产构建被摇树）外不得静态引用本模块，否则 en 会回到启动路径。
// 新增语言/ns 的注册仍以 resources.ts / config.ts 为准（本文件是主窗口子集装配）。

import enAbilities from "./locales/en/abilities.json";
import enAgentTeams from "./locales/en/agent-teams.json";
import enAutomation from "./locales/en/automation.json";
import enBatchTasks from "./locales/en/batch-tasks.json";
import enChat from "./locales/en/chat.json";
import enCommon from "./locales/en/common.json";
import enMain from "./locales/en/main.json";
import enMessage from "./locales/en/message.json";
import enPet from "./locales/en/pet.json";
import enProject from "./locales/en/project.json";
import enSettings from "./locales/en/settings.json";
import enSkills from "./locales/en/skills.json";

export const enResources = {
	common: enCommon,
	main: enMain,
	chat: enChat,
	project: enProject,
	pet: enPet,
	settings: enSettings,
	message: enMessage,
	skills: enSkills,
	abilities: enAbilities,
	"batch-tasks": enBatchTasks,
	automation: enAutomation,
	"agent-teams": enAgentTeams,
} as const;
