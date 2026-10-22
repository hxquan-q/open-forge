// Modified by The Open Forge contributors.
import { type Static, Type } from "@sinclair/typebox";
import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import {
	MEMORY_SOURCE_ROLES,
	type MemoryRevision,
	type MemoryScope,
	type MemorySourceReference,
	type MemoryWriteCommand,
	type MemoryWriteResult,
	type TemporalSelector,
} from "@vetta/runtime-memory";
import { ToolCallDescriptionSchema } from "@vetta/runtime-tools/coding";
import type { ConversationScenario } from "../../profiles/index.js";
import type { CodingAgentRuntimeToolRegistration } from "../../runtime-contracts/index.js";

/**
 * 显式记忆工具（TASK-0374，REQ-0027 S2）。
 *
 * 版本化新工具 remember/recall/get/correct/forget：
 * - scope 由宿主绑定（resolveScope 注入），模型只能在允许清单内选
 *   user/project，不得自述 principal 或任意 projectId；
 * - 所有写入返回稳定 ID/revision/scope/保存状态；correct 必须
 *   expectedRevision；错误带稳定错误码抛出，不吞掉、不返回 0 假装成功；
 * - forget 是家族级遗忘；「撤销一次更正」是 correct 语义的显式恢复，
 *   不与 forget 混用；
 * - 同一会话不与 legacy `memory`（add/replace/remove，scopeUse im-claw）
 *   并存：本组工具的 scopeUse 排除 im-claw。
 */

export interface ExplicitMemoryServices {
	readonly write: (scope: MemoryScope, command: MemoryWriteCommand) => Promise<MemoryWriteResult>;
	readonly read: (scope: MemoryScope, selector: TemporalSelector) => Promise<readonly MemoryRevision[]>;
	readonly listRevisions: (memoryId: string, scope: MemoryScope) => Promise<readonly MemoryRevision[]>;
	readonly listSources: (memoryId: string, scope: MemoryScope) => Promise<readonly MemorySourceReference[]>;
	readonly search: (
		scope: MemoryScope,
		query: string,
		selector: TemporalSelector,
		limit?: number,
	) => Promise<{
		readonly entries: readonly {
			readonly memoryId: string;
			readonly revisionId: string;
			readonly content: string;
			readonly matchKind: string;
		}[];
		readonly degraded: boolean;
	}>;
	readonly forget: (memoryId: string, scope: MemoryScope) => Promise<{ readonly erasureEpoch: number }>;
	readonly undoLastCorrection?: (
		memoryId: string,
		scope: MemoryScope,
		expectedRevision: number,
	) => Promise<{ readonly restoredRevision: number; readonly restoredContent: string }>;
}

/** 宿主绑定的 scope 上下文：模型输入经此折算，绝不直接采信。 */
export interface ExplicitMemoryScopeContext {
	/** 会话允许的记忆作用域（宿主按 memoryPolicy 与身份解析注入）。 */
	readonly allowed: readonly { readonly name: "user" | "project"; readonly scope: MemoryScope }[];
}

export interface ExplicitMemoryToolOptions {
	readonly services: ExplicitMemoryServices;
	readonly scopeContext: ExplicitMemoryScopeContext;
	readonly now?: () => string;
}

const MemoryScopeHintSchema = Type.Union([Type.Literal("user"), Type.Literal("project")], {
	description:
		"Scope hint: user (cross-project preference) or project (current project fact). Must be allowed for this session.",
});

export const MemoryRememberInputSchema = Type.Object({
	description: ToolCallDescriptionSchema,
	content: Type.String({ description: "One self-contained fact/preference to remember." }),
	kind: Type.Optional(
		Type.Union([Type.Literal("fact"), Type.Literal("preference"), Type.Literal("convention")], {
			description: "Memory kind. Default: fact.",
		}),
	),
	scope: MemoryScopeHintSchema,
	sources: Type.Optional(
		Type.Array(Type.Object({ sourceId: Type.String(), role: Type.String() }), {
			description: "Optional bounded source references.",
		}),
	),
});

export const MemoryRecallInputSchema = Type.Object({
	description: ToolCallDescriptionSchema,
	query: Type.String({ description: "Search query (any language; short terms fall back to substring scan)." }),
	limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20, description: "Max entries. Default 8." })),
});

export const MemoryGetInputSchema = Type.Object({
	description: ToolCallDescriptionSchema,
	memoryId: Type.String(),
});

