// Copyright The Open Forge contributors.
import { Type } from "@sinclair/typebox";
import { defineHostMethod, type HostMethodSignatures } from "../method.js";

/**
 * 设置领域合同（TASK-0453 试点）。只覆盖非凭证类设置；server token / refresh token
 * 涉及凭证，按 ADR-0152 安全一方化另行评审后再迁入。
 */
export const ModelTransportSchema = Type.Union([Type.Literal("sse"), Type.Literal("websocket"), Type.Literal("auto")]);

export const SessionInterruptModeSchema = Type.Union([
	Type.Literal("off"),
	Type.Literal("notify"),
	Type.Literal("auto"),
]);

export const SessionInterruptContinueSchema = Type.Object({
	mode: SessionInterruptModeSchema,
	maxAttempts: Type.Integer({ minimum: 1 }),
});

const NoParams = Type.Object({});

export const SETTINGS_HOST_METHODS = {
	getServerUrl: defineHostMethod({ name: "settings.getServerUrl", params: NoParams, result: Type.String() }),
	getSiteUrl: defineHostMethod({ name: "settings.getSiteUrl", params: NoParams, result: Type.String() }),
	getModelTransport: defineHostMethod({
		name: "settings.getModelTransport",
		params: NoParams,
		result: ModelTransportSchema,
	}),
	setModelTransport: defineHostMethod({
		name: "settings.setModelTransport",
		params: Type.Object({ transport: ModelTransportSchema }),
		result: ModelTransportSchema,
	}),
	getSessionInterruptContinue: defineHostMethod({
		name: "settings.getSessionInterruptContinue",
		params: NoParams,
		result: SessionInterruptContinueSchema,
	}),
	setSessionInterruptContinue: defineHostMethod({
		name: "settings.setSessionInterruptContinue",
		params: Type.Object({ mode: SessionInterruptModeSchema }),
		result: Type.Null(),
	}),
} as const;

export type SettingsHostMethods = HostMethodSignatures<typeof SETTINGS_HOST_METHODS>;
