// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import enChat from "../../../../shared/i18n/locales/en/chat.json";
import zhChat from "../../../../shared/i18n/locales/zh/chat.json";

function interpolate(template: string, values: Record<string, string>): string {
	return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{{${key}}}`, value), template);
}

/**
 * 工作区两档的用户文案合同。页头切换器与 workspace.mode.* 文案已随「Allstar自主开发」
 * 版块入口改造删除；仍存在的两个出口——新会话页只读确认句与会话徽标——继续锁定
 * 「文档与研究 / 代码」的任务类型词汇，不用「办公 / 编程」这类系统词。
 */
describe("工作区两档用户文案", () => {
	it("新会话页只读确认句按任务类型区分，词汇与右栏一致", () => {
		expect(zhChat.newSession.workspace.hint.work).toContain("文档与研究");
		expect(zhChat.newSession.workspace.hint.work).toContain("不含终端");
		expect(zhChat.newSession.workspace.hint.work).toContain("来源资料");
		expect(zhChat.newSession.workspace.hint.coding).toContain("代码");
		expect(zhChat.newSession.workspace.hint.work).not.toMatch(/办公|编程/);
	});

	it("已固化对齐会话的徽标说明模式在创建时固定", () => {
		expect(zhChat.session.axes.aligned.work).toBe("本会话按文档与研究开的 · 模式创建时已固定");
		expect(zhChat.session.axes.aligned.coding).toBe("本会话按代码开的 · 模式创建时已固定");
		expect(enChat.session.axes.aligned.work).toContain("fixed at creation");
	});

	it("(work, coding) 分歧会话两轴各自成立", () => {
		const label = interpolate(zhChat.session.axes.divergent, {
			interpretation: zhChat.session.axes.interpretation.work,
			profile: zhChat.session.axes.profile.coding,
		});
		expect(label).toBe("本会话：文档向 · 代码");
		expect(label).not.toMatch(/办公|编程|\{\{/);
	});
});
