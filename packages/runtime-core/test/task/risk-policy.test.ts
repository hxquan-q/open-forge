// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import type { ToolRiskDescriptor } from "../../src/task/contracts.js";
import {
	defaultApprovalRequirement,
	evaluateToolRisk,
	raiseToolRiskLevel,
	UNKNOWN_TOOL_RISK_DESCRIPTOR,
} from "../../src/task/risk-policy.js";

const readDescriptor: ToolRiskDescriptor = {
	defaultLevel: "L0",
	executionClass: "parallel-safe",
	irreversible: false,
	externalSideEffect: false,
	requiredScopes: [],
};

const bashDescriptor: ToolRiskDescriptor = {
	defaultLevel: "L3",
	executionClass: "exclusive",
	irreversible: false,
	externalSideEffect: true,
	requiredScopes: ["shell"],
};

describe("evaluateToolRisk", () => {
	it("未注册描述符的工具 fail closed 到 L4", () => {
		const evaluation = evaluateToolRisk({ toolName: "mystery-tool", descriptor: undefined });
		expect(evaluation.level).toBe("L4");
		expect(evaluation.unknown).toBe(true);
		expect(evaluation.descriptor).toBe(UNKNOWN_TOOL_RISK_DESCRIPTOR);
	});

	it("参数/目标只能提升等级，不能降低", () => {
		const raised = evaluateToolRisk({
			toolName: "bash",
			descriptor: bashDescriptor,
			raise: () => "L4",
		});
		expect(raised.level).toBe("L4");
		const lowered = evaluateToolRisk({
			toolName: "bash",
			descriptor: bashDescriptor,
			raise: () => "L0",
		});
		expect(lowered.level).toBe("L3");
		expect(lowered.unknown).toBe(false);
	});

	it("无提升规则时使用描述符默认等级", () => {
		expect(evaluateToolRisk({ toolName: "read", descriptor: readDescriptor }).level).toBe("L0");
	});
});

describe("raiseToolRiskLevel / defaultApprovalRequirement", () => {
	it("等级单调不降", () => {
		expect(raiseToolRiskLevel("L2", "L4")).toBe("L4");
		expect(raiseToolRiskLevel("L3", "L1")).toBe("L3");
		expect(raiseToolRiskLevel("L2", undefined)).toBe("L2");
	});

	it("L3/L4 默认需要逐次审批，L0-L2 自动放行", () => {
		expect(defaultApprovalRequirement("L0")).toBe("auto");
		expect(defaultApprovalRequirement("L2")).toBe("auto");
		expect(defaultApprovalRequirement("L3")).toBe("per-call");
		expect(defaultApprovalRequirement("L4")).toBe("per-call");
	});
});
