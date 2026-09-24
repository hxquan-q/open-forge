// Copyright The Open Forge contributors.
import type { ToolRiskDescriptor, ToolRiskLevel } from "./contracts.js";

/**
 * 工具风险判定（产品无关部分）：等级只升不降、未知能力 fail-closed。
 * 哪个工具默认几级、哪级需要审批属产品 Policy，由宿主/产品层注入。
 */

/** 未知工具的合成描述符：一律按最高风险处理，除非注册表面明确降级。 */
export const UNKNOWN_TOOL_RISK_DESCRIPTOR: ToolRiskDescriptor = Object.freeze({
	defaultLevel: "L4",
	executionClass: "exclusive",
	irreversible: true,
	externalSideEffect: true,
	requiredScopes: [],
});

export interface ToolRiskEvaluation {
	readonly toolName: string;
	readonly descriptor: ToolRiskDescriptor;
	/** 评估后的等级；只能等于或高于 descriptor.defaultLevel。 */
	readonly level: ToolRiskLevel;
	/** 未知工具（未注册描述符）时为 true；策略应据此 fail closed。 */
	readonly unknown: boolean;
}

const LEVEL_ORDER: Readonly<Record<ToolRiskLevel, number>> = Object.freeze({ L0: 0, L1: 1, L2: 2, L3: 3, L4: 4 });

/** 风险只能被参数/目标提升，不能被模型或调用方降低。 */
export function raiseToolRiskLevel(base: ToolRiskLevel, proposed: ToolRiskLevel | undefined): ToolRiskLevel {
	if (proposed === undefined) return base;
	return LEVEL_ORDER[proposed] > LEVEL_ORDER[base] ? proposed : base;
}

/**
 * 评估一次工具调用的风险。
 *
 * `raise` 由产品策略提供：根据参数与目标资源返回应提升到的等级
 * （例如写入受保护目录、删除类命令、外网目标）。返回值只升不降；
 * 未注册描述符的工具按 L4 fail-closed。
 */
export function evaluateToolRisk(input: {
	readonly toolName: string;
	readonly descriptor: ToolRiskDescriptor | undefined;
	readonly raise?: (args: unknown) => ToolRiskLevel | undefined;
	readonly args?: unknown;
}): ToolRiskEvaluation {
	if (!input.descriptor) {
		return { toolName: input.toolName, descriptor: UNKNOWN_TOOL_RISK_DESCRIPTOR, level: "L4", unknown: true };
	}
	const raised = input.raise ? input.raise(input.args) : undefined;
	return {
		toolName: input.toolName,
		descriptor: input.descriptor,
		level: raiseToolRiskLevel(input.descriptor.defaultLevel, raised),
		unknown: false,
	};
}

/** 各等级是否需要逐次审批；产品默认矩阵，宿主可用更严策略覆盖。 */
export function defaultApprovalRequirement(level: ToolRiskLevel): "auto" | "per-call" {
	return level === "L3" || level === "L4" ? "per-call" : "auto";
}
