// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AgentSettingsView } from "./AgentSettingsView";
import type { AgentSettingsModel } from "./useAgentSettingsModel";

// 本测试只关心输入预测开关落在哪个区；图像生成与运行时配置两个大区与位置断言无关。
vi.mock("./ImageGenerationSettingsSection", () => ({ ImageGenerationSettingsSection: () => null }));
vi.mock("./RuntimeConfigurationSections", () => ({ RuntimeConfigurationSections: () => null }));
vi.mock("../ai-assist", () => ({ SettingsAiAssist: () => null }));

function buildModel(): AgentSettingsModel {
	return {
		actions: {
			applyPersonalization: async () => undefined,
			setCustomPrompt: () => undefined,
			setPersonaId: () => undefined,
			toggleAgentSkills: () => undefined,
			togglePromptPrediction: () => undefined,
			toggleVettaCli: () => undefined,
		},
		agentSkillsEnabled: false,
		customPrompt: "",
		dirty: false,
		justSaved: false,
		labels: {
			agentDescription: "个性化说明",
			agentSkill: "适配通用 Agent Skill",
			agentSkillDescription: "技能说明",
			appOp: "Vetta 应用操作",
			appOpDescription: "应用操作说明",
			applied: "已应用",
			apply: "应用",
			customInstructions: "自定义指令",
			customInstructionsDescription: "指令说明",
			customInstructionsPlaceholder: "输入指令",
			defaultPersona: "默认人设",
			inputPrediction: "输入预测",
			inputPredictionDescription: "预测说明",
			persona: "人设",
			saving: "保存中",
			sections: { experimental: "扩展功能", personalization: "个性化" },
			title: "Agent 设置",
		},
		personaId: "default",
		personas: [],
		promptPredictionEnabled: true,
		saving: false,
		vettaCliEnabled: false,
	};
}

it("输入预测开关渲染在个性化区，不再出现在扩展功能区", () => {
	render(
		<AgentSettingsView
			model={buildModel()}
			imageGeneration={{} as never}
			runtimeConfiguration={{} as never}
		/>,
	);

	const row = screen.getByText("输入预测");
	const experimentalCard = document.querySelector('[data-setting-section-id="agent-experimental"]');

	expect(experimentalCard).not.toBeNull();
	expect(experimentalCard?.contains(row)).toBe(false);
	// 开关与行同侧渲染（行内容器内存在 switch 角色按钮）。
	const rowContainer = row.closest("div[class*='justify-between']");
	expect(rowContainer).not.toBeNull();
	expect(rowContainer?.querySelector("[role='switch']")).not.toBeNull();
});
