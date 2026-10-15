// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import enChat from "../../../../shared/i18n/locales/en/chat.json";
import zhChat from "../../../../shared/i18n/locales/zh/chat.json";

function interpolate(template: string, values: Record<string, string>): string {
	return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{{${key}}}`, value), template);
}

describe("工作区两档用户文案", () => {
	it("页头分段控件用任务类型，不用办公或编程", () => {
		expect(zhChat.workspace.mode.work).toBe("文档与研究");
		expect(zhChat.workspace.mode.coding).toBe("代码");
		expect(enChat.workspace.mode.work).toBe("Docs & research");
		expect(enChat.workspace.mode.coding).toBe("Code");
		expect(`${zhChat.workspace.mode.work}${zhChat.workspace.mode.coding}`).not.toMatch(/办公|编程/);
	});

	it("页头后果说明：立刻换右栏，新会话跟着走，当前会话不变", () => {
		expect(zhChat.workspace.mode.hint).toContain("当前会话不会变");
		expect(zhChat.workspace.mode.hint).toContain("新会话");
		expect(zhChat.workspace.mode.hint).toContain("立即换新");
		expect(enChat.workspace.mode.hint).toMatch(/current chat does not/i);
	});

	it("新会话页只读确认句按任务类型区分，词汇与右栏一致", () => {
		expect(zhChat.newSession.workspace.hint.work).toContain("文档与研究");
		expect(zhChat.newSession.workspace.hint.work).toContain("不含终端");
		expect(zhChat.newSession.workspace.hint.work).toContain("来源资料");
		expect(zhChat.newSession.workspace.hint.coding).toContain("代码");
		expect(zhChat.newSession.workspace.hint.work).not.toMatch(/办公|编程/);
	});

	it("已固化对齐会话的徽标说明切页头不会改", () => {
		expect(zhChat.session.axes.aligned.work).toBe("本会话按文档与研究开的 · 切页头不会改");
		expect(zhChat.session.axes.aligned.coding).toBe("本会话按代码开的 · 切页头不会改");
		expect(enChat.session.axes.aligned.work).toContain("will not change it");
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
