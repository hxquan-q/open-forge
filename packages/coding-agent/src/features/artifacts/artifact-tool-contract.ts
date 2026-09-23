// Copyright The Open Forge contributors.
import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { RuntimeToolResult } from "@vetta/runtime-core/kernel";
import { defineSessionExtensionFunction } from "@vetta/runtime-core/session-extensions";
import { ARTIFACT_KINDS, type ArtifactKind } from "@vetta/runtime-core/task";

/**
 * Conversation / Task 双生命周期的 `artifact` 工具合同（TASK-0059 / PLAN-0006）。
 * 文件内容是事实源；descriptor 只经现有 `artifact.descriptor.recorded` 落盘。
 * 宿主实现（TASK-0060）经可选 session-extension function 接入。
 */

export const ARTIFACT_TOOL_NAME = "artifact";

export const CODING_AGENT_ARTIFACT_EXTENSION_ID = "coding-agent.artifact";

export const ARTIFACT_TOOL_ACTIONS = ["create", "update", "get", "list", "attach_to_task"] as const;

export type ArtifactToolAction = (typeof ARTIFACT_TOOL_ACTIONS)[number];

export const ARTIFACT_TOOL_ERROR_CODES = [
	"stale_version",
	"missing_file",
	"no_active_task",
	"invalid_input",
	"cancelled",
	"unimplemented",
] as const;

export type ArtifactToolErrorCode = (typeof ARTIFACT_TOOL_ERROR_CODES)[number];

const ArtifactKindSchema = Type.Union([
	Type.Literal("document"),
	Type.Literal("dataset"),
	Type.Literal("analysis"),
	Type.Literal("code-change"),
	Type.Literal("execution-result"),
	Type.Literal("research-evidence"),
	Type.Literal("bundle"),
]);

const ArtifactCreateInputSchema = Type.Object(
	{
		action: Type.Literal("create"),
		description: Type.Optional(Type.String()),
		title: Type.String({ minLength: 1, description: "Human-readable artifact title" }),
		kind: ArtifactKindSchema,
		content: Type.String({ description: "Full artifact body; the file is the source of truth" }),
		contentType: Type.Optional(Type.String()),
		filename: Type.Optional(Type.String({ description: "Optional file name hint; host may derive one from title" })),
	},
	{ additionalProperties: false },
);

const ArtifactUpdateInputSchema = Type.Object(
	{
		action: Type.Literal("update"),
		description: Type.Optional(Type.String()),
		artifactId: Type.String({ minLength: 1 }),
		baseVersion: Type.Integer({
			minimum: 1,
			description: "Version the update is based on; stale or checksum-mismatched updates are rejected",
		}),
		content: Type.String({ description: "Replacement body; never overwrites an existing version in place" }),
		title: Type.Optional(Type.String({ minLength: 1 })),
		contentType: Type.Optional(Type.String()),
	},
	{ additionalProperties: false },
);

const ArtifactGetInputSchema = Type.Object(
	{
		action: Type.Literal("get"),
		description: Type.Optional(Type.String()),
		artifactId: Type.String({ minLength: 1 }),
		version: Type.Optional(Type.Integer({ minimum: 1 })),
	},
	{ additionalProperties: false },
);

const ArtifactListInputSchema = Type.Object(
	{
		action: Type.Literal("list"),
		description: Type.Optional(Type.String()),
		sourceSessionId: Type.Optional(Type.String({ minLength: 1 })),
	},
	{ additionalProperties: false },
);

const ArtifactAttachInputSchema = Type.Object(
	{
		action: Type.Literal("attach_to_task"),
		description: Type.Optional(Type.String()),
		artifactId: Type.String({ minLength: 1 }),
	},
	{ additionalProperties: false },
);

export const ArtifactToolInputSchema = Type.Union([
	ArtifactCreateInputSchema,
	ArtifactUpdateInputSchema,
	ArtifactGetInputSchema,
	ArtifactListInputSchema,
	ArtifactAttachInputSchema,
]);

export type ArtifactToolInput = Static<typeof ArtifactToolInputSchema>;

export const ArtifactToolErrorSchema = Type.Object(
	{
		ok: Type.Literal(false),
		code: Type.Union([
			Type.Literal("stale_version"),
			Type.Literal("missing_file"),
			Type.Literal("no_active_task"),
			Type.Literal("invalid_input"),
			Type.Literal("cancelled"),
			Type.Literal("unimplemented"),
		]),
		message: Type.String(),
		action: Type.Optional(
			Type.Union([
				Type.Literal("create"),
				Type.Literal("update"),
				Type.Literal("get"),
				Type.Literal("list"),
				Type.Literal("attach_to_task"),
			]),
		),
		artifactId: Type.Optional(Type.String()),
		baseVersion: Type.Optional(Type.Integer({ minimum: 1 })),
		currentVersion: Type.Optional(Type.Integer({ minimum: 1 })),
	},
	{ additionalProperties: false },
);

export type ArtifactToolError = Static<typeof ArtifactToolErrorSchema>;

