// Copyright The Open Forge contributors.

import { describe, expect, it } from "vitest";
import enCommon from "@/shared/i18n/locales/en/common.json";
import enProject from "@/shared/i18n/locales/en/project.json";
import enSettings from "@/shared/i18n/locales/en/settings.json";
import zhCommon from "@/shared/i18n/locales/zh/common.json";
import zhProject from "@/shared/i18n/locales/zh/project.json";
import zhSettings from "@/shared/i18n/locales/zh/settings.json";

/**
 * 侧边栏入口的命名合同（REQ-0018）：同一个入口在导航、新手引导、页面跳转确认与
 * 设置助手路径提示里必须同名。改文案时四处一起改，避免用户在不同入口看到两个名字。
 */
describe("侧边栏入口命名一致性", () => {
	it("技能与连接器：中文四处同名", () => {
		const label = zhProject.sidebar.nav.skills;
		expect(label).toBe("技能与连接器");
		expect(zhProject.tour.sidebar.skills.title).toContain(label);
		expect(zhCommon.navigationApproval.targets.skills).toBe(label);
		expect(zhSettings.aiAssist.context.mcp.startsWith(label)).toBe(true);
	});

	it("技能与连接器：英文四处同名", () => {
		const label = enProject.sidebar.nav.skills;
		expect(label).toBe("Skills & Connectors");
		expect(enProject.tour.sidebar.skills.title).toContain(label);
		expect(enCommon.navigationApproval.targets.skills).toBe(label);
		expect(enSettings.aiAssist.context.mcp.startsWith(label)).toBe(true);
	});
});
