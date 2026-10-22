// Modified by The Open Forge contributors.

import { Type } from "@sinclair/typebox";
import { MEMORY_POLICY_MODES } from "./policy.js";
import { MEMORY_EVIDENCE_LEVELS, MEMORY_KINDS, MEMORY_REVISION_STATUSES } from "./records.js";
import { MEMORY_SCOPE_NAMES, MEMORY_VISIBILITIES } from "./scopes.js";

/**
 * 边界 Schema（typebox）：跨进程/持久化边界的运行时校验事实源。
 * 类型层与 Schema 层同源演化：改字段必须同步改这里，CI 的导出检查会
 * 核对两者同时出现于公共出口。
 */

export const MemoryScopeIdentitySchema = Type.Object({
	principalId: Type.String({ minLength: 1 }),
	projectId: Type.Optional(Type.String({ minLength: 1 })),
	workspaceViewId: Type.Optional(Type.String({ minLength: 1 })),
});

export const MemoryScopeSchema = Type.Object({
	name: Type.Union(MEMORY_SCOPE_NAMES.map((name) => Type.Literal(name))),
	identity: MemoryScopeIdentitySchema,
	visibility: Type.Optional(Type.Union(MEMORY_VISIBILITIES.map((value) => Type.Literal(value)))),
});

export const MemoryModelBudgetSchema = Type.Object({
	model: Type.String({ minLength: 1 }),
	maxOutputTokens: Type.Integer({ minimum: 1 }),
	dailyRequestLimit: Type.Optional(Type.Integer({ minimum: 1 })),
});

export const MemoryPolicyConfigurationSchema = Type.Object({
	mode: Type.Union(MEMORY_POLICY_MODES.map((mode) => Type.Literal(mode))),
	allowedScopes: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
	extractionBudget: Type.Optional(MemoryModelBudgetSchema),
	embeddingBudget: Type.Optional(MemoryModelBudgetSchema),
});

export const MemoryValidTimeSchema = Type.Union([Type.String({ minLength: 1 }), Type.Literal("unknown")]);

export const MemoryRevisionSchema = Type.Object({
	memoryId: Type.String({ minLength: 1 }),
	revisionId: Type.String({ minLength: 1 }),
	kind: Type.Union(MEMORY_KINDS.map((kind) => Type.Literal(kind))),
	content: Type.String(),
	scopeName: Type.String({ minLength: 1 }),
	visibility: Type.Optional(Type.String({ minLength: 1 })),
	status: Type.Union(MEMORY_REVISION_STATUSES.map((status) => Type.Literal(status))),
	validFrom: MemoryValidTimeSchema,
	validTo: Type.Union([MemoryValidTimeSchema, Type.Literal("")]),
	recordedAt: MemoryValidTimeSchema,
	supersedes: Type.Union([Type.String({ minLength: 1 }), Type.Literal("")]),
	evidence: Type.Union(MEMORY_EVIDENCE_LEVELS.map((level) => Type.Literal(level))),
	pinned: Type.Optional(Type.Boolean()),
});

export const TemporalSelectorSchema = Type.Object({
	asOf: Type.String({ minLength: 1 }),
	knownAt: Type.Optional(Type.String({ minLength: 1 })),
});

export const MemoryErasureStateSchema = Type.Object({
	erasureEpoch: Type.Integer({ minimum: 0 }),
	suppressedMemoryIds: Type.Array(Type.String({ minLength: 1 })),
});
