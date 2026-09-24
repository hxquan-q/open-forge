// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { deriveSessionAxesFromWorkspaceMode, formatSessionAxesBadge, resolveSessionAxes } from "./session-axes.js";

describe("deriveSessionAxesFromWorkspaceMode", () => {
	it("办公工作区同时派生 work 解释与 work 工具集", () => {
		expect(deriveSessionAxesFromWorkspaceMode("work")).toEqual({
			agentMode: "work",
			capabilityProfile: "work",
		});
	});

	it("编程工作区同时派生 coding 解释与 coding 工具集", () => {
		expect(deriveSessionAxesFromWorkspaceMode("coding")).toEqual({
			agentMode: "coding",
			capabilityProfile: "coding",
		});
	});
});

describe("resolveSessionAxes", () => {
	it.each([
		// 各轴取合法值时恒等透传
		{ agentMode: "work", capabilityProfile: "work", expected: { agentMode: "work", capabilityProfile: "work" } },
		{
			agentMode: "coding",
			capabilityProfile: "coding",
			expected: { agentMode: "coding", capabilityProfile: "coding" },
		},
		// 双轴分歧如实保留：解释模式与工具面互不借用对方取值
		{ agentMode: "work", capabilityProfile: "coding", expected: { agentMode: "work", capabilityProfile: "coding" } },
		{ agentMode: "coding", capabilityProfile: "work", expected: { agentMode: "coding", capabilityProfile: "work" } },
		// 未知值折叠口径与 main 对齐：agentMode 未知 → work（同 LEGACY_SESSION_AGENT_MODE），
		// capabilityProfile 未知 → coding（同「非 work 即 coding」）。
		{
			agentMode: undefined,
			capabilityProfile: undefined,
			expected: { agentMode: "work", capabilityProfile: "coding" },
		},
		// 手编第三值 agentMode 的旧会话：解释模式折叠为 work，工具面按 main 口径报 coding
		{
			agentMode: "architect",
			capabilityProfile: undefined,
			expected: { agentMode: "work", capabilityProfile: "coding" },
		},
		// 落盘层是裸 string，超出注册表的脏值同样走折叠
		{ agentMode: "", capabilityProfile: "", expected: { agentMode: "work", capabilityProfile: "coding" } },
	])("($agentMode, $capabilityProfile) → $expected", ({ agentMode, capabilityProfile, expected }) => {
		expect(resolveSessionAxes(agentMode, capabilityProfile)).toEqual(expected);
	});
});

describe("formatSessionAxesBadge", () => {
	it("没有固化轴时不展示徽标", () => {
		expect(
			formatSessionAxesBadge({
				template: "本会话：办公解释 · 办公 工具集",
			}),
		).toBeNull();
	});

	it("只有一轴固化时也展示徽标", () => {
		expect(
			formatSessionAxesBadge({
				capabilityProfile: "coding",
				template: "本会话：办公解释 · 编程 工具集",
			}),
		).toBe("本会话：办公解释 · 编程 工具集");
	});

	it("模板按 i18next 插值结果原样透传，helper 不做第二遍替换", () => {
		const template = "本会话：{{interpretation}} · {{profile}} 工具集";
		expect(
			formatSessionAxesBadge({
				agentMode: "work",
				capabilityProfile: "work",
				template,
			}),
		).toBe(template);
	});
});
