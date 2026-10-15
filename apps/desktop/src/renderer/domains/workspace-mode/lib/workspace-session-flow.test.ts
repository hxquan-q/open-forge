// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { resolveWorkspaceRightPanel, sessionAxesBadgeKind, WORKSPACE_MODE_ICON } from "./workspace-session-flow.js";

describe("resolveWorkspaceRightPanel", () => {
	it.each([
		{
			mode: "work" as const,
			activityPanelOpen: false,
			hasExplicitActivity: false,
			hasWorkContent: true,
			expected: "work",
		},
		{
			mode: "work" as const,
			activityPanelOpen: false,
			hasExplicitActivity: false,
			hasWorkContent: false,
			expected: "none",
		},
		{
			mode: "work" as const,
			activityPanelOpen: true,
			hasExplicitActivity: false,
			hasWorkContent: true,
			expected: "activity",
		},
		{
			mode: "work" as const,
			activityPanelOpen: true,
			hasExplicitActivity: false,
			hasWorkContent: false,
			expected: "activity",
		},
		{
			mode: "coding" as const,
			activityPanelOpen: false,
			hasExplicitActivity: false,
			hasWorkContent: false,
			expected: "activity",
		},
		{
			mode: "work" as const,
			activityPanelOpen: false,
			hasExplicitActivity: true,
			hasWorkContent: true,
			expected: "activity",
		},
		{
			mode: undefined,
			activityPanelOpen: false,
			hasExplicitActivity: false,
			hasWorkContent: false,
			expected: "activity",
		},
	])("$mode / preview=$activityPanelOpen / host=$hasExplicitActivity / content=$hasWorkContent → $expected", (row) => {
		expect(
			resolveWorkspaceRightPanel({
				mode: row.mode,
				activityPanelOpen: row.activityPanelOpen,
				hasExplicitActivity: row.hasExplicitActivity,
				hasWorkContent: row.hasWorkContent,
			}),
		).toBe(row.expected);
	});
});

describe("sessionAxesBadgeKind", () => {
	it("双轴同档用对齐徽标，分歧用分写徽标", () => {
		expect(sessionAxesBadgeKind({ agentMode: "work", capabilityProfile: "work" })).toBe("aligned");
		expect(sessionAxesBadgeKind({ agentMode: "coding", capabilityProfile: "coding" })).toBe("aligned");
		expect(sessionAxesBadgeKind({ agentMode: "work", capabilityProfile: "coding" })).toBe("divergent");
		expect(sessionAxesBadgeKind({ agentMode: "coding", capabilityProfile: "work" })).toBe("divergent");
	});
});

describe("WORKSPACE_MODE_ICON", () => {
	it("文档与研究用文档图标，代码用代码图标", () => {
		expect(WORKSPACE_MODE_ICON.work).toBe("icon-[solar--document-text-linear]");
		expect(WORKSPACE_MODE_ICON.coding).toBe("icon-[solar--code-linear]");
	});
});
