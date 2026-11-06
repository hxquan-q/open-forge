// Copyright The Open Forge contributors.
import { Type } from "@sinclair/typebox";
import { defineHostMethod, type HostMethodSignatures } from "../method.js";

/**
 * 模型预设目录领域合同（PLAN-0029 Phase 2 延续）：只覆盖免 key 的公共目录数据。
 * 携带凭证的通道（refresh-preset-models、models get/set、copy-api-key 等）按 ADR-0152
 * 第 7 条单独评审后再迁入；`presets-updated` 事件待快照+增量事件模型定稿。
 */

/** 与 `apps/desktop/src/main/models/presets/errors.ts` 的 PresetErrorCode 对齐。 */
const PresetErrorSchema = Type.Object({
	code: Type.Union([
		Type.Literal("unknown-provider"),
		Type.Literal("missing-key"),
		Type.Literal("invalid-key"),
		Type.Literal("http-status"),
		Type.Literal("empty-models"),
		Type.Literal("timeout"),
		Type.Literal("network"),
	]),
	params: Type.Optional(Type.Record(Type.String(), Type.Union([Type.String(), Type.Number()]))),
	detail: Type.Optional(Type.String()),
});

/** 与 `ModelDefinition`（model-settings-service.ts）对齐；目录数据全部可选字段按宽收。 */
const ModelDefinitionSchema = Type.Object({
	id: Type.String(),
	modelId: Type.Optional(Type.String()),
	name: Type.Optional(Type.String()),
	api: Type.Optional(Type.String()),
	reasoning: Type.Optional(Type.Boolean()),
	reasoningLevels: Type.Optional(Type.Array(Type.String())),
	defaultReasoningLevel: Type.Optional(Type.String()),
	input: Type.Optional(Type.Array(Type.String())),
	contextWindow: Type.Optional(Type.Number()),
	maxTokens: Type.Optional(Type.Number()),
	cost: Type.Optional(
		Type.Object({
			input: Type.Number(),
			output: Type.Number(),
			cacheRead: Type.Number(),
			cacheWrite: Type.Number(),
		}),
	),
});

/** 无参数方法的封闭合同:额外属性拒绝,不静默忽略。 */
const NoParams = Type.Object({}, { additionalProperties: false });

export const MODELS_HOST_METHODS = {
	listPresets: defineHostMethod({
		name: "models.listPresets",
		params: NoParams,
		result: Type.Object({
			providers: Type.Array(
				Type.Object({
					id: Type.String(),
					displayName: Type.String(),
					api: Type.String(),
					baseUrl: Type.String(),
					icon: Type.String(),
					catalogModels: Type.Array(ModelDefinitionSchema),
				}),
			),
			catalogError: Type.Optional(PresetErrorSchema),
			catalogSource: Type.Union([Type.Literal("live"), Type.Literal("snapshot")]),
			catalogFetchedAt: Type.Optional(Type.String()),
		}),
	}),
	refreshPresetCatalog: defineHostMethod({
		name: "models.refreshPresetCatalog",
		params: NoParams,
		result: Type.Object({
			ok: Type.Boolean(),
			error: Type.Optional(PresetErrorSchema),
			elapsedMs: Type.Integer(),
			modelCount: Type.Integer(),
		}),
	}),
} as const;

export type ModelsHostMethods = HostMethodSignatures<typeof MODELS_HOST_METHODS>;
