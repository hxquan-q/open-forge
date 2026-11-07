// Copyright The Open Forge contributors.
import { Type } from "@sinclair/typebox";
import { defineHostMethod, type HostMethodSignatures } from "../method.js";

/**
 * 会话默认项/个性化子域合同（PLAN-0029 Phase 3 领域迁移，TASK-0466）：不含事件、
 * 凭证或运行中会话耦合的纯读写面。set-global-thinking 等需触达活跃会话运行时的
 * 设置器留旧 IPC，待运行时注入形状定稿后迁入。
 */

const NoParams = Type.Object({}, { additionalProperties: false });

const PersonalizationSchema = Type.Object({
	personaId: Type.String({ minLength: 1 }),
	customPrompt: Type.String(),
});

export const SESSION_DEFAULTS_HOST_METHODS = {
	getThinkingLevel: defineHostMethod({
		name: "session.getThinkingLevel",
		params: NoParams,
		result: Type.String(),
	}),
	getPersonas: defineHostMethod({
		name: "session.getPersonas",
		params: NoParams,
		result: Type.Array(Type.Object({ id: Type.String(), label: Type.String(), description: Type.String() })),
	}),
	getPersonalization: defineHostMethod({
		name: "session.getPersonalization",
		params: NoParams,
		result: PersonalizationSchema,
	}),
	setPersonalization: defineHostMethod({
		name: "session.setPersonalization",
		params: PersonalizationSchema,
		result: Type.Null(),
	}),
} as const;

export type SessionDefaultsHostMethods = HostMethodSignatures<typeof SESSION_DEFAULTS_HOST_METHODS>;
