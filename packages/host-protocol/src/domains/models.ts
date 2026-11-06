// Copyright The Open Forge contributors.
import { Type } from "@sinclair/typebox";
import { defineHostMethod, type HostMethodSignatures } from "../method.js";

/**
 * 模型预设目录 + 配置领域合同（PLAN-0029 Phase 2 延续）。ADR-0152 §7 评审结论（见
 * TASK-0459）：读路径 `apiKey` 钉死为掩码 `"***"` 或外部引用（`!cmd` / `env:NAME` /
 * `BARE_NAME`），明文密钥在合同层结构不可达；写路径 `apiKey` 自由 string（一次性传入
 * 语义不变）；copy 只回 boolean，密钥仅入系统剪贴板。token 类通道仍留旧 IPC。
 */

/** 掩码值与 `model-settings-service.ts` 的 `MASKED_MODEL_API_KEY` 对齐。 */
const MASKED_API_KEY = "***";
/** 与 `normalizeExternalApiKeySource` 认定的外部引用形态对齐（大小写不敏感）。 */
const EXTERNAL_API_KEY_PATTERN = "^(?:![\\s\\S]+|env:[A-Za-z_][A-Za-z0-9_]*|[A-Za-z_][A-Za-z0-9_]*)$";

/** renderer 可见的 apiKey：只允许掩码或外部引用，明文会在结果校验时被拒绝。 */
const RendererApiKeySchema = Type.Union([
	Type.Literal(MASKED_API_KEY),
	Type.String({ pattern: EXTERNAL_API_KEY_PATTERN }),
]);

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

const NoParams = Type.Object({}, { additionalProperties: false });

const ModelOverridesSchema = Type.Record(Type.String(), Type.Record(Type.String(), Type.Unknown()));

/** Provider 条目；读/写仅在 `apiKey` 的可见性合同上分化，其余字段同形。 */
function providerSchema(apiKey: ReturnType<typeof Type.String> | typeof RendererApiKeySchema) {
	return Type.Object({
		baseUrl: Type.Optional(Type.String()),
		apiKey: Type.Optional(apiKey),
		credentialRef: Type.Optional(Type.String()),
		api: Type.Optional(Type.String()),
		headers: Type.Optional(Type.Record(Type.String(), Type.String())),
		authHeader: Type.Optional(Type.Boolean()),
		displayName: Type.Optional(Type.String()),
		source: Type.Optional(Type.Literal("template")),
		templateId: Type.Optional(Type.String()),
		icon: Type.Optional(Type.String()),
		modelsSyncedAt: Type.Optional(Type.String()),
		useProxy: Type.Optional(Type.Boolean()),
		models: Type.Optional(Type.Array(ModelDefinitionSchema)),
		modelOverrides: Type.Optional(ModelOverridesSchema),
	});
}

const RendererModelsConfigSchema = Type.Object({
	defaultModel: Type.Optional(Type.String()),
	providers: Type.Record(Type.String(), providerSchema(RendererApiKeySchema)),
});

/** 写路径不复述收紧形状：renderer 提交的存量配置（含任意 apiKey 形态）原样进入 `replaceConfig`。 */
const ModelsConfigWriteSchema = Type.Object({
	defaultModel: Type.Optional(Type.String()),
	providers: Type.Record(Type.String(), providerSchema(Type.String())),
});

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
	getConfig: defineHostMethod({
		name: "models.getConfig",
		params: NoParams,
		result: RendererModelsConfigSchema,
	}),
	setConfig: defineHostMethod({
		name: "models.setConfig",
		params: Type.Object({ config: ModelsConfigWriteSchema }),
		result: Type.Null(),
	}),
	copyApiKey: defineHostMethod({
		name: "models.copyApiKey",
		params: Type.Object({ providerId: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
		result: Type.Boolean(),
	}),
} as const;

export type ModelsHostMethods = HostMethodSignatures<typeof MODELS_HOST_METHODS>;
