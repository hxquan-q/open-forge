// Copyright The Open Forge contributors.
import { Type } from "@sinclair/typebox";
import { defineHostMethod, type HostMethodSignatures } from "../method.js";

/**
 * 会话 plan-mode 子域合同（PLAN-0029 Phase 3 领域迁移，TASK-0471）。
 * 纯请求/响应：`CodingAgentPlanModeState` 形状钉定（permissionMode 二枚举
 * + 最近一次提交审批的计划，缺省表示从未提交）。plan-review 的
 * request/response 交互与事件耦合不在本片（随事件原语设计）。
 */

const SessionIdParams = Type.Object({ sessionId: Type.String({ minLength: 1 }) }, { additionalProperties: false });

const PlanSchema = Type.Object(
	{
		content: Type.String(),
		status: Type.Union([
			Type.Literal("pending-review"),
			Type.Literal("approved"),
			Type.Literal("changes-requested"),
			Type.Literal("dismissed"),
		]),
		updatedAt: Type.String(),
	},
	{ additionalProperties: false },
);

const PlanModeStateSchema = Type.Object(
	{
		permissionMode: Type.Union([Type.Literal("default"), Type.Literal("plan")]),
		plan: Type.Optional(PlanSchema),
	},
	{ additionalProperties: false },
);

export const SESSION_PLAN_MODE_HOST_METHODS = {
	getPlanModeState: defineHostMethod({
		name: "session.getPlanModeState",
		params: SessionIdParams,
		result: PlanModeStateSchema,
	}),
	setPlanModePermissionMode: defineHostMethod({
		name: "session.setPlanModePermissionMode",
		params: Type.Object(
			{
				sessionId: Type.String({ minLength: 1 }),
				permissionMode: Type.Union([Type.Literal("default"), Type.Literal("plan")]),
			},
			{ additionalProperties: false },
		),
		result: PlanModeStateSchema,
	}),
};

export type SessionPlanModeHostMethods = HostMethodSignatures<typeof SESSION_PLAN_MODE_HOST_METHODS>;
