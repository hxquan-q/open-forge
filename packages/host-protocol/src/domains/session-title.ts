// Copyright The Open Forge contributors.
import { Type } from "@sinclair/typebox";
import { defineHostMethod, type HostMethodSignatures } from "../method.js";

/**
 * 会话标题与建议子域合同（PLAN-0029 Phase 3 领域迁移，TASK-0470）。
 * 纯请求/响应：rename 的所有权守卫（assertOrdinaryConversationPath）与
 * auto-title 的"空文本对→null / 生成后回写"语义留在 Host 实现侧。
 */

export const SESSION_TITLE_HOST_METHODS = {
	rename: defineHostMethod({
		name: "session.rename",
		params: Type.Object(
			{ sessionPath: Type.String({ minLength: 1 }), name: Type.String({ minLength: 1 }) },
			{ additionalProperties: false },
		),
		result: Type.Null(),
	}),
	autoTitle: defineHostMethod({
		name: "session.autoTitle",
		params: Type.Object(
			{
				sessionId: Type.String({ minLength: 1 }),
				userText: Type.String(),
				assistantText: Type.String(),
			},
			{ additionalProperties: false },
		),
		result: Type.Union([Type.String(), Type.Null()]),
	}),
	nextPromptSuggestions: defineHostMethod({
		name: "session.nextPromptSuggestions",
		params: Type.Object(
			{ sessionId: Type.String({ minLength: 1 }), conversation: Type.String() },
			{ additionalProperties: false },
		),
		result: Type.Array(Type.String()),
	}),
};

export type SessionTitleHostMethods = HostMethodSignatures<typeof SESSION_TITLE_HOST_METHODS>;
