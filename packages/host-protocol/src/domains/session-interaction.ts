// Copyright The Open Forge contributors.
import { Type } from "@sinclair/typebox";
import { defineHostMethod, type HostMethodSignatures } from "../method.js";

/**
 * 问答与计划评审应答子域合同（PLAN-0029 Phase 3 领域迁移，TASK-0465 组 3，TASK-0478）。
 * 纯请求/响应：question-request/resolved、plan-review-request/resolved 与
 * pending-question-changed 推送仍走旧 IPC —— broker/domain 需要在没有在途 Host
 * 调用时主动推送 renderer，事件面另片处理。
 */

const NoParams = Type.Object({}, { additionalProperties: false });

const QuestionOptionSchema = Type.Object(
	{
		label: Type.String(),
		description: Type.String(),
		badges: Type.Optional(Type.Array(Type.String())),
	},
	{ additionalProperties: false },
);

const QuestionItemSchema = Type.Object(
	{
		question: Type.String(),
		header: Type.String(),
		options: Type.Array(QuestionOptionSchema),
		multiSelect: Type.Optional(Type.Boolean()),
	},
	{ additionalProperties: false },
);

const QuestionRequestSchema = Type.Object(
	{
		requestId: Type.String({ minLength: 1 }),
		sessionId: Type.String({ minLength: 1 }),
		questions: Type.Array(QuestionItemSchema),
	},
	{ additionalProperties: false },
);

const PlanReviewRequestSchema = Type.Object(
	{
		requestId: Type.String({ minLength: 1 }),
		sessionId: Type.String({ minLength: 1 }),
		plan: Type.String(),
	},
	{ additionalProperties: false },
);

/** renderer 应答是不可信输入：结构交给 broker 的 normalize* 收窄，合同只钉住编码边界。 */
const RespondParams = Type.Object(
	{ requestId: Type.String({ minLength: 1 }), result: Type.Unknown() },
	{ additionalProperties: false },
);

export const SESSION_INTERACTION_HOST_METHODS = {
	listPendingQuestions: defineHostMethod({
		name: "session.listPendingQuestions",
		params: NoParams,
		result: Type.Array(QuestionRequestSchema),
	}),
	respondToQuestion: defineHostMethod({
		name: "session.respondToQuestion",
		params: RespondParams,
		result: Type.Null(),
	}),
	listPendingPlanReviews: defineHostMethod({
		name: "session.listPendingPlanReviews",
		params: NoParams,
		result: Type.Array(PlanReviewRequestSchema),
	}),
	respondToPlanReview: defineHostMethod({
		name: "session.respondToPlanReview",
		params: RespondParams,
		result: Type.Null(),
	}),
};

export type SessionInteractionHostMethods = HostMethodSignatures<typeof SESSION_INTERACTION_HOST_METHODS>;