export interface ArtifactToolListItem {
	readonly artifactId: string;
	readonly title: string;
	readonly kind: ArtifactKind;
	readonly version: number;
	readonly uri?: string;
	readonly contentType?: string;
	readonly checksum?: string;
	readonly sourceTaskId?: string;
	readonly sourceSessionId: string;
	readonly updatedAt: number;
}

export interface ArtifactToolSuccess {
	readonly ok: true;
	readonly action: ArtifactToolAction;
	readonly artifactId?: string;
	readonly version?: number;
	readonly title?: string;
	readonly kind?: ArtifactKind;
	readonly uri?: string;
	readonly contentType?: string;
	readonly checksum?: string;
	readonly sourceTaskId?: string;
	readonly content?: string;
	readonly items?: readonly ArtifactToolListItem[];
}

export type CodingAgentArtifactFunctionResult = ArtifactToolSuccess | ArtifactToolError;

export interface CodingAgentArtifactFunctionRequest {
	readonly sessionId: string;
	readonly turnId: string;
	readonly input: ArtifactToolInput;
}

export const CODING_AGENT_ARTIFACT_FUNCTION = defineSessionExtensionFunction<
	CodingAgentArtifactFunctionRequest,
	CodingAgentArtifactFunctionResult
>(CODING_AGENT_ARTIFACT_EXTENSION_ID, "invoke");

export const ARTIFACT_TOOL_DESCRIPTION = [
	"Create, update, read, or list conversation-owned canvas artifacts, or attach one to the active task.",
	"Files are the source of truth; descriptors are recorded as artifact.descriptor.recorded events.",
	"create/update do not require an active task. update requires artifactId and baseVersion; a stale",
	"baseVersion or checksum mismatch returns stale_version and never overwrites history.",
	"attach_to_task requires an active task and returns no_active_task otherwise.",
	"Do not use this tool to execute code or browse the web.",
].join(" ");

export function isArtifactToolAction(value: unknown): value is ArtifactToolAction {
	return typeof value === "string" && (ARTIFACT_TOOL_ACTIONS as readonly string[]).includes(value);
}

export function isArtifactToolErrorCode(value: unknown): value is ArtifactToolErrorCode {
	return typeof value === "string" && (ARTIFACT_TOOL_ERROR_CODES as readonly string[]).includes(value);
}

export function isArtifactKind(value: unknown): value is ArtifactKind {
	return typeof value === "string" && (ARTIFACT_KINDS as readonly string[]).includes(value);
}

export function readArtifactToolInput(value: unknown): ArtifactToolInput | undefined {
	if (!Value.Check(ArtifactToolInputSchema, value)) return undefined;
	if (value.action === "update" && (!value.artifactId || value.baseVersion < 1)) return undefined;
	return value;
}

export function readArtifactToolError(value: unknown): ArtifactToolError | undefined {
	return Value.Check(ArtifactToolErrorSchema, value) ? value : undefined;
}

export function artifactToolError(
	code: ArtifactToolErrorCode,
	message: string,
	extras: Omit<ArtifactToolError, "ok" | "code" | "message"> = {},
): ArtifactToolError {
	return { ok: false, code, message, ...extras };
}

export function formatArtifactToolResult(result: CodingAgentArtifactFunctionResult): RuntimeToolResult {
	if (!result.ok) {
		return {
			content: [{ type: "text", text: formatArtifactToolError(result) }],
			details: result,
			isError: true,
		};
	}
	return {
		content: [{ type: "text", text: formatArtifactToolSuccess(result) }],
		details: result,
	};
}

function formatArtifactToolSuccess(result: ArtifactToolSuccess): string {
	if (result.action === "list") {
		const items = result.items ?? [];
		if (items.length === 0) return "No canvas artifacts in this workspace.";
		return [
			`Found ${items.length} artifact(s).`,
			...items.map(
				(item) =>
					`- ${item.title} (${item.kind}) id=${item.artifactId} v${item.version}${item.sourceTaskId ? ` task=${item.sourceTaskId}` : ""}`,
			),
		].join("\n");
	}
	if (result.action === "get") {
		return [
			`Artifact ${result.title ?? result.artifactId} v${result.version ?? "?"} (${result.kind ?? "document"}).`,
			result.content ?? "",
		]
			.filter((line) => line.length > 0)
			.join("\n\n");
	}
	if (result.action === "attach_to_task") {
		return `Attached artifact "${result.title ?? result.artifactId}" to the active task.`;
	}
	return `Artifact "${result.title ?? result.artifactId}" ${result.action}d as v${result.version ?? "?"}.`;
}

function formatArtifactToolError(error: ArtifactToolError): string {
	if (error.code === "stale_version") {
		return `stale_version: artifact ${error.artifactId ?? "unknown"} is now v${error.currentVersion ?? "?"}; re-read and retry with that baseVersion.`;
	}
	if (error.code === "missing_file") {
		return `missing_file: artifact ${error.artifactId ?? "unknown"} file is missing.`;
	}
	if (error.code === "no_active_task") {
		return "no_active_task: this session has no active task to attach the artifact to.";
	}
	return `${error.code}: ${error.message}`;
}
