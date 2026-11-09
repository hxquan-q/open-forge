// Copyright The Open Forge contributors.
import { Type } from "@sinclair/typebox";
import { defineHostMethod, type HostMethodSignatures } from "../method.js";

/**
 * 会话执行模式与全局设置子域合同（PLAN-0029 Phase 3 领域迁移，TASK-0472）。
 * 纯请求/响应：executionMode 二字面量由合同校验（替代旧 assertExecutionMode）；
 * thinkingLevel 是开放字符串联合，沿用 session-defaults 的 Type.String 约定；
 * AGENT_MODE_CHANGED 显示同步广播仍走旧 IPC（副作用，非本合同返回面）。
 */

const ExecutionModeSchema = Type.Union([Type.Literal("sandbox"), Type.Literal("full-access")]);

const SettingsPatchSchema = Type.Object(
	{
		thinkingLevel: Type.Optional(Type.String({ minLength: 1 })),
		steeringMode: Type.Optional(Type.Union([Type.Literal("all"), Type.Literal("one-at-a-time")])),
		followUpMode: Type.Optional(Type.Union([Type.Literal("all"), Type.Literal("one-at-a-time")])),
		modelKey: Type.Optional(Type.String({ minLength: 1 })),
	},
	{ additionalProperties: false },
);

export const SESSION_EXECUTION_HOST_METHODS = {
	updateSettings: defineHostMethod({
		name: "session.updateSettings",
		params: Type.Object(
			{ sessionId: Type.String({ minLength: 1 }), patch: SettingsPatchSchema },
			{ additionalProperties: false },
		),
		result: Type.Null(),
	}),
	setExecutionMode: defineHostMethod({
		name: "session.setExecutionMode",
		params: Type.Object(
			{ sessionId: Type.String({ minLength: 1 }), mode: ExecutionModeSchema },
			{ additionalProperties: false },
		),
		result: Type.Null(),
	}),
	setGlobalExecutionMode: defineHostMethod({
		name: "session.setGlobalExecutionMode",
		params: Type.Object({ mode: ExecutionModeSchema }, { additionalProperties: false }),
		result: Type.Null(),
	}),
	setGlobalAgentMode: defineHostMethod({
		name: "session.setGlobalAgentMode",
		params: Type.Object({ mode: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
		result: Type.Null(),
	}),
	setGlobalThinkingLevel: defineHostMethod({
		name: "session.setGlobalThinkingLevel",
		params: Type.Object({ level: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
		result: Type.Null(),
	}),
	getAgentModes: defineHostMethod({
		name: "session.getAgentModes",
		params: Type.Object({}, { additionalProperties: false }),
		result: Type.Array(
			Type.Object({
				id: Type.String(),
				label: Type.String(),
				description: Type.String(),
				icon: Type.String(),
			}),
		),
	}),
};

export type SessionExecutionHostMethods = HostMethodSignatures<typeof SESSION_EXECUTION_HOST_METHODS>;
