// Modified by The Open Forge contributors.
// zh catalog 聚合（ISSUE-0021 B 第二片）：zh 是 fallback 与默认产品语言，
// 主窗口 renderer 静态内联、同步 init、不闪。en 走 en-resources.ts 按需装载。
// 新增语言/ns 的注册仍以 resources.ts / config.ts 为准（本文件是主窗口子集装配）。

import zhAbilities from "./locales/zh/abilities.json";
import zhAgentTeams from "./locales/zh/agent-teams.json";
import zhAutomation from "./locales/zh/automation.json";
import zhBatchTasks from "./locales/zh/batch-tasks.json";
import zhChat from "./locales/zh/chat.json";
import zhCommon from "./locales/zh/common.json";
import zhMain from "./locales/zh/main.json";
import zhMessage from "./locales/zh/message.json";
import zhPet from "./locales/zh/pet.json";
import zhProject from "./locales/zh/project.json";
import zhSettings from "./locales/zh/settings.json";
import zhSkills from "./locales/zh/skills.json";
import zhWeknora from "./locales/zh/weknora.json";

export const zhResources = {
	common: zhCommon,
	main: zhMain,
	chat: zhChat,
	project: zhProject,
	pet: zhPet,
	settings: zhSettings,
	message: zhMessage,
	skills: zhSkills,
	abilities: zhAbilities,
	"batch-tasks": zhBatchTasks,
	automation: zhAutomation,
	"agent-teams": zhAgentTeams,
	weknora: zhWeknora,
} as const;
