// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import {
	classifyUnattendedCapability,
	EMPTY_UNATTENDED_PERMISSION_TIERS,
	enableAllUnattendedPermissionTiers,
	evaluateUnattendedToolAutoApprove,
	hasAnyUnattendedPermissionGrant,
	isBillingQuotaContext,
	normalizeUnattendedPermissionTiers,
	UNATTENDED_PERMISSION_TIER_KEYS,
	type UnattendedPermissionTiers,
} from "../../../src/features/scheduled-tasks/unattended-permission-tiers.js";

describe("unattended permission tiers defaults", () => {
	it("缺省与空对象都不构成任何授权放行", () => {
		expect(hasAnyUnattendedPermissionGrant(undefined)).toBe(false);
		expect(hasAnyUnattendedPermissionGrant(EMPTY_UNATTENDED_PERMISSION_TIERS)).toBe(false);
		expect(hasAnyUnattendedPermissionGrant({})).toBe(false);
		expect(
			hasAnyUnattendedPermissionGrant({
				allowWorkspaceWrite: false,
				allowCommonCommands: false,
				allowBatchDelete: false,
				allowSystemTools: false,
				autoApprovePrompts: false,
			}),
		).toBe(false);
	});

	it("缺省分档对任意 L3 工具都要求人工，与改前审批路径兼容", () => {
		const cases = [
			{ toolName: "write", inputPreview: { path: "a.ts" } },
			{ toolName: "bash", inputPreview: { command: "git status" } },
			{ toolName: "bash", inputPreview: { command: "rm -rf dist" } },
			{ toolName: "mcp_search", inputPreview: {} },
			{ toolName: "todo", inputPreview: {} },
		] as const;
		for (const item of cases) {
			expect(
				evaluateUnattendedToolAutoApprove({
					tiers: undefined,
					toolName: item.toolName,
					level: "L3",
					summary: item.toolName,
					inputPreview: item.inputPreview,
				}),
			).toEqual({ outcome: "requireHuman", reason: "defaults" });
		}
	});
});

describe("unattended permission tier allow/deny matrix", () => {
	const matrix: readonly {
		readonly tier: keyof UnattendedPermissionTiers;
		readonly toolName: string;
		readonly inputPreview: unknown;
		readonly capability: string;
	}[] = [
		{
			tier: "allowWorkspaceWrite",
			toolName: "write",
			inputPreview: { path: "src/a.ts" },
			capability: "workspaceWrite",
		},
		{
			tier: "allowCommonCommands",
			toolName: "bash",
			inputPreview: { command: "git status" },
			capability: "commonCommands",
		},
		{
			tier: "allowBatchDelete",
			toolName: "bash",
			inputPreview: { command: "rm -rf build/" },
			capability: "batchDelete",
		},
		{
			tier: "allowSystemTools",
			toolName: "mcp_browser_navigate",
			inputPreview: {},
			capability: "systemTools",
		},
		{
			tier: "autoApprovePrompts",
			toolName: "scheduled_task_create",
			inputPreview: { name: "x" },
			capability: "genericPrompt",
		},
	];

	it.each(matrix)("仅开启 $tier 时放行对应能力 $capability", ({ tier, toolName, inputPreview, capability }) => {
		const tiers: UnattendedPermissionTiers = { [tier]: true };
		expect(
			evaluateUnattendedToolAutoApprove({
				tiers,
				toolName,
				level: "L3",
				summary: toolName,
				inputPreview,
			}),
		).toEqual({ outcome: "autoApprove", capability });
	});

	it.each(matrix)("未开启 $tier 时对应能力仍要求人工", ({ tier, toolName, inputPreview, capability }) => {
		const other = UNATTENDED_PERMISSION_TIER_KEYS.find((key) => key !== tier);
		const tiers: UnattendedPermissionTiers = other ? { [other]: true } : {};
		expect(
			evaluateUnattendedToolAutoApprove({
				tiers,
				toolName,
				level: "L3",
				summary: toolName,
				inputPreview,
			}),
		).toEqual({ outcome: "requireHuman", reason: "tierDenied", capability });
	});

	it("Given 工作区写允许且系统工具不允许 When 调用 MCP Then 仍要求人工", () => {
		expect(
			evaluateUnattendedToolAutoApprove({
				tiers: { allowWorkspaceWrite: true, allowSystemTools: false },
				toolName: "mcp_search",
				level: "L3",
				summary: "mcp_search",
				inputPreview: {},
			}),
		).toEqual({ outcome: "requireHuman", reason: "tierDenied", capability: "systemTools" });
	});

	it("Given 工作区写允许 When 调用 write Then 静默放行", () => {
		expect(
			evaluateUnattendedToolAutoApprove({
				tiers: { allowWorkspaceWrite: true },
				toolName: "write",
				level: "L3",
				summary: "write — path: a.ts",
				inputPreview: { path: "a.ts" },
			}),
		).toEqual({ outcome: "autoApprove", capability: "workspaceWrite" });
	});
});