export const MemoryCorrectInputSchema = Type.Object({
	description: ToolCallDescriptionSchema,
	memoryId: Type.String(),
	expectedRevision: Type.Integer({
		minimum: 0,
		description: "Current revision number; mismatch returns a version conflict.",
	}),
	content: Type.String(),
	scope: MemoryScopeHintSchema,
});

export const MemoryForgetInputSchema = Type.Object({
	description: ToolCallDescriptionSchema,
	memoryId: Type.String(),
	alsoProcessSources: Type.Optional(
		Type.Boolean({ description: "Also process the original conversation sources via host flow. Default false." }),
	),
});

export type MemoryRememberInput = Static<typeof MemoryRememberInputSchema>;
export type MemoryRecallInput = Static<typeof MemoryRecallInputSchema>;
export type MemoryGetInput = Static<typeof MemoryGetInputSchema>;
export type MemoryCorrectInput = Static<typeof MemoryCorrectInputSchema>;
export type MemoryForgetInput = Static<typeof MemoryForgetInputSchema>;

function resolveScope(context: ExplicitMemoryScopeContext, hint: "user" | "project" | undefined): MemoryScope {
	const requested = hint ?? "project";
	const entry = context.allowed.find((candidate) => candidate.name === requested);
	if (!entry) {
		throw new Error(`SCOPE_NOT_ALLOWED：会话未授权 ${requested} 记忆作用域`);
	}
	return entry.scope;
}

function selectorFor(now: () => string): TemporalSelector {
	return { asOf: now() };
}

export function createMemoryRememberTool(
	options: ExplicitMemoryToolOptions,
): RuntimeToolDefinition<MemoryRememberInput> {
	return {
		name: "memory_remember",
		label: "Memory: remember",
		description: "Explicitly save a fact/preference to persistent memory. Returns the memory id and revision.",
		inputSchema: MemoryRememberInputSchema,
		async execute({ input }) {
			const scope = resolveScope(options.scopeContext, input.scope);
			const result = await options.services.write(scope, {
				action: "remember",
				content: input.content,
				kind: input.kind ?? "fact",
				scopeName: scope.name,
				...(input.sources
					? {
							sources: input.sources.map((source) => ({
								sourceId: source.sourceId,
								role: (MEMORY_SOURCE_ROLES as readonly string[]).includes(source.role)
									? (source.role as MemorySourceReference["role"])
									: "user-input",
							})),
						}
					: {}),
			});
			return {
				content: [
					{
						type: "text",
						text: `saved: memoryId=${result.memoryId} revision=${result.revision} scope=${scope.name} status=${result.status}`,
					},
				],
				details: { memoryId: result.memoryId, revision: result.revision, scope: scope.name, status: result.status },
			};
		},
	};
}

export function createMemoryRecallTool(options: ExplicitMemoryToolOptions): RuntimeToolDefinition<MemoryRecallInput> {
	return {
		name: "memory_recall",
		label: "Memory: recall",
		description:
			"Search persistent memory in allowed scopes. Returns bounded entries with match kind and degradation state.",
		inputSchema: MemoryRecallInputSchema,
		async execute({ input }) {
			if (options.scopeContext.allowed.length === 0) {
				throw new Error("SCOPE_NOT_ALLOWED：会话未启用记忆作用域");
			}
			const results = [];
			for (const entry of options.scopeContext.allowed) {
				const found = await options.services.search(
					entry.scope,
					input.query,
					selectorFor(options.now ?? defaultNow),
					input.limit ?? 8,
				);
				results.push({ scope: entry.name, ...found });
			}
			const lines = results.flatMap((result) =>
				result.entries.map(
					(entry) =>
						`[${result.scope}${result.degraded ? "|fallback" : ""}] ${entry.memoryId}#${entry.revisionId}: ${entry.content}`,
				),
			);
			return {
				content: [{ type: "text", text: lines.length === 0 ? "(no matches)" : lines.slice(0, 16).join("\n") }],
				details: {
					scopes: results.map((result) => result.scope),
					degraded: results.some((result) => result.degraded),
				},
			};
		},
	};
}

