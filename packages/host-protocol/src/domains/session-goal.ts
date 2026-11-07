// Copyright The Open Forge contributors.
import { Type } from "@sinclair/typebox";
import { defineHostMethod, type HostMethodSignatures } from "../method.js";

/**
 * 会话 goal/todos 子域合同（PLAN-0029 Phase 3 领域迁移，TASK-0469）。
 * goal 编排语义（start/resume 失败回滚 paused、pause/clear 中止流）留在
 * DesktopGoalController；本合同只钉定形状与参数校验。
 */

const SessionIdParams = Type.Object({ sessionId: Type.String({ minLength: 1 }) }, { additionalProperties: false });
const GoalIdParams = Type.Object(
	{ sessionId: Type.String({ minLength: 1 }), goalId: Type.String({ minLength: 1 }) },
	{ additionalProperties: false },
);

const GoalStateSchema = Type.Object(
	{
		goalId: Type.String(),
		objective: Type.String(),
		status: Type.Union([
			Type.Literal("active"),
			Type.Literal("paused"),
			Type.Literal("blocked"),
			Type.Literal("usage_limited"),
			Type.Literal("complete"),
		]),
		statusDetail: Type.Optional(Type.String()),
		tokensUsed: Type.Number(),
		timeUsedSeconds: Type.Number(),
		continuationCount: Type.Integer(),
		createdAt: Type.String(),
		updatedAt: Type.String(),
	},
	{ additionalProperties: false },
);

export const SESSION_GOAL_HOST_METHODS = {
	getGoalState: defineHostMethod({
		name: "session.getGoalState",
		params: SessionIdParams,
		result: Type.Union([GoalStateSchema, Type.Null()]),
	}),
	startGoal: defineHostMethod({
		name: "session.startGoal",
		params: Type.Object(
			{ sessionId: Type.String({ minLength: 1 }), objective: Type.String({ minLength: 1 }) },
			{ additionalProperties: false },
		),
		result: GoalStateSchema,
	}),
	pauseGoal: defineHostMethod({
		name: "session.pauseGoal",
		params: GoalIdParams,
		result: GoalStateSchema,
	}),
	resumeGoal: defineHostMethod({
		name: "session.resumeGoal",
		params: GoalIdParams,
		result: GoalStateSchema,
	}),
	clearGoal: defineHostMethod({
		name: "session.clearGoal",
		params: GoalIdParams,
		result: Type.Null(),
	}),
	clearTodos: defineHostMethod({
		name: "session.clearTodos",
		params: SessionIdParams,
		result: Type.Boolean(),
	}),
};

export type SessionGoalHostMethods = HostMethodSignatures<typeof SESSION_GOAL_HOST_METHODS>;