describe("unattended permission hard vetoes", () => {
	it("L4 在任意分档下都要求人工", () => {
		expect(
			evaluateUnattendedToolAutoApprove({
				tiers: enableAllUnattendedPermissionTiers(),
				toolName: "bash",
				level: "L4",
				summary: "bash — command: rm -rf /",
				inputPreview: { command: "rm -rf /" },
			}),
		).toEqual({ outcome: "requireHuman", reason: "l4" });
	});

	it("计费/配额语境在任意分档下都要求人工", () => {
		expect(
			isBillingQuotaContext({
				toolName: "image_generate",
				summary: "quota exhausted for image",
				inputPreview: { model: "pro" },
			}),
		).toBe(true);
		expect(
			evaluateUnattendedToolAutoApprove({
				tiers: enableAllUnattendedPermissionTiers(),
				toolName: "image_generate",
				level: "L3",
				summary: "insufficient_quota for paid model",
				inputPreview: { billing: "credits" },
			}),
		).toEqual({ outcome: "requireHuman", reason: "billing" });
	});
});

describe("classifyUnattendedCapability / normalize", () => {
	it("按工具与命令归类能力面", () => {
		expect(classifyUnattendedCapability({ toolName: "edit", summary: "", inputPreview: {} })).toBe("workspaceWrite");
		expect(
			classifyUnattendedCapability({
				toolName: "bash",
				summary: "",
				inputPreview: { command: "npm test" },
			}),
		).toBe("commonCommands");
		expect(
			classifyUnattendedCapability({
				toolName: "shell",
				summary: "",
				inputPreview: { command: "Remove-Item -Recurse build" },
			}),
		).toBe("batchDelete");
		expect(
			classifyUnattendedCapability({
				toolName: "bash",
				summary: "",
				inputPreview: { command: "npm install lodash" },
			}),
		).toBe("systemTools");
		expect(classifyUnattendedCapability({ toolName: "todo", summary: "", inputPreview: {} })).toBe("genericPrompt");
	});

	it("归一化拒绝未知键与非布尔值", () => {
		expect(normalizeUnattendedPermissionTiers({ allowWorkspaceWrite: true })).toEqual({
			allowWorkspaceWrite: true,
		});
		expect(normalizeUnattendedPermissionTiers({ allowWorkspaceWrite: "yes" })).toBeUndefined();
		expect(normalizeUnattendedPermissionTiers({ allowWorkspaceWrite: true, extra: true })).toBeUndefined();
		expect(normalizeUnattendedPermissionTiers(null)).toBeUndefined();
	});

	it("全部开启批量操作一次打开五档", () => {
		expect(enableAllUnattendedPermissionTiers()).toEqual({
			allowWorkspaceWrite: true,
			allowCommonCommands: true,
			allowBatchDelete: true,
			allowSystemTools: true,
			autoApprovePrompts: true,
		});
	});
});
