// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { deriveSessionAxesFromWorkspaceMode, formatSessionAxesBadge } from "./session-axes.js";

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

describe("formatSessionAxesBadge", () => {
	it("没有固化轴时不展示徽标", () => {
		expect(
			formatSessionAxesBadge({
				interpretation: "办公解释",
				profile: "办公",
				template: "本会话：{{interpretation}} · {{profile}} 工具集",
			}),
		).toBeNull();
	});

	it("已开会话展示只读解释与工具集", () => {
		expect(
			formatSessionAxesBadge({
				agentMode: "coding",
				capabilityProfile: "coding",
				interpretation: "编程解释",
				profile: "编程",
				template: "本会话：{{interpretation}} · {{profile}} 工具集",
			}),
		).toBe("本会话：编程解释 · 编程 工具集");
	});
});
