import { type Static, Type } from "@sinclair/typebox";
import type { RuntimeToolDefinition, RuntimeToolResult } from "@vetta/runtime-core/kernel";
import { defineSessionExtensionFunction } from "@vetta/runtime-core/session-extensions";
import {
	FILE_ORGANIZE_TOOL_NAME,
	type FileOrganizeOutcome,
	type FileOrganizePlan,
	readFileOrganizePlan,
} from "./contracts.js";

/**
 * 文件整理工具（TASK-0018）：模型只产出**计划**；审阅与执行全部经宿主端口。
 * 端口先向用户展示完整变更预览，确认后按文件执行并返回逐文件终态；
 * 未确认不写入，取消/部分失败保留结果，重试按终态跳过已成功项。
 */

export const CODING_AGENT_FILE_ORGANIZE_EXTENSION_ID = "coding-agent.file-organize";

export interface CodingAgentFileOrganizeFunctionRequest {
	readonly sessionId: string;
	readonly turnId: string;
	readonly plan: FileOrganizePlan;
}

export const CODING_AGENT_FILE_ORGANIZE_FUNCTION = defineSessionExtensionFunction<
	CodingAgentFileOrganizeFunctionRequest,
	FileOrganizeOutcome
>(CODING_AGENT_FILE_ORGANIZE_EXTENSION_ID, "organize");

export const FileOrganizeToolInputSchema = Type.Object({
	description: Type.Optional(Type.String()),
	operations: Type.Array(
		Type.Object({
			type: Type.Union([Type.Literal("rename"), Type.Literal("move")]),
			from: Type.String({ description: "Current file path (relative to the project root)" }),
			to: Type.String({ description: "New path (relative to the project root)" }),
			reason: Type.Optional(Type.String()),
		}),
		{ minItems: 1, maxItems: 500, description: "Planned operations; every entry is shown to the user for review" },
	),
});

export type FileOrganizeToolInput = Static<typeof FileOrganizeToolInputSchema>;

export const FILE_ORGANIZE_TOOL_DESCRIPTION = [
	"Plan a batch of file organization operations (classification renames / moves) for review.",
	"Nothing is written until the user reviews the full plan and confirms; present every operation",
	"with a short reason. On partial failure the result lists a final status per file — retry only",
	"the entries that did not succeed; already-applied operations are never repeated.",
].join("\n");

export interface FileOrganizeToolOptions {
	readonly invoke: (
		request: CodingAgentFileOrganizeFunctionRequest,
		signal: AbortSignal,
	) => Promise<FileOrganizeOutcome | undefined>;
}

export function createFileOrganizeTool(options: FileOrganizeToolOptions): RuntimeToolDefinition<FileOrganizeToolInput> {
	return {
		name: FILE_ORGANIZE_TOOL_NAME,
		label: "file organizer",
		description: FILE_ORGANIZE_TOOL_DESCRIPTION,
		inputSchema: FileOrganizeToolInputSchema,
		validateInput: (input) => {
			const plan = readFileOrganizePlan(input);
			if (!plan) throw new Error("invalid organize plan: every operation needs distinct from/to paths");
			return input as FileOrganizeToolInput;
		},
		async execute({ input, sessionId, turnId, signal }): Promise<RuntimeToolResult> {
			const plan = readFileOrganizePlan(input);
			if (!plan) {
				return { content: [{ type: "text", text: "Error: invalid organize plan." }], isError: true };
			}
			const outcome = await options.invoke({ sessionId, turnId, plan }, signal);
			if (!outcome) {
				return {
					content: [{ type: "text", text: "File organization is unavailable in this session." }],
					isError: true,
				};
			}
			if (!outcome.confirmed) {
				return { content: [{ type: "text", text: "The user rejected the plan; nothing was changed." }] };
			}
			return { content: [{ type: "text", text: formatOutcome(outcome) }] };
		},
	};
}

function formatOutcome(outcome: FileOrganizeOutcome): string {
	const counts = new Map<string, number>();
	for (const item of outcome.items) counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
	const summary = [...counts.entries()].map(([status, count]) => `${status}: ${count}`).join(", ");
	const lines = outcome.items.map(
		(item) => `- ${item.from} -> ${item.to}: ${item.status}${item.error ? ` (${item.error})` : ""}`,
	);
	return [`Organize complete (${summary}).`, ...lines].join("\n");
}
