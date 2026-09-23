// Copyright The Open Forge contributors.
import { type Static, Type } from "@sinclair/typebox";
import type { RuntimeToolDefinition, RuntimeToolResult } from "@vetta/runtime-core/kernel";
import { defineSessionExtensionFunction } from "@vetta/runtime-core/session-extensions";

/**
 * Artifact 登记（TASK-0019）：模型把本轮产出（测试结果、报告、生成文件）
 * 登记为会话任务的产出物。工具不写文件——文件已由真实工具产出，
 * 这里只登记 descriptor（TASK-0008：文件内容是事实源）。
 */

export const CODING_AGENT_ATTACH_ARTIFACT_EXTENSION_ID = "coding-agent.attach-artifact";

export interface CodingAgentAttachArtifactRequest {
	readonly sessionId: string;
	readonly turnId: string;
	readonly kind: "document" | "dataset" | "analysis" | "code-change" | "execution-result" | "research-evidence";
	readonly title: string;
	readonly uri: string;
	readonly contentType?: string;
}

export type CodingAgentAttachArtifactResult = { readonly attached: boolean; readonly reason?: string };

export const CODING_AGENT_ATTACH_ARTIFACT_FUNCTION = defineSessionExtensionFunction<
	CodingAgentAttachArtifactRequest,
	CodingAgentAttachArtifactResult
>(CODING_AGENT_ATTACH_ARTIFACT_EXTENSION_ID, "attach");

export const ATTACH_ARTIFACT_TOOL_NAME = "attach_artifact";

export const AttachArtifactToolInputSchema = Type.Object({
	description: Type.Optional(Type.String()),
	kind: Type.Union(
		[
			Type.Literal("document"),
			Type.Literal("dataset"),
			Type.Literal("analysis"),
			Type.Literal("code-change"),
			Type.Literal("execution-result"),
			Type.Literal("research-evidence"),
		],
		{ description: "Artifact kind; use execution-result for test runs and command outputs" },
	),
	title: Type.String({ description: "Human-readable artifact title" }),
	uri: Type.String({ description: "Path of the produced file, relative to the project root" }),
	contentType: Type.Optional(Type.String()),
});

export type AttachArtifactToolInput = Static<typeof AttachArtifactToolInputSchema>;

export const ATTACH_ARTIFACT_TOOL_DESCRIPTION = [
	"Register a produced file as a deliverable artifact of the current task (e.g. test output, report,",
	"generated document). The file must already exist; this only records it in the task's deliverable",
	"list so the user can review and export it. Use kind=execution-result for test runs.",
].join("\n");

export interface AttachArtifactToolOptions {
	readonly invoke: (
		request: CodingAgentAttachArtifactRequest,
		signal: AbortSignal,
	) => Promise<CodingAgentAttachArtifactResult | undefined>;
}

export function createAttachArtifactTool(
	options: AttachArtifactToolOptions,
): RuntimeToolDefinition<AttachArtifactToolInput> {
	return {
		name: ATTACH_ARTIFACT_TOOL_NAME,
		label: "attach artifact",
		description: ATTACH_ARTIFACT_TOOL_DESCRIPTION,
		inputSchema: AttachArtifactToolInputSchema,
		async execute({ input, sessionId, turnId, signal }): Promise<RuntimeToolResult> {
			const outcome = await options.invoke(
				{
					sessionId,
					turnId,
					kind: input.kind,
					title: input.title,
					uri: input.uri,
					...(input.contentType ? { contentType: input.contentType } : {}),
				},
				signal,
			);
			if (!outcome) {
				return {
					content: [{ type: "text", text: "Artifact registration is unavailable in this session." }],
					isError: true,
				};
			}
			if (!outcome.attached) {
				return {
					content: [
						{
							type: "text",
							text: `Artifact not attached: ${outcome.reason ?? "no active task in this session"}.`,
						},
					],
					isError: true,
				};
			}
			return { content: [{ type: "text", text: `Attached artifact "${input.title}" (${input.kind}).` }] };
		},
	};
}