export function createMemoryGetTool(options: ExplicitMemoryToolOptions): RuntimeToolDefinition<MemoryGetInput> {
	return {
		name: "memory_get",
		label: "Memory: get",
		description: "Read a memory family's revisions and bounded source references.",
		inputSchema: MemoryGetInputSchema,
		async execute({ input }) {
			if (options.scopeContext.allowed.length === 0) {
				throw new Error("SCOPE_NOT_ALLOWED：会话未启用记忆作用域");
			}
			const errors: string[] = [];
			for (const entry of options.scopeContext.allowed) {
				const revisions = await options.services.listRevisions(input.memoryId, entry.scope);
				if (revisions.length === 0) {
					continue;
				}
				const sources = await options.services.listSources(input.memoryId, entry.scope);
				const lines = revisions.map(
					(revision) =>
						`r${revision.revisionId}: ${revision.content} [${revision.status} validFrom=${revision.validFrom}]`,
				);
				return {
					content: [
						{
							type: "text",
							text: [
								...lines,
								`sources: ${sources.map((source) => source.sourceId).join(", ") || "(none)"}`,
							].join("\n"),
						},
					],
					details: { memoryId: input.memoryId, revisionCount: revisions.length, sourceCount: sources.length },
				};
			}
			for (const error of errors) throw new Error(error);
			throw new Error(`NOT_FOUND：记忆 ${input.memoryId} 不存在或已遗忘`);
		},
	};
}

export function createMemoryCorrectTool(options: ExplicitMemoryToolOptions): RuntimeToolDefinition<MemoryCorrectInput> {
	return {
		name: "memory_correct",
		label: "Memory: correct",
		description: "Append a corrected revision. Requires expectedRevision; version mismatch returns a conflict error.",
		inputSchema: MemoryCorrectInputSchema,
		async execute({ input }) {
			const scope = resolveScope(options.scopeContext, input.scope);
			const result = await options.services.write(scope, {
				action: "correct",
				memoryId: input.memoryId,
				expectedRevision: input.expectedRevision,
				content: input.content,
			});
			return {
				content: [
					{
						type: "text",
						text: `saved: memoryId=${result.memoryId} revision=${result.revision} scope=${scope.name}`,
					},
				],
				details: { memoryId: result.memoryId, revision: result.revision, scope: scope.name },
			};
		},
	};
}

export function createMemoryForgetTool(options: ExplicitMemoryToolOptions): RuntimeToolDefinition<MemoryForgetInput> {
	return {
		name: "memory_forget",
		label: "Memory: forget",
		description:
			"Forget a memory family: all versions and derived indexes are erased; old sources are blocked from re-extraction.",
		inputSchema: MemoryForgetInputSchema,
		async execute({ input }) {
			if (options.scopeContext.allowed.length === 0) {
				throw new Error("SCOPE_NOT_ALLOWED：会话未启用记忆作用域");
			}
			for (const entry of options.scopeContext.allowed) {
				const revisions = await options.services.listRevisions(input.memoryId, entry.scope);
				if (revisions.length === 0) continue;
				const outcome = await options.services.forget(input.memoryId, entry.scope);
				return {
					content: [
						{
							type: "text",
							text: `forgotten: memoryId=${input.memoryId} erasureEpoch=${outcome.erasureEpoch}${input.alsoProcessSources === true ? "（来源处理请求已登记，由宿主流程执行）" : ""}`,
						},
					],
					details: { memoryId: input.memoryId, erasureEpoch: outcome.erasureEpoch },
				};
			}
			throw new Error(`NOT_FOUND：记忆 ${input.memoryId} 不存在或已遗忘`);
		},
	};
}

function defaultNow(): string {
	return new Date().toISOString();
}

/** 新工具可见场景：排除 im-claw（legacy memory 工具的独占场景），避免双写语义。 */
export const EXPLICIT_MEMORY_TOOL_SCOPES = [
	"conversation",
	"project",
	"batch",
	"automation",
	"kb-processing",
	"cli",
] as const satisfies readonly ConversationScenario[];

export interface ExplicitMemoryToolRegistrationOptions extends ExplicitMemoryToolOptions {
	readonly modelOrder?: number;
}

export function createExplicitMemoryToolRegistrations(
	options: ExplicitMemoryToolRegistrationOptions,
): CodingAgentRuntimeToolRegistration[] {
	const tools = [
		createMemoryRememberTool(options),
		createMemoryRecallTool(options),
		createMemoryGetTool(options),
		createMemoryCorrectTool(options),
		createMemoryForgetTool(options),
	] as unknown as CodingAgentRuntimeToolRegistration["tool"][];
	return tools.map((tool) => ({
		tool,
		scopeUse: [...EXPLICIT_MEMORY_TOOL_SCOPES],
		...(options.modelOrder === undefined ? {} : { modelOrder: options.modelOrder }),
		category: "memory",
	}));
}
